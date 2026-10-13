import { secretsJson, writeSecrets } from '../fileModels/secrets.json'
import {
  type CredentialSource,
  DEFAULT_NAS,
  type NasSettings,
  settingsJson,
} from '../fileModels/settings.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { INTERVAL_CHOICES } from '../utils'

const { InputSpec, Value, Variants } = sdk

function intervalLabel(min: number): string {
  if (min < 60) return i18n('Every ${n} minutes', { n: String(min) })
  if (min === 60) return i18n('Every hour')
  if (min === 1440) return i18n('Once a day')
  return i18n('Every ${n} hours', { n: String(min / 60) })
}

const intervalValues = Object.fromEntries(
  INTERVAL_CHOICES.map((m) => [String(m), intervalLabel(m)]),
) as Record<string, string>

// The fields both Vaultwarden options share.
function vaultFields() {
  return {
    item: Value.text({
      name: i18n('Vaultwarden Item'),
      description: i18n(
        'The name of a Login item in your vault holding the NAS username and password. It is read before every copy, so a changed password is picked up by itself.',
      ),
      required: true,
      default: null,
    }),
    email: Value.text({
      name: i18n('Vaultwarden Account Email'),
      required: true,
      default: null,
      inputmode: 'email' as const,
    }),
    masterPassword: Value.text({
      name: i18n('Vaultwarden Master Password'),
      description: i18n(
        'Used to unlock the vault before each copy. It is stored in a root-only file on this server. Leave blank to keep the password already saved.',
      ),
      required: false,
      default: null,
      masked: true,
    }),
  }
}

const PEM_RE = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g

// No defaults for the NAS details: the user enters every one of them.
const enabledSpec = InputSpec.of({
  host: Value.text({
    name: i18n('NAS Address'),
    description: i18n(
      'The IP address or hostname of the NAS (SMB, port 445). Names ending in .local usually do not resolve inside StartOS services, so the IP address is the safest choice.',
    ),
    required: true,
    default: null,
    placeholder: 'e.g. 10.0.0.5',
    patterns: [
      {
        regex: '^[A-Za-z0-9.:\\[\\]-]+$',
        description: i18n('An IP address or a hostname only.'),
      },
    ],
  }),
  share: Value.text({
    name: i18n('Share'),
    description: i18n('The name of the shared folder on the NAS.'),
    required: true,
    default: null,
    placeholder: 'e.g. logs',
    patterns: [
      {
        regex: '^[^\\\\/:*?"<>|]+$',
        description: i18n('A share name only, without slashes.'),
      },
    ],
  }),
  folder: Value.text({
    name: i18n('Folder'),
    description: i18n(
      'The folder inside the share for these logs, created if missing; use / for subfolders. Use a folder that holds nothing else: expired YYYY-MM-DD.log files in its device folders are deleted.',
    ),
    required: true,
    default: null,
    placeholder: 'e.g. syslog',
    patterns: [
      {
        regex: '^(?!.*(^|/)\\.\\.(/|$))[^\\\\:*?"<>|]+$',
        description: i18n(
          'A folder path such as syslog or logs/network, without ".." or backslashes.',
        ),
      },
    ],
  }),
  intervalMinutes: Value.select({
    name: i18n('Copy Interval'),
    description: i18n(
      'How often new and changed files are copied. Today\'s file is copied again each time it has grown. Use "Push Now" to copy at once.',
    ),
    default: '60',
    values: intervalValues,
  }),
  retentionDays: Value.number({
    name: i18n('Keep Logs on the NAS For'),
    description: i18n(
      'Daily files on the NAS older than this are deleted after each copy.',
    ),
    required: true,
    default: DEFAULT_NAS.retentionDays,
    min: 1,
    max: 36500,
    integer: true,
    step: 1,
    units: i18n('days'),
  }),
  credentials: Value.union({
    name: i18n('NAS Login'),
    description: i18n(
      'The NAS account used to write the files. It needs write access to the share. Reading it from Vaultwarden works with Vaultwarden up to version 1.35.x: the bundled rbw 1.15.0 cannot sign in to 1.36 or later. With a newer Vaultwarden, enter the login here.',
    ),
    default: 'manual',
    variants: Variants.of({
      manual: {
        name: i18n('Enter here'),
        spec: InputSpec.of({
          username: Value.text({
            name: i18n('Username'),
            required: true,
            default: null,
          }),
          password: Value.text({
            name: i18n('Password'),
            description: i18n(
              'Leave blank to keep the password already saved.',
            ),
            required: false,
            default: null,
            masked: true,
          }),
        }),
      },
      'vaultwarden-url': {
        name: i18n('From Vaultwarden'),
        spec: InputSpec.of({
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
            placeholder:
              '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
          }),
          ...vaultFields(),
        }),
      },
    }),
  }),
})

const inputSpec = InputSpec.of({
  nas: Value.union({
    name: i18n('NAS Copy'),
    description: i18n(
      'Copy the daily log files to a shared folder on a NAS (SMB), so they can be read there and kept longer than on this server.',
    ),
    default: 'disabled',
    variants: Variants.of({
      disabled: { name: i18n('Off'), spec: InputSpec.of({}) },
      enabled: { name: i18n('On'), spec: enabledSpec },
    }),
  }),
})

