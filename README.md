# Log Collector for StartOS

An unofficial StartOS 0.4 package that receives syslog from network devices
with [rsyslog](https://www.rsyslog.com/) and writes plain text files: one
folder per device, one file per day. Plain text is easy to search, archive, or
hand to a script or an AI agent.

End-user documentation is in [instructions.md](instructions.md). This file is
the technical reference.

## What it runs

| Item | Value |
| --- | --- |
| Package id | `syslog-collector` |
| Image | `debian:trixie-slim` + Debian's `rsyslog` (version pinned and checked at build, see [UPDATING.md](UPDATING.md)) and `tzdata` |
| Architectures | x86_64, aarch64 |
| Volume | `main`, mounted at `/data` |
| Daemons | `receiver` (`rsyslogd -n`), `housekeeping` (hourly retention cleanup) |
| Health checks | Receiver (port listening, and the external port StartOS assigned), Last Message, Log Storage |

## Interface

| Id | Type | Internal port | External port | Protocols |
| --- | --- | --- | --- | --- |
| `syslog` | `api` | 5514 | chosen in Configure Receiver (default 5514, must be above 1024) | UDP and TCP |

StartOS forwards every package port for both TCP and UDP. Packages may not
claim external ports at or below 1024, so 514 is impossible. If the chosen
port is already taken on the server, StartOS assigns a random port instead;
the Receiver health check then fails and names the assigned port.

The binding is `secure: { ssl: false }` so StartOS publishes it on the LAN
addresses the user enables. Syslog itself is unencrypted.

## Files

| Path | Contents |
| --- | --- |
| `/data/settings.json` | Settings written by Configure Receiver |
| `/data/logs/<sender>/<YYYY-MM-DD>.log` | Received messages |

`<sender>` is the hostname from the message (lowercased) or the source IP,
passed through rsyslog's `secpath-replace` so it can never leave the logs
folder. Line format:

```
<received time, RFC 3339> <source IP> <facility>.<severity> <hostname> <tag><message>
```

The day in the file name and the received time use the configured time zone
(`TZ` for rsyslogd and housekeeping). rsyslog's configuration is generated
from the settings into the container at every start
(`startos/rsyslogConf.ts`); it is not stored on the volume.

## Actions

- **Configure Receiver**: port, UDP on/off, TCP on/off (newline and RFC 6587
  octet-counted framing), folder naming (hostname or IP), retention days
  (1–3650, default 3), time zone (IANA name, default UTC). Saving restarts the
  service.

## Retention

`housekeeping` deletes `YYYY-MM-DD.log` files dated before today minus the
retention days, once an hour, then removes empty sender folders. Other files
are never touched.

## Backups

The whole `main` volume.

## Not (yet) included

TLS syslog, sender allow-lists, copying the files to a NAS, and collecting
StartOS's own logs.

## Building

Requires Node 22, Docker with buildx, and `start-cli`.

```
npm ci
npm run check
make
```

Pushing to `master` builds and publishes a GitHub release tagged
`v<version>` with `syslog-collector_x86_64.s9pk` and
`syslog-collector_aarch64.s9pk` (changes to Markdown files only do not
release).
