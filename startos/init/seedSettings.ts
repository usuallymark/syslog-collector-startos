import { mkdir } from 'node:fs/promises'
import { DEFAULT_SETTINGS, settingsJson } from '../fileModels/settings.json'
import { sdk } from '../sdk'

// On install, write the default settings so the receiver starts without any
// setup. An existing file (update, restore) is left as the user saved it.
export const seedSettings = sdk.setupOnInit(async (effects) => {
  await mkdir(sdk.volumes.main.subpath('logs'), { recursive: true })
  const current = await settingsJson.read().once()
  if (current === null) {
    await settingsJson.write(effects, DEFAULT_SETTINGS)
  }
})
