import { secretsJson, writeSecrets } from '../fileModels/secrets.json'
import {
  type AlertSettings,
  DEFAULT_ALERTS,
  DEFAULT_RULES,
  type TokenSource,
  settingsJson,
} from '../fileModels/settings.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const { InputSpec, Value, Variants, List } = sdk

const PEM_RE = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g

function priorityValues() {
  return {
    '1': i18n('1 (min)'),
    '2': i18n('2 (low)'),
    '3': i18n('3 (default)'),
    '4': i18n('4 (high)'),
    '5': i18n('5 (urgent)'),
  }
}

const priority = (d: number) =>
  Value.select({
    name: i18n('Priority'),
    description: i18n(
      'ntfy priority of this alert on your phone. High and urgent can sound even in do-not-disturb, depending on the ntfy app settings.',
    ),
    default: String(d) as '1' | '2' | '3' | '4' | '5',
    values: priorityValues(),
  })

const onOff = (d: boolean) => Value.toggle({ name: i18n('On'), default: d })

const minutes = (name: string, d: number, description: string | null) =>
  Value.number({
    name,
    description,
    required: true,
    default: d,
    min: 1,
    max: 1440,
    integer: true,
    step: 1,
    units: i18n('minutes'),
  })

const R = DEFAULT_RULES

const rulesSpec = InputSpec.of({
  stopped: Value.object(
    {
      name: i18n('Logging stopped'),
      description: i18n(
        'A device on the allow-list has sent nothing for this long, and a second alert when it sends again. Watches each single address on the allow-list (not ranges), named by its label.',
      ),
    },
    InputSpec.of({
      on: onOff(R.stopped.on),
      minutes: minutes(i18n('Quiet For'), R.stopped.minutes, null),
      priority: priority(R.stopped.priority),
    }),
  ),
  unknownSender: Value.object(
    {
      name: i18n('Unknown sender'),
      description: i18n(
        'An address that is not on the allow-list tried to send logs. Needs an allow-list.',
      ),
    },
    InputSpec.of({
      on: onOff(R.unknownSender.on),
      priority: priority(R.unknownSender.priority),
    }),
  ),
  severity: Value.object(
    {
      name: i18n('High-severity message'),
      description: i18n(
        'A message at or above this syslog severity, from any device. Severity is a standard field of every syslog message; devices rarely use the top levels for routine messages.',
      ),
    },
    InputSpec.of({
      on: onOff(R.severity.on),
      max: Value.select({
        name: i18n('At or Above'),
        default: String(R.severity.max) as '0' | '1' | '2' | '3',
        values: {
          '0': i18n('Emergency (0)'),
          '1': i18n('Alert (1)'),
          '2': i18n('Critical (2)'),
          '3': i18n('Error (3)'),
        },
      }),
      priority: priority(R.severity.priority),
    }),
  ),
  volume: Value.object(
    {
      name: i18n('Volume spike'),
      description: i18n(
        'A device sends far more lines than usual within 10 minutes, compared with its average over the past day. Starts after 6 hours of history.',
      ),
    },
    InputSpec.of({
      on: onOff(R.volume.on),
      factor: Value.number({
        name: i18n('Times the Usual Rate'),
        required: true,
        default: R.volume.factor,
        min: 2,
        max: 1000,
        integer: false,
        step: 1,
      }),
      minLines: Value.number({
        name: i18n('At Least'),
        description: i18n(
          'Ignore spikes smaller than this many lines in 10 minutes.',
        ),
        required: true,
        default: R.volume.minLines,
        min: 1,
        max: 1000000,
        integer: true,
        step: 1,
        units: i18n('lines'),
      }),
      priority: priority(R.volume.priority),
    }),
  ),
  collector: Value.object(
    {
      name: i18n('Collector problem'),
      description: i18n(
        'The NAS copy has been failing for over an hour, or the disk is almost full.',
      ),
    },
    InputSpec.of({
      on: onOff(R.collector.on),
      priority: priority(R.collector.priority),
    }),
  ),
  authBurst: Value.object(
    {
      name: i18n('Authentication failures'),
      description: i18n(
        'Many failed logins on one device in a short time: lines with "Failed password", "authentication failure" or "Invalid user", as written by OpenSSH and Linux/BSD login code. If a device\'s login is reachable from the internet, expect this to fire often and raise the threshold.',
      ),
    },
    InputSpec.of({
      on: onOff(R.authBurst.on),
      count: Value.number({
        name: i18n('Failures'),
        required: true,
        default: R.authBurst.count,
        min: 1,
        max: 100000,
        integer: true,
        step: 1,
      }),
      minutes: minutes(i18n('Within'), R.authBurst.minutes, null),
      priority: priority(R.authBurst.priority),
    }),
  ),
})

