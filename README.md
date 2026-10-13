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
| Image | `debian:trixie-slim` + Debian's `rsyslog` (version pinned and checked at build, see [UPDATING.md](UPDATING.md)), `tzdata`, `python3` with hash-pinned `smbprotocol`, and `rbw` |
| Architectures | x86_64, aarch64 |
| Volume | `main`, mounted at `/data` |
| Daemons | `receiver` (`rsyslogd -n`), `housekeeping` (`collector housekeeping`, hourly), `pusher` (`collector push`, NAS copy; idle while off) |
| Health checks | Receiver (port listening, and the external port StartOS assigned), Last Message, NAS Copy, Log Storage |
| Dependencies | `vaultwarden` (optional; required only while the NAS login comes from Vaultwarden) |

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
| `/data/settings.json` | Settings written by Configure Receiver and Configure NAS Copy |
| `/data/secrets.json` | NAS password and Vaultwarden master password (mode 600; the only copy) |
| `/data/logs/<sender>/<YYYY-MM-DD>.log` | Received messages |
| `/data/state/nas-push.json` | NAS copy state: last attempt, success and error, copied sizes |
| `/data/rbw/` | rbw configuration, login and local (encrypted) vault copy |

`<sender>` is the short hostname (up to the first dot, unless the hostname is
an IP address), the hostname as sent, or the source IP; lowercased and
passed through rsyslog's `secpath-replace` so it can never leave the logs
folder. Line format, the same for RFC 3164 and RFC 5424 input:

```
<received time, RFC 3339> <source IP> <facility>.<severity> <hostname> <program>[<pid>]: <message>
```

The day in the file name and the received time use the configured time zone
(`TZ` for rsyslogd and housekeeping). rsyslog's configuration is generated
from the settings into the container at every start
(`startos/rsyslogConf.ts`); it is not stored on the volume. The same goes
for `/etc/collector.json`, the settings of `docker/collector.py`.

## Actions

- **Configure Receiver**: port, UDP on/off, TCP on/off (newline and RFC 6587
  octet-counted framing), folder naming (short, as sent, IP), local
  retention days (1–3650, default 3), time zone (region, then city; default
  UTC). Saving restarts the service.
- **Configure NAS Copy**: off by default and empty. Host, share, folder,
  interval (5 min to 24 h, default 1 h), NAS retention days (default 30),
  login entered, or read from a Vaultwarden Login item with rbw: Vaultwarden
  on this server (reached over the StartOS bridge) or at a URL (optional IP
  for a `.local` name, written to the container's `/etc/hosts`; optional
  custom CA, appended to the system bundle and passed as `SSL_CERT_FILE`).
  Passwords are never shown again; blank keeps the saved one. rbw's pinentry
  and collector.py read them from `secrets.json`.
- **Push Now**: copies at once (the pusher polls for `/data/state/push-now`
  every 10 s).

## NAS copy

Each run copies every `YYYY-MM-DD.log` whose size differs from the size last
copied, to `<share>/<folder>/<sender>/<day>.log` (written to a `.part` file,
then renamed), then deletes `YYYY-MM-DD.log` files in the sender folders on
the NAS that are older than the NAS retention. A changed destination starts
again from scratch. Errors are kept in the state file and shown by the NAS
Copy check, which also fails when no copy succeeded for two intervals.

## Retention

`housekeeping` deletes local `YYYY-MM-DD.log` files dated before today minus
the retention days, once an hour, then removes empty sender folders. While
the NAS copy is on, a file is deleted only if its current size was copied
to the current destination. Other files are never touched.

## Backups

The whole `main` volume.

## Not (yet) included

TLS syslog, sender allow-lists, NAS protocols other than SMB, and collecting
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
