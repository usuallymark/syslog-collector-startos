import {
  DEFAULT_NAS,
  DEFAULT_SETTINGS,
  type FolderNaming,
  settingsJson,
} from '../fileModels/settings.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { parseSender } from '../senders'
import {
  REGIONS,
  UTC,
  ZONES_BY_REGION,
  canonicalZone,
  regionOf,
} from '../timezones'
import { MIN_EXTERNAL_PORT } from '../utils'

const { InputSpec, Value, Variants } = sdk

function regionLabel(region: string): string {
  switch (region) {
    case 'Africa':
      return i18n('Africa')
    case 'America':
      return i18n('Americas')
    case 'Antarctica':
      return i18n('Antarctica')
    case 'Arctic':
      return i18n('Arctic')
    case 'Asia':
      return i18n('Asia')
    case 'Atlantic':
      return i18n('Atlantic')
    case 'Australia':
      return i18n('Australia')
    case 'Europe':
      return i18n('Europe')
    case 'Indian':
      return i18n('Indian Ocean')
    case 'Pacific':
      return i18n('Pacific')
    default:
      return region
  }
}

// Time zone: pick a region, then a city. UTC needs no city.
const timezoneVariants: Record<
  string,
  { name: string; spec: ReturnType<typeof InputSpec.of> }
> = {
  [UTC]: { name: 'UTC', spec: InputSpec.of({}) },
}
for (const region of REGIONS) {
  const cities = ZONES_BY_REGION[region]
  timezoneVariants[region] = {
    name: regionLabel(region),
    spec: InputSpec.of({
      city: Value.select({
        name: i18n('City'),
        description: i18n('A city in your time zone.'),
        default: Object.keys(cities)[0] ?? null,
        values: cities,
      }),
    }),
  }
}

const inputSpec = InputSpec.of({
  port: Value.number({
    name: i18n('Port'),
    description: i18n(
      'The port your devices send syslog to, for both UDP and TCP. StartOS reserves ports below 1025 for itself, so the standard syslog port 514 cannot be used; set this port on each device instead.',
    ),
    required: true,
    default: DEFAULT_SETTINGS.port,
    min: MIN_EXTERNAL_PORT,
    max: 65535,
    integer: true,
    step: 1,
  }),
  udp: Value.toggle({
    name: i18n('Accept UDP'),
    description: i18n(
      'Classic syslog. Most devices send UDP by default. A message lost on the network is not resent.',
    ),
    default: DEFAULT_SETTINGS.udp,
  }),
  tcp: Value.toggle({
    name: i18n('Accept TCP'),
    description: i18n(
      'Delivery is confirmed, so messages are not lost on a busy network. Both line-by-line and octet-counted (RFC 6587) framing are accepted.',
    ),
    default: DEFAULT_SETTINGS.tcp,
  }),
  folderNaming: Value.select({
    name: i18n('Name Folders By'),
    description: i18n(
      'Each device gets its own folder. The hostname is the name the device puts in its messages; the IP address is where the messages come from. Changing this starts new folders; existing files stay where they are.',
    ),
    default: DEFAULT_SETTINGS.folderNaming,
    values: {
      short: i18n('Short hostname (e.g. firewall)'),
      full: i18n('Hostname as sent (e.g. firewall.home.arpa)'),
      ip: i18n('IP address (e.g. 10.0.0.1)'),
    } satisfies Record<FolderNaming, string>,
  }),
  retentionDays: Value.number({
    name: i18n('Keep Logs For'),
    description: i18n(
      "Daily files older than this are deleted from this server, checked once an hour. With 3 days, today's file and those of the 3 days before it are kept. While the NAS copy is on, a file is only deleted once it is on the NAS.",
    ),
    required: true,
    default: DEFAULT_SETTINGS.retentionDays,
    min: 1,
    max: 3650,
    integer: true,
    step: 1,
    units: i18n('days'),
  }),
  timezone: Value.union({
    name: i18n('Time Zone'),
    description: i18n(
      'Decides when a new daily file starts and how times are written in each line. Pick a region, then a city.',
    ),
    default: UTC,
    variants: Variants.of(timezoneVariants),
  }),
  allowedSenders: Value.list(
    sdk.List.obj(
      {
        name: i18n('Allowed Senders'),
        description: i18n(
          'Only accept messages from these addresses. Leave the list empty to accept every sender. Messages from anywhere else are dropped before they are written, and counted in the Rejected Senders health check. The check uses the address a message comes from, not the hostname inside it. A UDP sender address can be forged, so prefer TCP on devices that support it.',
        ),
        default: [],
      },
      {
        spec: InputSpec.of({
          address: Value.text({
            name: i18n('Address'),
            description: i18n(
              'An IPv4 address (10.0.0.1), an IPv4 range in CIDR form (10.0.0.0/24), or an IPv6 address.',
            ),
            required: true,
            default: null,
            placeholder: 'e.g. 10.0.0.1',
          }),
          label: Value.text({
            name: i18n('Label'),
            description: i18n('Optional, for your reference, e.g. firewall.'),
            required: false,
            default: null,
          }),
        }),
        displayAs: '{{address}} {{label}}',
        uniqueBy: 'address',
      },
    ),
  ),
})

