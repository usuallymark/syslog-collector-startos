export const DEFAULT_LANG = 'en_US'

const dict = {
  Port: 0,
  'The port your devices send syslog to, for both UDP and TCP. StartOS reserves ports below 1025 for itself, so the standard syslog port 514 cannot be used; set this port on each device instead.': 1,
  'Accept UDP': 2,
  'Classic syslog. Most devices send UDP by default. A message lost on the network is not resent.': 3,
  'Accept TCP': 4,
  'Delivery is confirmed, so messages are not lost on a busy network. Both line-by-line and octet-counted (RFC 6587) framing are accepted.': 5,
  'Name Folders By': 6,
  'Each device gets its own folder. The hostname is the name the device puts in its messages; the IP address is where the messages come from.': 7,
  'Hostname (e.g. firewall)': 8,
  'IP address (e.g. 10.0.0.1)': 9,
  'Keep Logs For': 10,
  "Daily files older than this are deleted, checked once an hour. With 3 days, today's file and those of the 3 days before it are kept.": 11,
  days: 12,
  'Time Zone': 13,
  'Decides when a new daily file starts and how times are written in each line. Use an IANA name such as America/Chicago or Europe/Berlin, or UTC.': 14,
  'Configure Receiver': 15,
  'Choose the port and protocols devices send to, how device folders are named, how long logs are kept, and the time zone.': 16,
  'Turn on UDP, TCP or both.': 17,
  'Unknown time zone "${name}". Use an IANA name such as America/Chicago, or UTC.': 18,
  'Receiver Configured': 19,
  'Saved. The service restarts with the new settings if it is running. The address and port to use are under Interfaces > Syslog.': 20,
  Syslog: 21,
  'Where your devices send their logs: syslog over UDP and TCP on this address and port': 22,
  'less than a minute': 23,
  'Starting Log Collector': 24,
  Receiver: 25,
  'rsyslog is not listening yet': 26,
  'Port ${chosen} is already used on this server, so StartOS assigned port ${assigned}. Choose another port in Configure Receiver, or point your devices at ${assigned}.': 27,
  'Listening on port ${port} (${protocols})': 28,
  'Last Message': 29,
  'No messages received yet. Point a device at the Syslog address.': 30,
  '${age} ago, from ${sender}': 31,
  'Log Storage': 32,
  '${used} of logs, ${free} free on the disk': 33,
  'Disk almost full: ${details}. Lower the retention days in Configure Receiver or free up space.': 34,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
