import { configureReceiver } from '../actions/configureReceiver'
import { settingsJson } from '../fileModels/settings.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

// While no sender allow-list is saved, ask the user to set one. The receiver
// keeps accepting everyone meanwhile, so a first test still works; the
// Rejected Senders health check shows the danger too. Re-runs whenever the
// list changes, and clears the task once one exists.
export const taskAllowedSenders = sdk.setupOnInit(async (effects) => {
  const senders = await settingsJson
    .read((s) => s.allowedSenders)
    .const(effects)
  if (!senders?.length) {
    await sdk.action.createOwnTask(effects, configureReceiver, 'important', {
      reason: i18n(
        'Every device on your network can write into these logs. Add the devices that send to Log Collector under Allowed Senders.',
      ),
    })
  } else {
    await sdk.action.clearTask(effects, 'syslog-collector:configure-receiver')
  }
})
