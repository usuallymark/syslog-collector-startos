import { sdk } from '../sdk'
import { configureReceiver } from './configureReceiver'

export const actions = sdk.Actions.of().addAction(configureReceiver)
