import { mkdir, writeFile } from 'node:fs/promises'
import { settingsJson } from '../fileModels/settings.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { PUSH_NOW } from '../utils'

export const pushNow = sdk.Action.withoutInput(
  'push-now',

  async ({ effects }) => {
    const enabled =
      (await settingsJson.read((s) => s.nas.enabled).const(effects)) ?? false
    return {
      name: i18n('Push Now'),
      description: i18n(
        'Copy new and changed log files to the NAS right away instead of waiting for the next scheduled copy.',
      ),
      warning: null,
      allowedStatuses: 'only-running',
      group: null,
      visibility: enabled
        ? 'enabled'
        : {
            disabled: i18n('Turn on the NAS copy in Configure NAS Copy first.'),
          },
    }
  },

  async () => {
    await mkdir(sdk.volumes.main.subpath('state'), { recursive: true })
    await writeFile(sdk.volumes.main.subpath(PUSH_NOW), '')
    return {
      version: '1' as const,
      title: i18n('Copy Started'),
      message: i18n(
        'The copy starts within 10 seconds. The "NAS Copy" health check shows the result.',
      ),
      result: null,
    }
  },
)
