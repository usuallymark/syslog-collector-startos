import { chmod } from 'node:fs/promises'
import { FileHelper, T, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// Passwords entered in Configure NAS Copy and Configure Alerts: the only place they are stored.
// Root-only, kept apart from settings.json, never shown again in a form (a
// blank field there keeps the saved value). collector.py and rbw's pinentry
// read them from here.
const shape = z.looseObject({
  nasPassword: z.string().catch(''),
  vaultMasterPassword: z.string().catch(''),
  ntfyToken: z.string().catch(''),
})

export const secretsJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: 'secrets.json' },
  shape,
)

export type Secrets = {
  nasPassword: string
  vaultMasterPassword: string
  ntfyToken: string
}

/** Write the secrets and make the file readable by root only. */
export async function writeSecrets(effects: T.Effects, secrets: Secrets) {
  await secretsJson.write(effects, secrets)
  await restrictSecrets()
}

export async function restrictSecrets() {
  await chmod(sdk.volumes.main.subpath('secrets.json'), 0o600).catch(() => {})
}
