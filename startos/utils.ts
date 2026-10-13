// Constants shared across the package.

// rsyslog release the image must contain. The Dockerfile installs Debian's
// rsyslog and fails the build if `rsyslogd -v` reports another version, so a
// Debian update can never ship silently (see UPDATING.md). The package version
// in versions/current.ts starts with this same number.
export const RSYSLOG_VERSION = '8.2504.0'

// The port rsyslog listens on inside the container, for both UDP and TCP.
// It never changes; the port senders use is the external port StartOS
// forwards to it, chosen in Configure Receiver.
export const SYSLOG_PORT = 5514

// Ports at or below 1024 are reserved for StartOS itself, so a package cannot
// use the standard syslog port 514.
export const MIN_EXTERNAL_PORT = 1025

// Paths inside the container. The `main` volume is mounted at /data.
export const DATA_DIR = '/data'
export const LOGS_DIR = '/data/logs'
export const RSYSLOG_CONF = '/etc/rsyslog-collector.conf'
