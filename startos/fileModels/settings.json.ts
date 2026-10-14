import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// Settings, written by Configure Receiver and Configure NAS Copy and read by
// main.ts and interfaces.ts. Every value has a default, so a
// missing or damaged file still yields a working receiver. Passwords are not
// kept here but in secrets.json.
export const FOLDER_NAMINGS = ['short', 'full', 'ip'] as const
export type FolderNaming = (typeof FOLDER_NAMINGS)[number]

export const CREDENTIAL_SOURCES = ['manual', 'vaultwarden-url'] as const
export type CredentialSource = (typeof CREDENTIAL_SOURCES)[number]

export type AllowedSender = { address: string; label: string }

export const DEFAULT_SETTINGS = {
  port: 5514,
  udp: true,
  tcp: true,
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
  vaultEmail: '',
  vaultUrl: '',
  vaultIp: '',
  vaultCa: '',
}

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
  vaultEmail: z.string().catch(DEFAULT_NAS.vaultEmail),
  vaultUrl: z.string().catch(DEFAULT_NAS.vaultUrl),
  vaultIp: z.string().catch(DEFAULT_NAS.vaultIp),
  vaultCa: z.string().catch(DEFAULT_NAS.vaultCa),
})

const shape = z.looseObject({
  port: z.number().int().min(1025).max(65535).catch(DEFAULT_SETTINGS.port),
  udp: z.boolean().catch(DEFAULT_SETTINGS.udp),
  tcp: z.boolean().catch(DEFAULT_SETTINGS.tcp),
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
      }),
    )
    .catch([]),
  nas: nasShape.catch(DEFAULT_NAS),
})

export type Settings = z.infer<typeof shape>
export type NasSettings = z.infer<typeof nasShape>

export const settingsJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: 'settings.json' },
  shape,
)
