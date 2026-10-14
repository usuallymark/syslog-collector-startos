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
| Image | `debian:trixie-slim` + Debian's `rsyslog` (version pinned and checked at build, see [UPDATING.md](UPDATING.md)) and `rsyslog-gnutls`, `tzdata`, `python3` with hash-pinned `smbprotocol`, and `rbw` |
| Architectures | x86_64, aarch64 |
| Volume | `main`, mounted at `/data` |
| Daemons | `receiver` (`rsyslogd -n`), `housekeeping` (`collector housekeeping`), `pusher` (`collector push`, NAS copy; idle while off), `alerter` (`collector alerts`, `docker/alerter.py`; idle while off) |
| Oneshot | `vault-prepare` (`collector vault-prepare`): fresh rbw agent at every start, new sign-in when the Vaultwarden account or address changed |
| Health checks | Receiver (port listening, and the external port StartOS assigned), TLS (certificate, port, names covered), Vaultwarden (rbw unlock + sync), Alerts, Last Message, Rejected Senders, NAS Copy, Log Storage |
| Dependencies | none |

## Interface

| Id | Type | Internal port | External port | Protocols |
| --- | --- | --- | --- | --- |
| `syslog` | `api` | 5514 | chosen in Configure Receiver (default 5514, must be above 1024) | UDP and TCP |
| `syslog-tls` | `api` | 6514 | chosen in Configure Receiver (default 6514); only while TLS is on | TLS over TCP (RFC 5425) |

StartOS forwards every package port for both TCP and UDP. Packages may not
claim external ports at or below 1024, so 514 is impossible. If the chosen
port is already taken on the server, StartOS assigns a random port instead;
the Receiver health check then fails and names the assigned port.

The plain binding is `secure: { ssl: false }` so StartOS publishes it on the
LAN addresses the user enables. Syslog itself is unencrypted.

The TLS binding is `secure: { ssl: true }` with `addSsl: null`: rsyslog
(`gtls` driver, `authMode="anon"`) terminates TLS itself with a certificate
from `sdk.getSslCertificate` / `getSslKey` (ECDSA, signed by the StartOS root
CA, renewed by StartOS; the service restarts on renewal). It is requested for
the server's `.local` name and its LAN IPv4 addresses, falling back to the
`.local` name alone if StartOS refuses the addresses. StartOS terminating TLS
(`addSsl`) is not used: rsyslog would then see StartOS, not the device, as the
sender, which breaks the allow-list and the per-IP rules.

## Files

| Path | Contents |
| --- | --- |
| `/data/settings.json` | Settings written by Configure Receiver and Configure NAS Copy |
| `/data/secrets.json` | NAS password and Vaultwarden master password (mode 600; the only copy) |
| `/data/logs/<sender>/<YYYY-MM-DD>.log` | Received messages |
| `/data/state/nas-push.json` | NAS copy state: last attempt, success and error, copied sizes |
| `/data/state/rsyslog-stats.json` | impstats output (per-IP reject counters), emptied by collector.py every minute |
| `/data/state/rejected.json` | Rejected senders: totals, last seen, most recent (30 days) |
| `/data/alerts/<YYYY-MM-DD>.jsonl` | Alert records: time, rule, device, count, since, `lines` (file + line numbers), dryRun; 30 days |
| `/data/state/alerter.json` | Alerter state: file offsets and line numbers, last seen per IP, volume history, cooldowns, delivery queue |
| `/data/state/alerts-status.json` | For the Alerts health check |
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
  login entered, or a Vaultwarden Login item (username and password).
  Passwords are never shown again; blank keeps the saved one.
- **Configure Vaultwarden**: off by default and empty. URL, optional IP for a
  `.local` name (written to the container's `/etc/hosts`), optional custom
  CA (appended to the system bundle and passed as `SSL_CERT_FILE`), email,
  master password (in `secrets.json`, read by rbw's pinentry). Shared by the
  NAS copy and alerts. rbw 1.15.0 cannot sign in to Vaultwarden 1.36 or
  later, so this works with Vaultwarden up to 1.35.x.
- **Push Now**: copies at once (the pusher polls for `/data/state/push-now`
  every 10 s).

## Sender allow-list

Configure Receiver's Allowed Senders (IPv4, IPv4 CIDR, IPv6) become a
RainerScript test on `$fromhost-ip` (IPv4 via `ip42num`) at the top of the
`remote` ruleset. Rejected messages hit `dyn_inc("rejected", $fromhost-ip)`
and `stop`, so nothing of them is written. impstats writes the counters to
`/data/state/rsyslog-stats.json` every 60 s; `collector housekeeping` folds
them into `rejected.json` every minute, empties the stats file, and logs each
IP at most once an hour. With an empty list none of this is loaded and every
sender is accepted, but the Rejected Senders check reports failure ("Danger:
No allow-list…") and init raises an important task for Configure Receiver
(`init/taskAllowedSenders.ts`), cleared once a list is saved.

## NAS copy

Each run copies every `YYYY-MM-DD.log` whose size differs from the size last
copied, to `<share>/<folder>/<sender>/<day>.log` (written to a `.part` file,
then renamed), then deletes `YYYY-MM-DD.log` files in the sender folders on
the NAS that are older than the NAS retention. A changed destination starts
again from scratch. Errors are kept in the state file and shown by the NAS
Copy check, which also fails when no copy succeeded for two intervals.

## Alerts

`alerter.py` follows the day files (byte offset and line count per file, so
restarts resume and line numbers stay right; existing lines are skipped on the
first start), parses `<time> <ip> <facility>.<severity> <host> <tag> <msg>`,
and applies the rules from the `alerts` section of `/etc/collector.json`:
`stopped`/`resumed` (single-address allow-list entries with their own
`silentMinutes`; blank entries are not watched), `unknownSender`
(increases in `rejected.json`), `severity` (≤ max), `volume` (10-minute
buckets against the mean of the last 144, after 36), `collector` (NAS copy
error with no success for an hour, < 5 % disk free), `authBurst` (OpenSSH/PAM
phrases, N in M minutes per device) and custom rules (text or Python regex,
optional device list, N in M minutes). One alert per rule and device, then a
cooldown that rolls repeats into a count. Records go to `/data/alerts`;
notifications (fixed text, never log text, device names sanitised) to
`<ntfy url>/<topic>` with `Title`, `Priority`, `Tags` and an optional bearer
token from `secrets.json` or a Vaultwarden item field (`rbw get --field`,
default `api_key`, as in OpenClaw Extra Butter), optional IP for a `.local`
ntfy host. Failed
deliveries are retried with backoff (1 min doubling to 30 min, up to 20
tries). `state/alert-test` (Send Test Alert) queues a test notification.
A custom CA for ntfy joins the CA bundle given as `SSL_CERT_FILE`. The pusher
copies alert records to `<share>/<alerts folder>` when one is set.

## Retention

`housekeeping` deletes local `YYYY-MM-DD.log` files dated before today minus
the retention days, once an hour, then removes empty sender folders. While
the NAS copy is on, a file is deleted only if its current size was copied
to the current destination. Other files are never touched.

## Backups

The whole `main` volume.

## Not (yet) included

TLS syslog, vendor-specific alert rules (use custom rules), NAS protocols
other than SMB, and collecting StartOS's own logs.

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