const customSpec = InputSpec.of({
  name: Value.text({
    name: i18n('Name'),
    description: i18n('Shown in the alert, e.g. "Admin login".'),
    required: true,
    default: null,
    maxLength: 40,
    patterns: [
      {
        regex: '^[^|]+$',
        description: i18n('Any text without "|".'),
      },
    ],
  }),
  pattern: Value.text({
    name: i18n('Text to Match'),
    description: i18n(
      'Lines containing this text trigger the rule (not case-sensitive), matched against the program and message of each line.',
    ),
    required: true,
    default: null,
  }),
  regex: Value.toggle({
    name: i18n('Regular Expression'),
    description: i18n(
      'Treat the text to match as a Python regular expression.',
    ),
    default: false,
  }),
  devices: Value.text({
    name: i18n('Devices'),
    description: i18n(
      'Optional: only these device folders, separated by commas. Blank: all devices.',
    ),
    required: false,
    default: null,
  }),
  count: Value.number({
    name: i18n('Matches'),
    description: i18n('Alert after this many matching lines…'),
    required: true,
    default: 1,
    min: 1,
    max: 100000,
    integer: true,
    step: 1,
  }),
  minutes: minutes(i18n('Within'), 5, i18n('…within this many minutes.')),
  priority: priority(4),
})

const enabledSpec = InputSpec.of({
  ntfyUrl: Value.text({
    name: i18n('ntfy Server'),
    description: i18n(
      'The address of your ntfy server, e.g. https://ntfy.example.com, or https://ntfy.sh.',
    ),
    required: true,
    default: null,
    placeholder: 'https://ntfy.example.com',
    patterns: [
      {
        regex: '^https?://[^/\\s]+/?$',
        description: i18n(
          'An address such as https://ntfy.example.com, with nothing after the host and port.',
        ),
      },
    ],
  }),
  ntfyTopic: Value.text({
    name: i18n('Topic'),
    description: i18n(
      'The ntfy topic to publish to. Subscribe to it in the ntfy app on your phone.',
    ),
    required: true,
    default: null,
    patterns: [
      {
        regex: '^[A-Za-z0-9_-]{1,64}$',
        description: i18n('Letters, digits, - and _ only.'),
      },
    ],
  }),
  token: Value.union({
    name: i18n('Access Token'),
    description: i18n(
      'Needed when the topic is protected. Best practice: a dedicated ntfy user that may only write to this topic.',
    ),
    default: 'none',
    variants: Variants.of({
      none: { name: i18n('None'), spec: InputSpec.of({}) },
      manual: {
        name: i18n('Enter here'),
        spec: InputSpec.of({
          token: Value.text({
            name: i18n('Token'),
            description: i18n(
              'Starts with tk_. Create one in the ntfy web app (Account > Access tokens) or with "ntfy token add <user>" on the server. Stored in a root-only file. Leave blank to keep the token already saved.',
            ),
            required: false,
            default: null,
            masked: true,
          }),
        }),
      },
      vaultwarden: {
        name: i18n('From Vaultwarden'),
        spec: InputSpec.of({
          item: Value.text({
            name: i18n('Vaultwarden Item'),
            description: i18n(
              'The item holding the token, read before each alert. Set up the connection in Configure Vaultwarden.',
            ),
            required: true,
            default: null,
          }),
          field: Value.text({
            name: i18n('Field'),
            description: i18n(
              "The hidden custom field holding the token, e.g. api_key, or password for the item's own password.",
            ),
            required: true,
            default: 'api_key',
          }),
        }),
      },
    }),
  }),
  ntfyIp: Value.text({
    name: i18n('ntfy IP Address'),
    description: i18n(
      'Only needed when the server address uses a name ending in .local, which StartOS services cannot look up: the IP address that name stands for. Leave blank otherwise.',
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
      "Only needed when the ntfy server's HTTPS certificate is signed by your own certificate authority. Paste the PEM block.",
    ),
    required: false,
    default: null,
    minRows: 4,
    maxRows: 12,
    placeholder: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
  }),
  dryRun: Value.toggle({
    name: i18n('Dry Run'),
    description: i18n(
      'Record alerts without sending them, to tune the rules. Send Test Alert still sends.',
    ),
    default: false,
  }),
  cooldownMinutes: minutes(
    i18n('Cooldown'),
    DEFAULT_ALERTS.cooldownMinutes,
    i18n(
      'After an alert, repeats of the same rule on the same device are counted and sent as one summary when this time is up.',
    ),
  ),
  nasFolder: Value.text({
    name: i18n('NAS Folder for Alert Records'),
    description: i18n(
      "Optional: a folder in the NAS copy's share for the daily alert records (YYYY-MM-DD.jsonl), e.g. alerts. Needs the NAS copy. Blank: records stay on this server only.",
    ),
    required: false,
    default: null,
    patterns: [
      {
        regex: '^(?!.*(^|/)\\.\\.(/|$))[^\\\\:*?"<>|]+$',
        description: i18n(
          'A folder path such as syslog or logs/network, without ".." or backslashes.',
        ),
      },
    ],
  }),
  rules: Value.object(
    {
      name: i18n('Built-in Rules'),
      description: i18n('Each can be switched off and tuned.'),
    },
    rulesSpec,
  ),
  custom: Value.list(
    List.obj(
      {
        name: i18n('Custom Rules'),
        description: i18n(
          'Your own rules: alert when lines containing a text appear, optionally only from some devices and only after several matches. For anything specific to your devices.',
        ),
        default: [],
      },
      {
        spec: customSpec,
        displayAs: '{{name}}',
        uniqueBy: 'name',
      },
    ),
  ),
})

