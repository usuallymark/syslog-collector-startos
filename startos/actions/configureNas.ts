import { secretsJson } from '../fileModels/secrets.json'
import {
  type CredentialSource,
  DEFAULT_NAS,
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
      'The NAS account used to write the files. It needs write access to the share.',
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
      vaultwarden: {
        name: i18n('From Vaultwarden on this server'),
        spec: InputSpec.of({
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
            inputmode: 'email',
          }),
          masterPassword: Value.text({
            name: i18n('Vaultwarden Master Password'),
            description: i18n(
              'Used to unlock the vault before each copy. It is stored in a private file on this server. Leave blank to keep the password already saved.',
            ),
            required: false,
            default: null,
            masked: true,
          }),
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
          credentials:
            nas.credentialSource === 'vaultwarden'
              ? {
                  selection: 'vaultwarden',
                  value: {
                    item: nas.vaultItem || null,
                    email: nas.vaultEmail || null,
                    masterPassword: null, // never shown
                  },
                }
              : {
                  selection: 'manual',
                  value: { username: nas.username || null, password: null },
                },
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
      const c = v.credentials.value
      next.vaultItem = clean(c.item)
      next.vaultEmail = clean(c.email)
      if (c.masterPassword) {
        vaultMasterPassword = c.masterPassword.replace(/\r?\n$/, '')
      }
      if (!vaultMasterPassword) {
        throw new Error(i18n('Enter the Vaultwarden master password.'))
      }
    }

    await secretsJson.write(effects, { nasPassword, vaultMasterPassword })
    await settingsJson.merge(effects, { nas: next })

    return {
      version: '1' as const,
      title: i18n('NAS Copy Configured'),
      message:
        source === 'vaultwarden'
          ? i18n(
              'Saved. The service restarts and makes a first copy within a minute. Vaultwarden must be installed and running on this server. Watch the "NAS Copy" health check for the result.',
            )
          : i18n(
              'Saved. The service restarts and makes a first copy within a minute. Watch the "NAS Copy" health check for the result.',
            ),
      result: null,
    }
  },
)
