import { secretsJson, writeSecrets } from '../fileModels/secrets.json'
import { DEFAULT_VAULTWARDEN, settingsJson } from '../fileModels/settings.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const { InputSpec, Value, Variants } = sdk

const PEM_RE = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g

const emailValue = () =>
  Value.text({
    name: i18n('Vaultwarden Account Email'),
    required: true,
    default: null,
    inputmode: 'email',
  })

const masterPasswordValue = () =>
  Value.text({
    name: i18n('Vaultwarden Master Password'),
    description: i18n(
      'Used to unlock the vault. It is stored in a root-only file on this server. Leave blank to keep the password already saved.',
    ),
    required: false,
    default: null,
    masked: true,
  })

// At an address. No defaults: every connection detail comes from the user.
const addressSpec = InputSpec.of({
  url: Value.text({
    name: i18n('Vaultwarden URL'),
    description: i18n(
      'The address you open Vaultwarden at, starting with https://.',
    ),
    required: true,
    default: null,
    placeholder: 'e.g. https://vault.example.lan',
    patterns: [
      {
        regex: '^https?://[^/\\s]+/?$',
        description: i18n(
          'An address such as https://vault.example.lan or https://10.0.0.5:8443, with nothing after the host and port.',
        ),
      },
    ],
  }),
  ip: Value.text({
    name: i18n('Vaultwarden IP Address'),
    description: i18n(
      'Only needed when the URL uses a name ending in .local, which StartOS services cannot look up: the IP address that name stands for. Leave blank otherwise.',
    ),
    required: false,
    default: null,
    placeholder: 'e.g. 10.0.0.5',
    patterns: [
      {
        regex:
          '^((25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(25[0-5]|2[0-4]\\d|1?\\d?\\d)$',
        description: i18n('An IPv4 address, e.g. 10.0.0.5.'),
      },
    ],
  }),
  caCert: Value.textarea({
    name: i18n('Custom CA Certificate'),
    description: i18n(
      "Only needed when Vaultwarden's HTTPS certificate is signed by your own certificate authority, for example the root CA of the StartOS server that runs it. Paste the PEM block from -----BEGIN CERTIFICATE----- to -----END CERTIFICATE-----. It is a public certificate, not a private key.",
    ),
    required: false,
    default: null,
    minRows: 4,
    maxRows: 12,
    placeholder: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
  }),
  email: emailValue(),
  masterPassword: masterPasswordValue(),
})

// Vaultwarden on this server: StartOS gives its address, so only the account.
const localSpec = InputSpec.of({
  email: emailValue(),
  masterPassword: masterPasswordValue(),
})

const inputSpec = InputSpec.of({
  vaultwarden: Value.union({
    name: i18n('Vaultwarden'),
    description: i18n(
      'Read secrets (the NAS login, the ntfy token) from a Vaultwarden or Bitwarden-compatible server instead of storing them here. "On this server": the Vaultwarden service on this StartOS server, with no address or certificate to enter. "At an address": a Vaultwarden anywhere else.',
    ),
    default: 'disabled',
    variants: Variants.of({
      disabled: { name: i18n('Off'), spec: InputSpec.of({}) },
      local: { name: i18n('On this server'), spec: localSpec },
      address: { name: i18n('At an address'), spec: addressSpec },
    }),
  }),
})

const clean = (s: string | null | undefined) => (s ?? '').trim()

export const configureVaultwarden = sdk.Action.withInput(
  'configure-vaultwarden',

  async () => ({
    name: i18n('Configure Vaultwarden'),
    description: i18n(
      'Connect to your Vaultwarden, so the NAS copy and alerts can read their secrets from it.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async () => {
    const v =
      (await settingsJson.read((s) => s.vaultwarden).once()) ??
      DEFAULT_VAULTWARDEN
    if (!v.enabled) {
      return { vaultwarden: { selection: 'disabled', value: {} } } as any
    }
    if (v.location === 'local') {
      return {
        vaultwarden: {
          selection: 'local',
          value: { email: v.email || null, masterPassword: null },
        },
      } as any
    }
    return {
      vaultwarden: {
        selection: 'address',
        value: {
          url: v.url || null,
          ip: v.ip || null,
          caCert: v.ca || null,
          email: v.email || null,
          masterPassword: null, // never shown
        },
      },
    } as any
  },

  async ({ effects, input }) => {
    const settings = await settingsJson.read().once()
    const prev = settings?.vaultwarden ?? DEFAULT_VAULTWARDEN

    if (input.vaultwarden.selection === 'disabled') {
      // Keep the details, so turning it back on needs no retyping.
      await settingsJson.merge(effects, {
        vaultwarden: { ...prev, enabled: false },
      })
      const users = [
        settings?.nas?.enabled &&
          settings.nas.credentialSource === 'vaultwarden',
        settings?.alerts?.enabled &&
          settings.alerts.tokenSource === 'vaultwarden',
      ].some(Boolean)
      return {
        version: '1' as const,
        title: i18n('Vaultwarden Off'),
        message: users
          ? i18n(
              'Vaultwarden is off. The NAS copy or alerts still read secrets from it and will fail until you turn it back on or enter those secrets in their own actions.',
            )
          : i18n('Vaultwarden is off.'),
        result: null,
      }
    }

    // On this server: the address details stay as they were, so switching
    // back to "At an address" needs no retyping.
    let connection: Pick<typeof prev, 'location' | 'url' | 'ip' | 'ca'> = {
      location: 'local',
      url: prev.url,
      ip: prev.ip,
      ca: prev.ca,
    }
    if (input.vaultwarden.selection === 'address') {
      const a = input.vaultwarden.value
      const url = clean(a.url).replace(/\/+$/, '')
      const ip = clean(a.ip)
      const host = new URL(url).hostname
      if (host.endsWith('.local') && !ip) {
        throw new Error(
          i18n(
            '"${host}" ends in .local, which StartOS services cannot look up. Enter the IP address it stands for.',
            { host },
          ),
        )
      }
      const pems = (a.caCert ?? '').match(PEM_RE) ?? []
      if (clean(a.caCert) && !pems.length) {
        throw new Error(
          i18n(
            'The CA certificate must be a PEM block from -----BEGIN CERTIFICATE----- to -----END CERTIFICATE-----.',
          ),
        )
      }
      connection = { location: 'address', url, ip, ca: pems.join('\n') }
    }
    const v = input.vaultwarden.value

    const secrets = (await secretsJson.read().once()) ?? {
      nasPassword: '',
      vaultMasterPassword: '',
      ntfyToken: '',
    }
    const vaultMasterPassword = v.masterPassword
      ? v.masterPassword.replace(/\r?\n$/, '')
      : secrets.vaultMasterPassword
    if (!vaultMasterPassword) {
      throw new Error(i18n('Enter the Vaultwarden master password.'))
    }

    await writeSecrets(effects, { ...secrets, vaultMasterPassword })
    await settingsJson.merge(effects, {
      vaultwarden: {
        enabled: true,
        ...connection,
        email: clean(v.email),
      },
    })

    return {
      version: '1' as const,
      title: i18n('Vaultwarden Configured'),
      message: i18n(
        'Saved. The Vaultwarden health check shows within a minute whether the vault unlocks. Then choose "From Vaultwarden" in Configure NAS Copy or Configure Alerts.',
      ),
      result: null,
    }
  },
)
