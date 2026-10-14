import { actions } from '../actions'
import { restoreInit } from '../backups'
import { dependencies } from '../dependencies'
import { setInterfaces } from '../interfaces'
import { sdk } from '../sdk'
import { versionGraph } from '../versions'
import { seedSettings } from './seedSettings'
import { taskAllowedSenders } from './taskAllowedSenders'

export const init = sdk.setupInit(
  restoreInit,
  versionGraph,
  seedSettings,
  setInterfaces,
  actions,
  dependencies,
  taskAllowedSenders,
)

export const uninit = sdk.setupUninit(versionGraph)
