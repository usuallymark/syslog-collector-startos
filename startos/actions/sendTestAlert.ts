import { mkdir, writeFile } from 'node:fs/promises'
import { settingsJson } from '../fileModels/settings.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { ALERT_TEST } from '../utils'

export const sendTestAlert = sdk.Action.withoutInput(
  'send-test-alert',

  async ({ effects }) => {
    const enabled =
      (await settingsJson.read((s) => s.alerts.enabled).const(effects)) ?? false
    return {
      name: i18n('Send Test Alert'),
      description: i18n(
        'Send a test notification to your ntfy topic, also in dry run, to check that alerts reach your phone.',
      ),
      warning: null,
      allowedStatuses: 'only-running',
      group: null,
      visibility: enabled
        ? 'enabled'
        : { disabled: i18n('Turn on alerts in Configure Alerts first.') },
    }
  },

  async () => {
    await mkdir(sdk.volumes.main.subpath('state'), { recursive: true })
    await writeFile(sdk.volumes.main.subpath(ALERT_TEST), '')
    return {
      version: '1' as const,
      title: i18n('Test Alert Queued'),
      message: i18n(
        'It is sent within a few seconds. If it does not arrive, the Alerts health check shows why.',
      ),
      result: null,
    }
  },
)