const inputSpec = InputSpec.of({
  alerts: Value.union({
    name: i18n('Alerts'),
    description: i18n(
      'Watch incoming log lines and send short alerts to your phone through ntfy. Alerts never contain log text: they name the rule, the device and a count. Each alert is also recorded with the files and line numbers that triggered it.',
    ),
    default: 'disabled',
    variants: Variants.of({
      disabled: { name: i18n('Off'), spec: InputSpec.of({}) },
      enabled: { name: i18n('On'), spec: enabledSpec },
    }),
  }),
})

const clean = (s: string | null | undefined) => (s ?? '').trim()

function prefill(a: AlertSettings) {
  const r = a.rules
  const p = (n: number) => String(n)
  return {
    alerts: {
      selection: 'enabled',
      value: {
        ntfyUrl: a.ntfyUrl || null,
        ntfyTopic: a.ntfyTopic || null,
        token:
          a.tokenSource === 'manual'
            ? { selection: 'manual', value: { token: null } }
            : a.tokenSource === 'vaultwarden'
              ? {
                  selection: 'vaultwarden',
                  value: {
                    item: a.tokenVaultItem || null,
                    field: a.tokenVaultField || 'api_key',
                  },
                }
              : { selection: 'none', value: {} },
        ntfyIp: a.ntfyIp || null,
        caCert: a.ntfyCa || null,
        dryRun: a.dryRun,
        cooldownMinutes: a.cooldownMinutes,
        nasFolder: a.nasFolder || null,
        rules: {
          stopped: { ...r.stopped, priority: p(r.stopped.priority) },
          unknownSender: {
            ...r.unknownSender,
            priority: p(r.unknownSender.priority),
          },
          severity: {
            ...r.severity,
            max: p(r.severity.max),
            priority: p(r.severity.priority),
          },
          volume: { ...r.volume, priority: p(r.volume.priority) },
          collector: { ...r.collector, priority: p(r.collector.priority) },
          authBurst: { ...r.authBurst, priority: p(r.authBurst.priority) },
        },
        custom: a.custom.map((c) => ({
          ...c,
          devices: c.devices.join(', ') || null,
          priority: p(c.priority),
        })),
      },
    },
  }
}

