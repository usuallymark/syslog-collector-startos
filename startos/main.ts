import { readdir, stat, statfs, writeFile } from 'node:fs/promises'
import { DEFAULT_SETTINGS, settingsJson } from './fileModels/settings.json'
import { i18n } from './i18n'
import { syslogHostId } from './interfaces'
import { rsyslogConf } from './rsyslogConf'
import { sdk } from './sdk'
import { LOGS_DIR, RSYSLOG_CONF, SYSLOG_PORT } from './utils'

const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.log$/

// The logs folder as the package's own code sees it (outside the container).
const logsPath = sdk.volumes.main.subpath('logs')

/** A duration as "3 min", "2 h 5 min" or "1 d 4 h". */
function age(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000))
  if (min < 1) return i18n('less than a minute')
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ${min % 60} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}

/** The most recently written daily file: its sender folder and its time. */
async function newestMessage(): Promise<{ sender: string; at: number } | null> {
  const senders = await readdir(logsPath).catch(() => [] as string[])
  let newest: { sender: string; at: number } | null = null
  for (const sender of senders) {
    const days = (
      await readdir(`${logsPath}/${sender}`).catch(() => [] as string[])
    )
      .filter((d) => DAY_FILE.test(d))
      .sort()
    const last = days[days.length - 1]
    if (!last) continue
    const s = await stat(`${logsPath}/${sender}/${last}`).catch(() => null)
    if (s && (!newest || s.mtimeMs > newest.at)) {
      newest = { sender, at: s.mtimeMs }
    }
  }
  return newest
}

/** Total size of the daily files, in bytes. */
async function logsSize(): Promise<number> {
  let total = 0
  const senders = await readdir(logsPath).catch(() => [] as string[])
  for (const sender of senders) {
    const days = await readdir(`${logsPath}/${sender}`).catch(
      () => [] as string[],
    )
    for (const d of days) {
      const s = await stat(`${logsPath}/${sender}/${d}`).catch(() => null)
      if (s?.isFile()) total += s.size
    }
  }
  return total
}

function size(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Log Collector'))

  // Reactive: saving Configure Receiver restarts the service with the new
  // settings.
  const settings = {
    ...DEFAULT_SETTINGS,
    ...((await settingsJson.read().const(effects)) ?? {}),
  }
  const protocols = [settings.udp && 'UDP', settings.tcp && 'TCP']
    .filter(Boolean)
    .join(' + ')

  const sub = await sdk.SubContainer.of(
    effects,
    { imageId: 'rsyslog' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'main',
      subpath: null,
      mountpoint: '/data',
      readonly: false,
    }),
    'rsyslog-sub',
  )

  await writeFile(
    `${await sub.rootfs}${RSYSLOG_CONF}`,
    rsyslogConf({
      port: SYSLOG_PORT,
      udp: settings.udp,
      tcp: settings.tcp,
      folderNaming: settings.folderNaming,
      logsDir: LOGS_DIR,
    }),
  )

  const env = { TZ: settings.timezone }

  return sdk.Daemons.of(effects)
    .addDaemon('receiver', {
      subcontainer: sub,
      // Restart rsyslog whenever any setting changes: its configuration file
      // and the ready check depend on all of them.
      uses: settings,
      exec: {
        command: ['rsyslogd', '-n', '-iNONE', '-f', RSYSLOG_CONF],
        env,
      },
      ready: {
        display: i18n('Receiver'),
        fn: async () => {
          const listening = await sdk.healthCheck.checkPortListening(
            effects,
            SYSLOG_PORT,
            {
              successMessage: '',
              errorMessage: i18n('rsyslog is not listening yet'),
            },
          )
          if (listening.result !== 'success') return listening
          const external = await sdk.host
            .getOwn(
              effects,
              syslogHostId,
              (h) => h?.bindings[SYSLOG_PORT]?.net.assignedPort ?? null,
            )
            .once()
          if (external !== null && external !== settings.port) {
            return {
              result: 'failure',
              message: i18n(
                'Port ${chosen} is already used on this server, so StartOS assigned port ${assigned}. Choose another port in Configure Receiver, or point your devices at ${assigned}.',
                { chosen: String(settings.port), assigned: String(external) },
              ),
            }
          }
          return {
            result: 'success',
            message: i18n('Listening on port ${port} (${protocols})', {
              port: String(external ?? settings.port),
              protocols,
            }),
          }
        },
      },
      requires: [],
    })
    .addDaemon('housekeeping', {
      subcontainer: sub,
      uses: { days: settings.retentionDays, tz: settings.timezone },
      exec: {
        command: ['housekeeping', String(settings.retentionDays)],
        env,
      },
      ready: {
        display: null,
        fn: () => ({ result: 'success', message: '' }),
      },
      requires: [],
    })
    .addHealthCheck('last-message', {
      ready: {
        display: i18n('Last Message'),
        trigger: sdk.trigger.statusTrigger(60_000, { starting: 5_000 }),
        fn: async () => {
          const newest = await newestMessage()
          if (!newest) {
            return {
              result: 'loading',
              message: i18n(
                'No messages received yet. Point a device at the Syslog address.',
              ),
            }
          }
          return {
            result: 'success',
            message: i18n('${age} ago, from ${sender}', {
              age: age(Date.now() - newest.at),
              sender: newest.sender,
            }),
          }
        },
      },
      requires: ['receiver'],
    })
    .addHealthCheck('storage', {
      ready: {
        display: i18n('Log Storage'),
        trigger: sdk.trigger.statusTrigger(300_000, { starting: 5_000 }),
        fn: async () => {
          const used = await logsSize()
          const fs = await statfs(sdk.volumes.main.path)
          const free = fs.bavail * fs.bsize
          const total = fs.blocks * fs.bsize
          const message = i18n('${used} of logs, ${free} free on the disk', {
            used: size(used),
            free: size(free),
          })
          // Below 5% free, writes are close to failing.
          if (total > 0 && free / total < 0.05) {
            return {
              result: 'failure',
              message: i18n(
                'Disk almost full: ${details}. Lower the retention days in Configure Receiver or free up space.',
                { details: message },
              ),
            }
          }
          return { result: 'success', message }
        },
      },
      requires: [],
    })
})
