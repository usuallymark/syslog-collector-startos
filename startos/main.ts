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
  type AlertSettings,
  DEFAULT_ALERTS,
  DEFAULT_NAS,
  DEFAULT_SETTINGS,
  DEFAULT_VAULTWARDEN,
  type NasSettings,
  type VaultwardenSettings,
  settingsJson,
} from './fileModels/settings.json'
import { i18n } from './i18n'
import { syslogHostId } from './interfaces'
import { rsyslogConf } from './rsyslogConf'
import { parseSender, singleAddress } from './senders'
import { sdk } from './sdk'
import {
  ALERTS_STATUS,
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

type AlertStatus = {
  rules?: number
  queued?: number
  lastError?: string | null
  lastRecorded?: { time: string; rule: string; device: string }
}

async function readAlertStatus(): Promise<AlertStatus> {
  try {
    return JSON.parse(
      await readFile(sdk.volumes.main.subpath(ALERTS_STATUS), 'utf8'),
    ) as AlertStatus
  } catch {
    return {}
  }
}

/** alerter.py's settings (the "alerts" section of collector.json). The token
 * stays in secrets.json. */
function alertsConfig(
  a: AlertSettings,
  watched: { ip: string; name: string; minutes: number }[],
) {
  return {
    enabled: a.enabled,
    dryRun: a.dryRun,
    cooldownMinutes: a.cooldownMinutes,
    nasFolder: a.enabled ? a.nasFolder : '',
    ntfy: {
      url: a.ntfyUrl,
      topic: a.ntfyTopic,
      tokenSource: a.tokenSource,
      vaultItem: a.tokenVaultItem,
      vaultField: a.tokenVaultField,
    },
    rules: a.rules,
    custom: a.custom,
    watched,
  }
}

/** collector.py's NAS settings, or null while the copy is off. Passwords
 * are not included: collector.py reads them from secrets.json. */
function collectorNas(nas: NasSettings) {
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
        : { source: 'vaultwarden', item: nas.vaultItem },
  }
}

// Vaultwarden health check: unlock (signs in if needed), then sync. Exit 10
// when the vault cannot be unlocked, 20 when the sync fails.
const VAULT_PROBE = `
if ! err=$(timeout 60 rbw unlock 2>&1 >/dev/null) || ! rbw unlocked >/dev/null 2>&1; then
  printf '%s\\n' "\${err:-unlock failed or timed out}" | tail -n 1 >&2
  exit 10
fi
if ! err=$(timeout 60 rbw sync 2>&1 >/dev/null); then
  printf '%s\\n' "\${err:-sync timed out}" | tail -n 1 >&2
  exit 20
fi
`

const HOSTS_BEGIN = '# BEGIN Log Collector host mapping'
const HOSTS_END = '# END Log Collector host mapping'

