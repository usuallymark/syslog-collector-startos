import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// Passwords entered in Configure NAS Copy. Kept apart from settings.json and
// never shown again in a form; a blank field there keeps the saved value.
const shape = z.looseObject({
  nasPassword: z.string().catch(''),
  vaultMasterPassword: z.string().catch(''),
})

export const secretsJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: 'secrets.json' },
  shape,
)
