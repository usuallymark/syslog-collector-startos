import {
  mkdir,
  readFile,
  readdir,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises'
import { restrictSecrets } from './fileModels/secrets.json'
import {
  DEFAULT_NAS,
  DEFAULT_SETTINGS,
  type NasSettings,
  settingsJson,
} from './fileModels/settings.json'
import { i18n } from './i18n'
import { syslogHostId } from './interfaces'
import { rsyslogConf } from './rsyslogConf'
import { parseSender } from './senders'
import { sdk } from './sdk'
import {
  CA_BUNDLE,
  COLLECTOR_CONF,
  LOGS_DIR,
  PUSH_STATE,
  REJECTED_STATE,
  RSYSLOG_STATS,
  RBW_ENV,
  RSYSLOG_CONF,
  SYSLOG_PORT,
} from './utils'

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

type PushState = {
  lastAttempt?: string
  lastSuccess?: string | null
  lastError?: string | null
  target?: string
}

async function readPushState(): Promise<PushState> {
  try {
    return JSON.parse(
      await readFile(sdk.volumes.main.subpath(PUSH_STATE), 'utf8'),
    ) as PushState
  } catch {
    return {}
  }
}

type RejectedState = {
  last?: { ip: string; at: string }
  ips?: Record<string, { total?: number; lastSeen?: string }>
}

async function readRejected(): Promise<RejectedState> {
  try {
    return JSON.parse(
      await readFile(sdk.volumes.main.subpath(REJECTED_STATE), 'utf8'),
    ) as RejectedState
  } catch {
    return {}
  }
}

/** collector.py's NAS settings, or null while the copy is off. Passwords
 * are not included: collector.py reads them from secrets.json. */
function collectorNas(nas: NasSettings, vaultBaseUrl: string | null) {
  if (!nas.enabled) return null
  return {
    host: nas.host,
    share: nas.share,
    folder: nas.folder,
    intervalMinutes: nas.intervalMinutes,
    retentionDays: nas.retentionDays,
    credentials:
      nas.credentialSource === 'manual'
        ? { source: 'manual', username: nas.username }
        : {
            source: nas.credentialSource,
            item: nas.vaultItem,
            email: nas.vaultEmail,
            baseUrl: vaultBaseUrl,
          },
  }
}

const HOSTS_BEGIN = '# BEGIN Log Collector host mapping'
const HOSTS_END = '# END Log Collector host mapping'

/** /etc/hosts with our block (re)placed at the end. */
function withHostsBlock(existing: string, host: string, ip: string): string {
  const re = new RegExp(`\\n?${HOSTS_BEGIN}[\\s\\S]*?${HOSTS_END}\\n?`, 'g')
  const base = existing.replace(re, '\n').trimEnd()
  return [base, HOSTS_BEGIN, `${ip}\t${host}`, HOSTS_END].join('\n') + '\n'
}

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Log Collector'))

  // Reactive: saving an action restarts the service with the new settings.
  const stored = await settingsJson.read().const(effects)
  const settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
  const nas: NasSettings = { ...DEFAULT_NAS, ...(stored?.nas ?? {}) }
  const vaultSource = nas.enabled ? nas.credentialSource : 'manual'

  // Vaultwarden is reached at the URL the user entered.
  const vaultBaseUrl =
    vaultSource === 'vaultwarden-url' ? nas.vaultUrl || null : null

  // secrets.json is root-only (installs from 8.2504.0:1 wrote it readable).
  await restrictSecrets()

  // Valid allow-list entries (the action rejects invalid ones on save).
  const allowed = settings.allowedSenders
    .map((s) => s.address.trim())
    .filter((a) => parseSender(a) !== null)

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
  const rootfs = await sub.rootfs

  await writeFile(
    `${rootfs}${RSYSLOG_CONF}`,
    rsyslogConf({
      port: SYSLOG_PORT,
      udp: settings.udp,
      tcp: settings.tcp,
      folderNaming: settings.folderNaming,
      logsDir: LOGS_DIR,
      allowedSenders: allowed,
      statsFile: RSYSLOG_STATS,
    }),
  )

  const collectorConfig = {
    localRetentionDays: settings.retentionDays,
    allowList: allowed.length > 0,
    nas: collectorNas(nas, vaultBaseUrl),
  }
  await writeFile(
    `${rootfs}${COLLECTOR_CONF}`,
    JSON.stringify(collectorConfig, null, 2),
    { mode: 0o600 },
  )

  // rbw: its configuration. The master password stays in secrets.json, where
  // the pinentry reads it.
  const pusherEnv: Record<string, string> = { ...RBW_ENV }
  if (vaultSource !== 'manual' && vaultBaseUrl) {
    await mkdir(sdk.volumes.main.subpath('rbw/config/rbw'), {
      recursive: true,
      mode: 0o700,
    })
    await writeFile(
      sdk.volumes.main.subpath('rbw/config/rbw/config.json'),
      JSON.stringify({
        email: nas.vaultEmail,
        base_url: vaultBaseUrl,
        lock_timeout: 3600,
        pinentry: '/usr/local/bin/pinentry-file',
      }),
    )
  }
  if (vaultSource === 'vaultwarden-url' && vaultBaseUrl) {
    // A .local name StartOS cannot look up: map it to the IP entered.
    const host = new URL(vaultBaseUrl).hostname
    if (nas.vaultIp) {
      const hostsPath = `${rootfs}/etc/hosts`
      const existing = await readFile(hostsPath, 'utf8').catch(() => '')
      await writeFile(hostsPath, withHostsBlock(existing, host, nas.vaultIp))
    }
    // An own certificate authority: trust it on top of the system ones.
    if (nas.vaultCa) {
      const system = await readFile(
        `${rootfs}/etc/ssl/certs/ca-certificates.crt`,
        'utf8',
      ).catch(() => '')
      await writeFile(
        `${rootfs}${CA_BUNDLE}`,
        `${system.trimEnd()}\n${nas.vaultCa.trim()}\n`,
      )
      pusherEnv.SSL_CERT_FILE = CA_BUNDLE
    }
  }

  const tz = { TZ: settings.timezone }

  return sdk.Daemons.of(effects)
    .addDaemon('receiver', {
      subcontainer: sub,
      // Restart rsyslog whenever any receiver setting changes: its
      // configuration file and the ready check depend on them.
      uses: { ...settings, nas: undefined },
      exec: {
        command: ['rsyslogd', '-n', '-iNONE', '-f', RSYSLOG_CONF],
        env: tz,
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
      uses: collectorConfig,
      exec: {
        command: ['collector', 'housekeeping'],
        env: tz,
      },
      ready: {
        display: null,
        fn: () => ({ result: 'success', message: '' }),
      },
      requires: [],
    })
    .addDaemon('pusher', {
      subcontainer: sub,
      uses: {
        collectorConfig,
        pusherEnv,
        vaultIp: nas.vaultIp,
        ca: nas.vaultCa,
      },
      exec: {
        command: ['collector', 'push'],
        env: { ...tz, ...pusherEnv },
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
    .addHealthCheck('nas-copy', {
      ready: {
        display: i18n('NAS Copy'),
        trigger: sdk.trigger.statusTrigger(30_000, { starting: 5_000 }),
        fn: async () => {
          if (!nas.enabled) {
            return {
              result: 'disabled',
              message: i18n('Off. Turn it on in Configure NAS Copy.'),
            }
          }
          const target = `//${nas.host}/${nas.share}/${nas.folder}`
          const s = await readPushState()
          if (!s.lastAttempt || s.target !== target) {
            return {
              result: 'loading',
              message: i18n('Waiting for the first copy to ${target}', {
                target,
              }),
            }
          }
          const last = s.lastSuccess
            ? i18n('last successful copy ${age} ago', {
                age: age(Date.now() - Date.parse(s.lastSuccess)),
              })
            : i18n('no successful copy yet')
          if (s.lastError) {
            return {
              result: 'failure',
              message: `${s.lastError} (${last})`,
            }
          }
          // More than two intervals without a copy: the copy has stalled.
          const lateMs = (2 * nas.intervalMinutes + 5) * 60_000
          if (
            s.lastSuccess &&
            Date.now() - Date.parse(s.lastSuccess) > lateMs
          ) {
            return {
              result: 'failure',
              message: i18n('No copy for a while: ${last}', { last }),
            }
          }
          return {
            result: 'success',
            message: i18n('Copied ${age} ago to ${target}', {
              age: age(Date.now() - Date.parse(s.lastSuccess ?? '')),
              target,
            }),
          }
        },
      },
      requires: [],
    })
    .addHealthCheck('rejected-senders', {
      ready: {
        display: i18n('Rejected Senders'),
        trigger: sdk.trigger.statusTrigger(60_000, { starting: 5_000 }),
        fn: async () => {
          // An open receiver is a warning, not a choice to be quiet about:
          // anyone on the network can write lines into the logs.
          if (!allowed.length) {
            return {
              result: 'failure',
              message: i18n(
                'Danger: No allow-list: every sender is accepted. Add one in Configure Receiver.',
              ),
            }
          }
          const s = await readRejected()
          const last = s.last
          const entry = last ? s.ips?.[last.ip] : undefined
          if (!last || !entry) {
            return {
              result: 'success',
              message: i18n('None rejected. ${count} allowed sender(s).', {
                count: String(allowed.length),
              }),
            }
          }
          return {
            result: 'success',
            message: i18n(
              'Last rejected: ${ip}, ${age} ago (${total} line(s) dropped from it in the last 30 days)',
              {
                ip: last.ip,
                age: age(Date.now() - Date.parse(last.at)),
                total: String(entry.total ?? 0),
              },
            ),
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
