import { settingsJson } from './fileModels/settings.json'
import { i18n } from './i18n'
import { sdk } from './sdk'
import { SYSLOG_PORT, SYSLOG_TLS_PORT } from './utils'

export const syslogHostId = 'syslog'
export const syslogInterfaceId = 'syslog'
export const syslogTlsInterfaceId = 'syslog-tls'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  // The port senders use. StartOS forwards both UDP and TCP on it to
  // rsyslog's fixed internal port. If the chosen port is already taken on the
  // server, StartOS assigns a random one instead; the receiver health check
  // reports that.
  const port =
    (await settingsJson.read((s) => s.port).const(effects)) ?? SYSLOG_PORT
  const tls = await settingsJson
    .read((s) => ({ on: s.tls, port: s.tlsPort }))
    .const(effects)

  const host = sdk.MultiHost.of(effects, syslogHostId)
  const origin = await host.bindPort(SYSLOG_PORT, {
    protocol: null,
    addSsl: null,
    preferredExternalPort: port,
    // Plain syslog is unencrypted. `ssl: false` publishes it on the LAN
    // addresses the user enables, where devices can reach it.
    secure: { ssl: false },
  })

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

  const receipts = [await origin.export([syslog])]

  if (tls?.on) {
    // rsyslog serves TLS itself, with a certificate StartOS signs, so the
    // connection reaches it unopened and the sender's real address stays
    // visible to the allow-list. (Letting StartOS end the TLS would hide it.)
    const tlsOrigin = await host.bindPort(SYSLOG_TLS_PORT, {
      protocol: null,
      addSsl: null,
      preferredExternalPort: tls.port,
      secure: { ssl: true },
    })
    const syslogTls = sdk.createInterface(effects, {
      name: i18n('Syslog (TLS)'),
      id: syslogTlsInterfaceId,
      description: i18n(
        'Encrypted syslog over TCP (RFC 5425) on this address and port. Devices must trust the root CA of this StartOS server.',
      ),
      type: 'api',
      masked: false,
      schemeOverride: null,
      username: null,
      path: '',
      query: {},
    })
    receipts.push(await tlsOrigin.export([syslogTls]))
  }

  return receipts
})
