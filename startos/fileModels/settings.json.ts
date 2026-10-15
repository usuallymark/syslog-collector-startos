import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// Settings, written by the Configure actions and read by
// main.ts and interfaces.ts. Every value has a default, so a
// missing or damaged file still yields a working receiver. Passwords are not
// kept here but in secrets.json.
export const FOLDER_NAMINGS = ['short', 'full', 'ip'] as const
export type FolderNaming = (typeof FOLDER_NAMINGS)[number]

export const CREDENTIAL_SOURCES = ['manual', 'vaultwarden'] as const
export type CredentialSource = (typeof CREDENTIAL_SOURCES)[number]

// Where Vaultwarden or ntfy runs: at an address the user enters, or as a
// service on this StartOS server, reached over StartOS's internal network.
export const LOCATIONS = ['address', 'local'] as const
export type Location = (typeof LOCATIONS)[number]

// silentMinutes: alert ("Logging stopped") when this sender has sent
// nothing for this long; null: never. Single addresses only.
export type AllowedSender = {
  address: string
  label: string
  silentMinutes: number | null
}

// Suggested for a new allow-list entry; the user clears it for devices that
// only log when something happens.
export const DEFAULT_SILENT_MINUTES = 15
export const MAX_SILENT_MINUTES = 10080

export const DEFAULT_SETTINGS = {
  port: 5514,
  udp: true,
  tcp: true,
  // TLS (RFC 5425) on its own port: off until devices trust the StartOS
  // root CA.
  tls: false,
  tlsPort: 6514,
  folderNaming: 'short' as FolderNaming,
  retentionDays: 3,
  timezone: 'UTC',
  // Empty: accept every sender.
  allowedSenders: [] as AllowedSender[],
}

// The NAS copy starts off and empty: every detail comes from the user.
export const DEFAULT_NAS = {
  enabled: false,
  host: '',
  share: '',
  folder: '',
  intervalMinutes: 60,
  retentionDays: 30,
  credentialSource: 'manual' as CredentialSource,
  username: '',
  vaultItem: '',
}

// Vaultwarden connection, shared by every feature that reads secrets from
// it (NAS login, ntfy token). Off and empty by default.
export const DEFAULT_VAULTWARDEN = {
  enabled: false,
  location: 'address' as Location,
  url: '',
  ip: '',
  ca: '',
  email: '',
}

const vaultwardenShape = z.looseObject({
  enabled: z.boolean().catch(false),
  // Missing before 8.2504.0:9, when every Vaultwarden was at an address.
  location: z.enum(LOCATIONS).catch('address'),
  url: z.string().catch(''),
  ip: z.string().catch(''),
  ca: z.string().catch(''),
  email: z.string().catch(''),
})

// Alerts start off and empty, like the NAS copy. Rule thresholds have
// defaults; priorities are ntfy's 1 (min) to 5 (urgent).
export const TOKEN_SOURCES = ['none', 'manual', 'vaultwarden'] as const
export type TokenSource = (typeof TOKEN_SOURCES)[number]

export type CustomRule = {
  name: string
  pattern: string
  regex: boolean
  devices: string[]
  count: number
  minutes: number
  priority: number
}

export const DEFAULT_RULES = {
  stopped: { on: true, priority: 4 },
  unknownSender: { on: true, priority: 4 },
  severity: { on: true, max: 2, priority: 4 },
  volume: { on: true, factor: 10, minLines: 200, priority: 3 },
  collector: { on: true, priority: 3 },
  authBurst: { on: true, count: 10, minutes: 5, priority: 4 },
}

export const DEFAULT_ALERTS = {
  enabled: false,
  dryRun: false,
  cooldownMinutes: 30,
  ntfyLocation: 'address' as Location,
  ntfyUrl: '',
  ntfyTopic: '',
  ntfyCa: '',
  tokenSource: 'none' as TokenSource,
  tokenVaultItem: '',
  tokenVaultField: 'api_key',
  ntfyIp: '',
  nasFolder: '',
  rules: DEFAULT_RULES,
  custom: [] as CustomRule[],
}

const prio = z.number().int().min(1).max(5)
const ruleShape = <T extends z.ZodRawShape>(
  extra: T,
  d: { on: boolean; priority: number },
) =>
  z
    .looseObject({
      on: z.boolean().catch(d.on),
      priority: prio.catch(d.priority),
      ...extra,
    })
    .catch(d as never)