const clean = (s: string | null | undefined) => (s ?? '').trim()

function credentialsPrefill(nas: NasSettings) {
  const vault = {
    item: nas.vaultItem || null,
    email: nas.vaultEmail || null,
    masterPassword: null, // never shown
  }
  switch (nas.credentialSource) {
    case 'vaultwarden-url':
      return {
        selection: 'vaultwarden-url',
        value: {
          url: nas.vaultUrl || null,
          ip: nas.vaultIp || null,
          caCert: nas.vaultCa || null,
          ...vault,
        },
      }
    default:
      return {
        selection: 'manual',
        value: { username: nas.username || null, password: null },
      }
  }
}

export const configureNas = sdk.Action.withInput(
  'configure-nas',

  async () => ({
    name: i18n('Configure NAS Copy'),
    description: i18n(
      'Copy the daily log files to a shared folder on a NAS on a schedule, with the login entered here or read from Vaultwarden.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async () => {
    const nas = (await settingsJson.read((s) => s.nas).once()) ?? DEFAULT_NAS
    if (!nas.enabled) {
      return { nas: { selection: 'disabled', value: {} } } as any
    }
    const interval = String(nas.intervalMinutes)
    return {
      nas: {
        selection: 'enabled',
        value: {
          host: nas.host || null,
          share: nas.share || null,
          folder: nas.folder || null,
          intervalMinutes: interval in intervalValues ? interval : '60',
          retentionDays: nas.retentionDays,
          credentials: credentialsPrefill(nas),
        },
      },
    } as any
  },

  async ({ effects, input }) => {
    const prev = (await settingsJson.read((s) => s.nas).once()) ?? DEFAULT_NAS

    if (input.nas.selection !== 'enabled') {
      // Keep the details, so turning it back on needs no retyping.
      await settingsJson.merge(effects, { nas: { ...prev, enabled: false } })
      return {
        version: '1' as const,
        title: i18n('NAS Copy Off'),
        message: i18n(
          'The NAS copy is off. Files already on the NAS are left as they are.',
        ),
        result: null,
      }
    }

    const v = input.nas.value
    const secrets = (await secretsJson.read().once()) ?? {
      nasPassword: '',
      vaultMasterPassword: '',
    }
    const source = v.credentials.selection as CredentialSource
    const next = {
      enabled: true,
      host: clean(v.host),
      share: clean(v.share),
      folder: clean(v.folder).replace(/^\/+|\/+$/g, ''),
      intervalMinutes: Number(v.intervalMinutes) || 60,
      retentionDays: v.retentionDays,
      credentialSource: source,
      username: prev.username,
      vaultItem: prev.vaultItem,
      vaultEmail: prev.vaultEmail,
      vaultUrl: prev.vaultUrl,
      vaultIp: prev.vaultIp,
      vaultCa: prev.vaultCa,
    }
    if (!next.folder) {
      throw new Error(i18n('Enter a folder inside the share.'))
    }
    let nasPassword = secrets.nasPassword
    let vaultMasterPassword = secrets.vaultMasterPassword

    if (v.credentials.selection === 'manual') {
      const c = v.credentials.value
      next.username = clean(c.username)
      if (c.password) nasPassword = c.password
      if (!nasPassword) {
        throw new Error(i18n('Enter the NAS password.'))
      }
    } else {
      const c = v.credentials.value as {
        item: string
        email: string
        masterPassword: string | null
      }
      next.vaultItem = clean(c.item)
      next.vaultEmail = clean(c.email)
      if (c.masterPassword) {
        vaultMasterPassword = c.masterPassword.replace(/\r?\n$/, '')
      }
      if (!vaultMasterPassword) {
        throw new Error(i18n('Enter the Vaultwarden master password.'))
      }
      if (v.credentials.selection === 'vaultwarden-url') {
        const u = v.credentials.value
        next.vaultUrl = clean(u.url).replace(/\/+$/, '')
        next.vaultIp = clean(u.ip)
        const pems = (u.caCert ?? '').match(PEM_RE) ?? []
        if (clean(u.caCert) && !pems.length) {
          throw new Error(
            i18n(
              'The CA certificate must be a PEM block from -----BEGIN CERTIFICATE----- to -----END CERTIFICATE-----.',
            ),
          )
        }
        next.vaultCa = pems.join('\n')
        const host = new URL(next.vaultUrl).hostname
        if (host.endsWith('.local') && !next.vaultIp) {
          throw new Error(
            i18n(
              '"${host}" ends in .local, which StartOS services cannot look up. Enter the IP address it stands for.',
              { host },
            ),
          )
        }
      }
    }

    await writeSecrets(effects, { nasPassword, vaultMasterPassword })
    await settingsJson.merge(effects, { nas: next })

    return {
      version: '1' as const,
      title: i18n('NAS Copy Configured'),
      message: i18n(
        'Saved. The service restarts and makes a first copy within a minute. Watch the "NAS Copy" health check for the result.',
      ),
      result: null,
    }
  },
)
