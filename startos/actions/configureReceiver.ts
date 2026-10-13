import {
  DEFAULT_SETTINGS,
  type FolderNaming,
  settingsJson,
} from '../fileModels/settings.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { MIN_EXTERNAL_PORT } from '../utils'

const { InputSpec, Value } = sdk

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
      'Each device gets its own folder. The hostname is the name the device puts in its messages; the IP address is where the messages come from.',
    ),
    default: DEFAULT_SETTINGS.folderNaming,
    values: {
      hostname: i18n('Hostname (e.g. firewall)'),
      ip: i18n('IP address (e.g. 10.0.0.1)'),
    } satisfies Record<FolderNaming, string>,
  }),
  retentionDays: Value.number({
    name: i18n('Keep Logs For'),
    description: i18n(
      "Daily files older than this are deleted, checked once an hour. With 3 days, today's file and those of the 3 days before it are kept.",
    ),
    required: true,
    default: DEFAULT_SETTINGS.retentionDays,
    min: 1,
    max: 3650,
    integer: true,
    step: 1,
    units: i18n('days'),
  }),
  timezone: Value.text({
    name: i18n('Time Zone'),
    description: i18n(
      'Decides when a new daily file starts and how times are written in each line. Use an IANA name such as America/Chicago or Europe/Berlin, or UTC.',
    ),
    required: true,
    default: DEFAULT_SETTINGS.timezone,
    placeholder: 'UTC',
  }),
})

/** The time zone as Node knows it (canonical spelling), or null. */
function validTimezone(name: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: name.trim(),
    }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

export const configureReceiver = sdk.Action.withInput(
  'configure-receiver',

  async () => ({
    name: i18n('Configure Receiver'),
    description: i18n(
      'Choose the port and protocols devices send to, how device folders are named, how long logs are kept, and the time zone.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async () => {
    const s = await settingsJson.read().once()
    return { ...DEFAULT_SETTINGS, ...(s ?? {}) }
  },

  async ({ effects, input }) => {
    if (!input.udp && !input.tcp) {
      throw new Error(i18n('Turn on UDP, TCP or both.'))
    }
    const timezone = validTimezone(input.timezone)
    if (!timezone) {
      throw new Error(
        i18n(
          'Unknown time zone "${name}". Use an IANA name such as America/Chicago, or UTC.',
          { name: input.timezone },
        ),
      )
    }

    await settingsJson.merge(effects, {
      port: input.port,
      udp: input.udp,
      tcp: input.tcp,
      folderNaming: input.folderNaming,
      retentionDays: input.retentionDays,
      timezone,
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
