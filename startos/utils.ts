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

// NAS copy: state written by collector.py, and the file Push Now creates.
export const STATE_DIR = '/data/state'
export const PUSH_STATE = 'state/nas-push.json'
export const PUSH_NOW = 'state/push-now'

// Settings for collector.py, written into the container at every start.
export const COLLECTOR_CONF = '/etc/collector.json'

// System CAs plus a custom CA for a remote Vaultwarden (SSL_CERT_FILE).
export const CA_BUNDLE = '/etc/ssl/certs/log-collector-bundle.pem'

// rbw (Vaultwarden client) keeps its login and vault copy on the volume, so a
// restart is not a new device to Vaultwarden.
export const RBW_DIR = '/data/rbw'
export const RBW_ENV = {
  HOME: RBW_DIR,
  XDG_CONFIG_HOME: `${RBW_DIR}/config`,
  XDG_CACHE_HOME: `${RBW_DIR}/cache`,
  XDG_RUNTIME_DIR: `${RBW_DIR}/runtime`,
}

// Sender allow-list: rsyslog's per-IP reject counters (written by impstats
// every minute), and collector.py's summary of them for the health check.
export const RSYSLOG_STATS = '/data/state/rsyslog-stats.json'
export const REJECTED_STATE = 'state/rejected.json'

// Alerts: status written by alerter.py, and the file Send Test Alert creates.
export const ALERTS_STATUS = 'state/alerts-status.json'
export const ALERT_TEST = 'state/alert-test'

export const INTERVAL_CHOICES = [5, 15, 30, 60, 180, 360, 720, 1440] as const
