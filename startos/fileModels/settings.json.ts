import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// Receiver settings, written by Configure Receiver and read by main.ts and
// interfaces.ts. Every value has a default, so a missing or damaged file
// still yields a working receiver.
export const FOLDER_NAMINGS = ['hostname', 'ip'] as const
export type FolderNaming = (typeof FOLDER_NAMINGS)[number]

export const DEFAULT_SETTINGS = {
  port: 5514,
  udp: true,
  tcp: true,
  folderNaming: 'hostname' as FolderNaming,
  retentionDays: 3,
  timezone: 'UTC',
}

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
})

export type Settings = z.infer<typeof shape>

export const settingsJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: 'settings.json' },
  shape,
)
