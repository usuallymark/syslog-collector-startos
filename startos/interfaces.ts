import { settingsJson } from './fileModels/settings.json'
import { i18n } from './i18n'
import { sdk } from './sdk'
import { SYSLOG_PORT } from './utils'

export const syslogHostId = 'syslog'
export const syslogInterfaceId = 'syslog'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  // The port senders use. StartOS forwards both UDP and TCP on it to
  // rsyslog's fixed internal port. If the chosen port is already taken on the
  // server, StartOS assigns a random one instead; the receiver health check
  // reports that.
  const port =
    (await settingsJson.read((s) => s.port).const(effects)) ?? SYSLOG_PORT

  const origin = await sdk.MultiHost.of(effects, syslogHostId).bindPort(
    SYSLOG_PORT,
    {
      protocol: null,
      addSsl: null,
      preferredExternalPort: port,
      // Plain syslog is unencrypted. `ssl: false` publishes it on the LAN
      // addresses the user enables, where devices can reach it.
      secure: { ssl: false },
    },
  )

  const syslog = sdk.createInterface(effects, {
    name: i18n('Syslog'),
    id: syslogInterfaceId,
    description: i18n(
      'Where your devices send their logs: syslog over UDP and TCP on this address and port',
    ),
    type: 'api',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })

  return [await origin.export([syslog])]
})