export const configureReceiver = sdk.Action.withInput(
  'configure-receiver',

  async () => ({
    name: i18n('Configure Receiver'),
    description: i18n(
      'Choose the port and protocols devices send to, which senders are accepted, how device folders are named, how long logs are kept on this server, and the time zone.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async () => {
    const s = {
      ...DEFAULT_SETTINGS,
      ...((await settingsJson.read().once()) ?? {}),
    }
    const region = regionOf(s.timezone)
    const timezone =
      region && s.timezone in ZONES_BY_REGION[region]
        ? { selection: region, value: { city: s.timezone } }
        : { selection: UTC, value: {} }
    return {
      port: s.port,
      udp: s.udp,
      tcp: s.tcp,
      folderNaming: s.folderNaming,
      retentionDays: s.retentionDays,
      timezone,
      allowedSenders: s.allowedSenders.map((a) => ({
        address: a.address,
        label: a.label || null,
      })),
    } as any
  },

  async ({ effects, input }) => {
    if (!input.udp && !input.tcp) {
      throw new Error(i18n('Turn on UDP, TCP or both.'))
    }
    const tz = input.timezone as {
      selection: string
      value: { city?: string }
    }
    const chosen = tz.selection === UTC ? UTC : (tz.value.city ?? '')
    const timezone = canonicalZone(chosen)
    if (!timezone) {
      throw new Error(
        i18n('Unknown time zone "${name}". Pick another city.', {
          name: chosen,
        }),
      )
    }

    const allowedSenders = (input.allowedSenders ?? []).map((a) => ({
      address: a.address.trim(),
      label: (a.label ?? '').trim(),
    }))
    const invalid = allowedSenders.find((a) => !parseSender(a.address))
    if (invalid) {
      throw new Error(
        i18n(
          '"${address}" is not an IPv4 address, an IPv4 CIDR range or an IPv6 address.',
          { address: invalid.address },
        ),
      )
    }

    // Written whole, so a shortened sender list replaces the old one.
    const current = await settingsJson.read().once()
    await settingsJson.write(effects, {
      ...DEFAULT_SETTINGS,
      nas: DEFAULT_NAS,
      ...(current ?? {}),
      port: input.port,
      udp: input.udp,
      tcp: input.tcp,
      folderNaming: input.folderNaming,
      retentionDays: input.retentionDays,
      timezone,
      allowedSenders,
    })

    return {
      version: '1' as const,
      title: i18n('Receiver Configured'),
      message: i18n(
        'Saved. The service restarts with the new settings if it is running. The address and port to use are under Interfaces > Syslog.',
      ),
      result: null,
    }
  },
)