const R = DEFAULT_RULES
const alertsShape = z.looseObject({
  enabled: z.boolean().catch(false),
  dryRun: z.boolean().catch(false),
  cooldownMinutes: z.number().int().min(1).max(1440).catch(30),
  // Missing before 8.2504.0:9, when every ntfy server was at an address.
  ntfyLocation: z.enum(LOCATIONS).catch('address'),
  ntfyUrl: z.string().catch(''),
  ntfyTopic: z.string().catch(''),
  ntfyCa: z.string().catch(''),
  tokenSource: z.enum(TOKEN_SOURCES).catch('none'),
  tokenVaultItem: z.string().catch(''),
  tokenVaultField: z.string().catch('api_key'),
  ntfyIp: z.string().catch(''),
  nasFolder: z.string().catch(''),
  rules: z
    .looseObject({
      stopped: ruleShape({}, R.stopped),
      unknownSender: ruleShape({}, R.unknownSender),
      severity: ruleShape(
        { max: z.number().int().min(0).max(7).catch(R.severity.max) },
        R.severity,
      ),
      volume: ruleShape(
        {
          factor: z.number().min(2).catch(R.volume.factor),
          minLines: z.number().int().min(1).catch(R.volume.minLines),
        },
        R.volume,
      ),
      collector: ruleShape({}, R.collector),
      authBurst: ruleShape(
        {
          count: z.number().int().min(1).catch(R.authBurst.count),
          minutes: z.number().int().min(1).catch(R.authBurst.minutes),
        },
        R.authBurst,
      ),
    })
    .catch(DEFAULT_RULES as never),
  custom: z
    .array(
      z.looseObject({
        name: z.string(),
        pattern: z.string(),
        regex: z.boolean().catch(false),
        devices: z.array(z.string()).catch([]),
        count: z.number().int().min(1).catch(1),
        minutes: z.number().int().min(1).catch(5),
        priority: prio.catch(4),
      }),
    )
    .catch([]),
})

const nasShape = z.looseObject({
  enabled: z.boolean().catch(DEFAULT_NAS.enabled),
  host: z.string().catch(DEFAULT_NAS.host),
  share: z.string().catch(DEFAULT_NAS.share),
  folder: z.string().catch(DEFAULT_NAS.folder),
  intervalMinutes: z
    .number()
    .int()
    .min(5)
    .max(1440)
    .catch(DEFAULT_NAS.intervalMinutes),
  retentionDays: z
    .number()
    .int()
    .min(1)
    .max(36500)
    .catch(DEFAULT_NAS.retentionDays),
  credentialSource: z
    .enum(CREDENTIAL_SOURCES)
    .catch(DEFAULT_NAS.credentialSource),
  username: z.string().catch(DEFAULT_NAS.username),
  vaultItem: z.string().catch(DEFAULT_NAS.vaultItem),
})

const shape = z.looseObject({
  port: z.number().int().min(1025).max(65535).catch(DEFAULT_SETTINGS.port),
  udp: z.boolean().catch(DEFAULT_SETTINGS.udp),
  tcp: z.boolean().catch(DEFAULT_SETTINGS.tcp),
  tls: z.boolean().catch(DEFAULT_SETTINGS.tls),
  tlsPort: z
    .number()
    .int()
    .min(1025)
    .max(65535)
    .catch(DEFAULT_SETTINGS.tlsPort),
  folderNaming: z.enum(FOLDER_NAMINGS).catch(DEFAULT_SETTINGS.folderNaming),
  retentionDays: z
    .number()
    .int()
    .min(1)
    .max(3650)
    .catch(DEFAULT_SETTINGS.retentionDays),
  timezone: z.string().min(1).catch(DEFAULT_SETTINGS.timezone),
  allowedSenders: z
    .array(
      z.looseObject({
        address: z.string(),
        label: z.string().catch(''),
        silentMinutes: z
          .number()
          .int()
          .min(1)
          .max(MAX_SILENT_MINUTES)
          .nullable()
          .catch(null),
      }),
    )
    .catch([]),
  nas: nasShape.catch(DEFAULT_NAS),
  vaultwarden: vaultwardenShape.catch(DEFAULT_VAULTWARDEN),
  alerts: alertsShape.catch(DEFAULT_ALERTS as never),
})

export type Settings = z.infer<typeof shape>
export type NasSettings = z.infer<typeof nasShape>
export type AlertSettings = z.infer<typeof alertsShape>
export type VaultwardenSettings = z.infer<typeof vaultwardenShape>

export const settingsJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: 'settings.json' },
  shape,
)