export const configureAlerts = sdk.Action.withInput(
  'configure-alerts',

  async () => ({
    name: i18n('Configure Alerts'),
    description: i18n(
      'Send short alerts to your phone through ntfy when something needs attention right away: a device stops logging, an unknown sender, high-severity messages, volume spikes, failed-login bursts, or your own rules.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async () => {
    const s = await settingsJson.read().once()
    const a = (s?.alerts ?? DEFAULT_ALERTS) as AlertSettings
    if (!a.enabled) {
      // Show the saved details (or the defaults) once switched on.
      return { alerts: { selection: 'disabled', value: {} } } as any
    }
    return prefill(a) as any
  },

  async ({ effects, input }) => {
    const current = await settingsJson.read().once()
    const prev = (current?.alerts ?? DEFAULT_ALERTS) as AlertSettings

    if (input.alerts.selection !== 'enabled') {
      await settingsJson.merge(effects, { alerts: { ...prev, enabled: false } })
      return {
        version: '1' as const,
        title: i18n('Alerts Off'),
        message: i18n('Alerts are off. Records already made are kept.'),
        result: null,
      }
    }

    const v = input.alerts.value as any
    const secrets = (await secretsJson.read().once()) ?? {
      nasPassword: '',
      vaultMasterPassword: '',
      ntfyToken: '',
    }
    const tokenSource = v.token.selection as TokenSource
    let ntfyToken = secrets.ntfyToken
    if (tokenSource === 'manual') {
      if (v.token.value.token) ntfyToken = String(v.token.value.token).trim()
      if (!ntfyToken) throw new Error(i18n('Enter the ntfy access token.'))
    }
    if (tokenSource === 'vaultwarden' && !current?.vaultwarden?.enabled) {
      throw new Error(
        i18n(
          'Vaultwarden is not set up yet. Connect it in Configure Vaultwarden first, or enter the token here.',
        ),
      )
    }
    const pems = (v.caCert ?? '').match(PEM_RE) ?? []
    if (clean(v.caCert) && !pems.length) {
      throw new Error(
        i18n(
          'The CA certificate must be a PEM block from -----BEGIN CERTIFICATE----- to -----END CERTIFICATE-----.',
        ),
      )
    }
    const ntfyHost = new URL(clean(v.ntfyUrl)).hostname
    if (ntfyHost.endsWith('.local') && !clean(v.ntfyIp)) {
      throw new Error(
        i18n(
          '"${host}" ends in .local, which StartOS services cannot look up. Enter the IP address it stands for.',
          { host: ntfyHost },
        ),
      )
    }
    const nasFolder = clean(v.nasFolder).replace(/^\/+|\/+$/g, '')
    if (nasFolder && !current?.nas?.enabled) {
      throw new Error(
        i18n(
          'Copying alert records to the NAS needs the NAS copy. Turn it on in Configure NAS Copy, or leave the folder blank.',
        ),
      )
    }
    const custom = (v.custom ?? []).map((c: any) => {
      const pattern = String(c.pattern)
      if (c.regex) {
        try {
          // JavaScript and Python agree on the common syntax; the rule is
          // skipped (and logged) if Python rejects it.
          new RegExp(pattern)
        } catch {
          throw new Error(
            i18n(
              'Custom rule "${name}": the regular expression is not valid.',
              {
                name: c.name,
              },
            ),
          )
        }
      }
      return {
        name: clean(c.name),
        pattern,
        regex: !!c.regex,
        devices: clean(c.devices)
          .split(',')
          .map((d: string) => d.trim().toLowerCase())
          .filter(Boolean),
        count: Number(c.count),
        minutes: Number(c.minutes),
        priority: Number(c.priority),
      }
    })
    const r = v.rules
    const num = (x: unknown) => Number(x)
    const next: AlertSettings = {
      enabled: true,
      dryRun: !!v.dryRun,
      cooldownMinutes: num(v.cooldownMinutes),
      ntfyUrl: clean(v.ntfyUrl).replace(/\/+$/, ''),
      ntfyTopic: clean(v.ntfyTopic),
      ntfyCa: pems.join('\n'),
      tokenSource,
      tokenVaultItem:
        tokenSource === 'vaultwarden' ? clean(v.token.value.item) : '',
      tokenVaultField:
        tokenSource === 'vaultwarden'
          ? clean(v.token.value.field) || 'api_key'
          : 'api_key',
      ntfyIp: clean(v.ntfyIp),
      nasFolder,
      rules: {
        stopped: {
          on: !!r.stopped.on,
          minutes: num(r.stopped.minutes),
          priority: num(r.stopped.priority),
        },
        unknownSender: {
          on: !!r.unknownSender.on,
          priority: num(r.unknownSender.priority),
        },
        severity: {
          on: !!r.severity.on,
          max: num(r.severity.max),
          priority: num(r.severity.priority),
        },
        volume: {
          on: !!r.volume.on,
          factor: num(r.volume.factor),
          minLines: num(r.volume.minLines),
          priority: num(r.volume.priority),
        },
        collector: {
          on: !!r.collector.on,
          priority: num(r.collector.priority),
        },
        authBurst: {
          on: !!r.authBurst.on,
          count: num(r.authBurst.count),
          minutes: num(r.authBurst.minutes),
          priority: num(r.authBurst.priority),
        },
      },
      custom,
    }

    await writeSecrets(effects, { ...secrets, ntfyToken })
    // Written whole, so removed custom rules are really gone.
    await settingsJson.write(effects, {
      ...(current as NonNullable<typeof current>),
      alerts: next,
    })

    return {
      version: '1' as const,
      title: i18n('Alerts Configured'),
      message: next.dryRun
        ? i18n(
            'Saved, in dry run: alerts are recorded but not sent. Use Send Test Alert to check that notifications reach your phone.',
          )
        : i18n(
            'Saved. Use Send Test Alert to check that notifications reach your phone.',
          ),
      result: null,
    }
  },
)
