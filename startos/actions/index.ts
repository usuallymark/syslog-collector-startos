import { sdk } from '../sdk'
import { configureNas } from './configureNas'
import { configureReceiver } from './configureReceiver'
import { pushNow } from './pushNow'

export const actions = sdk.Actions.of()
  .addAction(configureReceiver)
  .addAction(configureNas)
  .addAction(pushNow)
