import { sdk } from './sdk'

// No dependencies. (8.2504.0:1 and :2 had an optional Vaultwarden on this
// server; rbw 1.15.0 cannot sign in to the Vaultwarden versions StartOS
// ships, so that option was removed in :3.)
export const dependencies = sdk.Dependencies.of()
