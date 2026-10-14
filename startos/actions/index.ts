import { sdk } from '../sdk'
import { configureAlerts } from './configureAlerts'
import { configureNas } from './configureNas'
import { configureReceiver } from './configureReceiver'
import { configureVaultwarden } from './configureVaultwarden'
import { pushNow } from './pushNow'
import { sendTestAlert } from './sendTestAlert'

export const actions = sdk.Actions.of()
  .addAction(configureReceiver)
  .addAction(configureNas)
  .addAction(pushNow)
  .addAction(configureAlerts)
  .addAction(sendTestAlert)
  .addAction(configureVaultwarden)