/** /etc/hosts with our block (re)placed at the end. */
function withHostsBlock(
  existing: string,
  mappings: { host: string; ip: string }[],
): string {
  const re = new RegExp(`\\n?${HOSTS_BEGIN}[\\s\\S]*?${HOSTS_END}\\n?`, 'g')
  const base = existing.replace(re, '\n').trimEnd()
  const lines = mappings.map((m) => `${m.ip}\t${m.host}`)
  return [base, HOSTS_BEGIN, ...lines, HOSTS_END].join('\n') + '\n'
}

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Log Collector'))

  // Reactive: saving an action restarts the service with the new settings.
  const stored = await settingsJson.read().const(effects)
  const settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
  const nas: NasSettings = { ...DEFAULT_NAS, ...(stored?.nas ?? {}) }
  const vault: VaultwardenSettings = {
    ...DEFAULT_VAULTWARDEN,
    ...(stored?.vaultwarden ?? {}),
  }
  const vaultBaseUrl = vault.enabled && vault.url ? vault.url : null

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

  const alerts: AlertSettings = {
    ...DEFAULT_ALERTS,
    ...(stored?.alerts ?? {}),
  } as AlertSettings
  // "Logging stopped" watches each single address on the allow-list that has
  // its own silence limit, named by its label.
  const watched = settings.allowedSenders.flatMap((s) => {
    const ip = singleAddress(s.address)
    return ip && s.silentMinutes
      ? [{ ip, name: s.label || ip, minutes: s.silentMinutes }]
      : []
  })

  const collectorConfig = {
    localRetentionDays: settings.retentionDays,
    allowList: allowed.length > 0,
    nas: collectorNas(nas),
    vault: vaultBaseUrl ? { email: vault.email, baseUrl: vaultBaseUrl } : null,
    alerts: alertsConfig(alerts, watched),
  }
  await writeFile(
    `${rootfs}${COLLECTOR_CONF}`,
    JSON.stringify(collectorConfig, null, 2),
    { mode: 0o600 },
  )

  // rbw: its configuration. The master password stays in secrets.json, where
  // the pinentry reads it.
  const pusherEnv: Record<string, string> = { ...RBW_ENV }
  if (vaultBaseUrl) {
    await mkdir(sdk.volumes.main.subpath('rbw/config/rbw'), {
      recursive: true,
      mode: 0o700,
    })
    await writeFile(
      sdk.volumes.main.subpath('rbw/config/rbw/config.json'),
      JSON.stringify({
        email: vault.email,
        base_url: vaultBaseUrl,
        lock_timeout: 3600,
        pinentry: '/usr/local/bin/pinentry-file',
      }),
    )
  }
  // .local names StartOS cannot look up (Vaultwarden's, ntfy's): mapped to
  // the IPs entered.
  const mappings: { host: string; ip: string }[] = []
  if (vaultBaseUrl && vault.ip) {
    mappings.push({ host: new URL(vaultBaseUrl).hostname, ip: vault.ip })
  }
  if (alerts.enabled && alerts.ntfyUrl && alerts.ntfyIp) {
    mappings.push({ host: new URL(alerts.ntfyUrl).hostname, ip: alerts.ntfyIp })
  }
  if (mappings.length) {
    const hostsPath = `${rootfs}/etc/hosts`
    const existing = await readFile(hostsPath, 'utf8').catch(() => '')
    await writeFile(hostsPath, withHostsBlock(existing, mappings))
  }
  // Own certificate authorities (Vaultwarden's, ntfy's): trusted on top of
  // the system ones, by rbw and by the alert sender.
  const extraCas = [
    vaultBaseUrl ? vault.ca : '',
    alerts.enabled ? alerts.ntfyCa : '',
  ]
    .map((c) => c.trim())
    .filter(Boolean)
  if (extraCas.length) {
    const system = await readFile(
      `${rootfs}/etc/ssl/certs/ca-certificates.crt`,
      'utf8',
    ).catch(() => '')
    await writeFile(
      `${rootfs}${CA_BUNDLE}`,
      [system.trimEnd(), ...extraCas].join('\n') + '\n',
    )
    pusherEnv.SSL_CERT_FILE = CA_BUNDLE
  }

  const tz = { TZ: settings.timezone }

  return (
    sdk.Daemons.of(effects)
      .addDaemon('receiver', {
        subcontainer: sub,
        // Restart rsyslog whenever any receiver setting changes: its
        // configuration file and the ready check depend on them.
        uses: {
          port: settings.port,
          udp: settings.udp,
          tcp: settings.tcp,
          folderNaming: settings.folderNaming,
          timezone: settings.timezone,
          allowed,
        },
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
      // Start the rbw agent afresh and sign in again when the Vaultwarden
      // account or address changed, before anything reads from the vault.
      .addOneshot('vault-prepare', {
        subcontainer: sub,
        exec: {
          command: ['collector', 'vault-prepare'],
          env: { ...tz, ...pusherEnv },
        },
        requires: [],
      })
      .addDaemon('pusher', {
        subcontainer: sub,
        uses: {
          nas: collectorConfig.nas,
          nasFolder: collectorConfig.alerts.nasFolder,
          vault: collectorConfig.vault,
          pusherEnv,
          mappings,
          cas: extraCas,
        },
        exec: {
          command: ['collector', 'push'],
          env: { ...tz, ...pusherEnv },
        },
        ready: {
          display: null,
          fn: () => ({ result: 'success', message: '' }),
        },
        requires: ['vault-prepare'],
      })
      .addDaemon('alerter', {
        subcontainer: sub,
        uses: {
          alerts: collectorConfig.alerts,
          nas: !!collectorConfig.nas,
          vault: collectorConfig.vault,
          mappings,
          pusherEnv,
          tz: settings.timezone,
        },
        exec: {
          command: ['collector', 'alerts'],
          env: { ...tz, ...pusherEnv },
        },
        ready: {
          display: null,
          fn: () => ({ result: 'success', message: '' }),
        },
        requires: ['vault-prepare'],
      })
      .addHealthCheck('vaultwarden', {
        ready: {
          display: i18n('Vaultwarden'),
          trigger: sdk.trigger.statusTrigger(300_000, {
            starting: 5_000,
            failure: 60_000,
          }),
          fn: async () => {
            if (!vaultBaseUrl) {
              return {
                result: 'disabled',
                message: i18n('Not set up. Configure Vaultwarden to use it.'),
              }
            }
            const res = await sub.exec(['sh', '-c', VAULT_PROBE], {
              env: pusherEnv,
            })
            const err = String(res.stderr).trim().split('\n').pop() ?? ''
            if (res.exitCode === 10) {
              return {
                result: 'failure',
                message: i18n(
                  'Cannot sign in or unlock: ${error}. Check the URL, email and master password. rbw 1.15.0 works with Vaultwarden up to 1.35.x.',
                  { error: err || 'unknown error' },
                ),
              }
            }
            if (res.exitCode !== 0) {
              return {
                result: 'failure',
                message: i18n(
                  'Unlocked, but the sync failed: ${error}. Secrets come from the last copy until it works again.',
                  { error: err || 'unknown error' },
                ),
              }
            }
            return {
              result: 'success',
              message: i18n('Unlocked and synced (${host})', {
                host: new URL(vaultBaseUrl).host,
              }),
            }
          },
        },
        requires: ['vault-prepare'],
      })
      .addHealthCheck('alerts', {
        ready: {
          display: i18n('Alerts'),
          trigger: sdk.trigger.statusTrigger(30_000, { starting: 5_000 }),
          fn: async () => {
            if (!alerts.enabled) {
              return {
                result: 'disabled',
                message: i18n('Off. Turn them on in Configure Alerts.'),
              }
            }
            const s = await readAlertStatus()
            const rules = String(s.rules ?? 0)
            if (s.queued && s.lastError) {
              return {
                result: 'failure',
                message: i18n(
                  'Cannot deliver: ${error}. ${queued} alert(s) waiting; retried with backoff.',
                  { error: s.lastError, queued: String(s.queued) },
                ),
              }
            }
            const last = s.lastRecorded
              ? i18n('last alert ${age} ago (${rule} on ${device})', {
                  age: age(Date.now() - Date.parse(s.lastRecorded.time)),
                  rule: s.lastRecorded.rule,
                  device: s.lastRecorded.device,
                })
              : i18n('no alerts yet')
            return {
              result: 'success',
              message: alerts.dryRun
                ? i18n('Dry run, ${rules} rule(s): ${last}', { rules, last })
                : i18n('${rules} rule(s) on: ${last}', { rules, last }),
            }
          },
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
  )
})
