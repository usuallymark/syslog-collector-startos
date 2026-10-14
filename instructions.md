# Log Collector

Log Collector receives syslog from devices on your network and writes it into plain text files: one folder per device, one file per day. It can also copy those files to a shared folder on a NAS, and send short alerts to your phone through ntfy. Nothing needs to be set up before it starts; the defaults work.

## Where the logs go

Inside the service, every device gets a folder, and every day gets a file:

```
logs/
  firewall/
    2026-10-12.log
    2026-10-13.log
  nas/
    2026-10-13.log
```

Each line is one message:

```
2026-10-13T14:02:11.408211-05:00 10.0.0.1 local0.info firewall.home.arpa filterlog[61522]: ...
```

That is: when it was received, the sender's IP address, the facility and severity, the hostname the device sent, the program, and the message. Lines look the same whether a device sends RFC 3164 or RFC 5424 syslog.

Folders are named after each device's short hostname (`firewall`) by default. Configure Receiver can name them by the hostname as sent (`firewall.home.arpa`) or by IP address instead.

## Getting set up

1. Open **Interfaces > Syslog** and note the address and port (port **5514** by default).
2. On each device, set that address and port as a remote syslog server. Examples are below.
3. Check the **Last Message** health check on the dashboard. Within a minute of a device sending something, it shows the device's folder name.
4. Add your sending devices under **Configure Receiver > Allowed Senders** (the task on the service page takes you there). Until you do, the Rejected Senders check warns that every sender is accepted.
5. Optionally, in **Actions > Configure Receiver**, change the port, turn UDP or TCP off, turn on encrypted TLS (below), change how folders are named, change how many days are kept on this server (3 by default), or pick your time zone (UTC by default; choose a region, then a city). The time zone decides when each daily file starts.
6. Optionally, set up the copy to a NAS and alerts (below).

### Example: OPNsense

**System > Settings > Logging > Remote**, then **+** to add a destination:

- **Transport**: UDP(4) or TCP(4)
- **Applications**, **Levels**, **Facilities**: leave empty to send everything, or pick what you want
- **Hostname**: the Log Collector address from Interfaces
- **Port**: 5514 (or the port you chose)
- **RFC5424**: either setting works

Save, then **Apply**.

### Example: Synology DSM

Open **Log Center > Log Sending**:

- Tick **Send logs to a syslog server**
- **Server**: the Log Collector address
- **Port**: 5514 (or the port you chose)
- **Transfer protocol**: UDP or TCP
- **Log format**: BSD (RFC 3164) or IETF (RFC 5424); both work
- Leave **Enable secure connection (SSL/TLS)** off

## Encrypted syslog (TLS)

Plain syslog crosses your network as readable text. With **Accept TLS** on in **Configure Receiver**, Log Collector also listens for encrypted syslog (RFC 5425) on its own port, **6514** by default, shown under **Interfaces > Syslog (TLS)**. Plain UDP and TCP can stay on while you move devices over, and be turned off afterwards.

The certificate comes from your StartOS server and is renewed by it. Each device needs two things:

1. **Trust the root CA of your StartOS server.** Download it from StartOS (the root CA you also install on computers to open StartOS over HTTPS) and import it on the device as a trusted certificate authority.
2. **Connect using a name the certificate covers.** The **TLS** health check lists them, for example `adjective-noun.local`. If it lists only the `.local` name, the device must be able to look that name up: many firewalls and NAS systems cannot resolve `.local` names by themselves, so add a host override in your DNS (for example in OPNsense: Services > Unbound DNS > Overrides) mapping that name to the server's IP address.

Devices are not asked for certificates of their own; the allow-list still decides who may send.

### Example: OPNsense

1. **System > Trust > Authorities**, **+**: method **Import an existing Certificate Authority**, paste the StartOS root CA, save.
2. **System > Settings > Logging > Remote**, edit the destination: **Transport** **TLS(4)**, **Hostname** a name from the TLS health check, **Port** 6514 (or the TLS port you chose). Save, then **Apply**.

### Example: Synology DSM

In **Log Center > Log Sending**: **Server** a name from the TLS health check, **Port** 6514, **Transfer protocol** TCP, tick **Enable secure connection (SSL/TLS)**, and import the StartOS root CA as the certificate DSM should trust.

## Limiting who can send

Until you set an allow-list, anything that can reach the address and port can write logs, including fake lines. Log Collector still accepts them, so your first test works, but it raises a task asking you to set the list, and the **Rejected Senders** health check shows a warning beginning "Danger: No allow-list". In **Configure Receiver > Allowed Senders**, list the devices that may send: an IPv4 address (`10.0.0.1`), an IPv4 range (`10.0.0.0/24`) or an IPv6 address, each with an optional label and, for alerts, how long it may stay silent (see Alerts). Messages from any other address are dropped before they are written.

The check uses the address a message actually comes from, not the hostname written inside it, which a sender can fake. A UDP sender address can still be forged on the local network, so prefer TCP on devices that support it.

Once a list is saved, the task goes away and **Rejected Senders** shows the last rejected address, when, and how many lines were dropped from it in the last 30 days. Rejected lines are only counted, never stored, so a flood cannot fill the disk; the service log notes each rejected address at most once an hour.

## Copying the logs to a NAS

**Actions > Configure NAS Copy** copies the daily files to a shared folder on a NAS over SMB, on a schedule. It starts off, and every detail is yours to enter:

- **NAS Address**: the NAS's IP address. Names ending in `.local` usually do not resolve inside StartOS services.
- **Share** and **Folder**: where the files go, for example share `logs`, folder `syslog`. The folder is created if missing. Use a folder for these logs only: expired `YYYY-MM-DD.log` files in its device folders are deleted.
- **Copy Interval**: from every 5 minutes to once a day (every hour by default). Today's file is copied again each time it has grown.
- **Keep Logs on the NAS For**: 30 days by default.
- **NAS Login**: an account that can write to the share. Two ways to give it:
  - **Enter here**: the NAS username and password.
  - **From Vaultwarden**: the name of a Login item holding the NAS username and password, read before every copy, so a changed NAS password is picked up by itself. Needs Vaultwarden set up (below).

The folder on the NAS mirrors the one here: `syslog/firewall/2026-10-13.log`. **Actions > Push Now** copies at once, and the **NAS Copy** health check shows when the last copy worked, or why it failed.

While the copy is on, a file is only deleted from this server after it has been copied in its final state, even when the NAS is unreachable for longer than the retention period. Watch the **Log Storage** check if that happens.

## Alerts

**Actions > Configure Alerts** sends short alerts to your phone through [ntfy](https://ntfy.sh) when something needs attention right away. It starts off. You need an ntfy server (your own, or ntfy.sh) and a topic, subscribed in the ntfy app on your phone. If the server's name ends in `.local`, also enter its IP address; if its certificate comes from your own certificate authority, paste that CA certificate. If the topic is protected, add an access token (starts with `tk_`; create one in the ntfy web app under Account > Access tokens), either entered here or read from Vaultwarden (below): name the item and the field holding the token (a hidden custom field such as `api_key`, or `password`). Best practice is a dedicated ntfy user that may only write to this topic.

Built-in rules, each on by default and adjustable:

- **Logging stopped**: a device on the allow-list has sent nothing for longer than its own limit, and again when it resumes. The limit is set per device, in **Configure Receiver > Allowed Senders > Alert If Silent For** (15 minutes for a new entry). Leave it blank for devices that only log when something happens, such as many NAS systems. Only single addresses are watched, not ranges, named by their label. Configure Alerts shows which devices are watched.
- **Unknown sender**: an address not on the allow-list tried to send.
- **High-severity message**: a syslog message of severity critical, alert or emergency from any device.
- **Volume spike**: a device sends 10 times its usual rate within 10 minutes (and at least 200 lines). Starts after 6 hours of history.
- **Collector problem**: the NAS copy has been failing for over an hour, or the disk is almost full.
- **Authentication failures**: 10 failed logins within 5 minutes on one device, recognised by the standard OpenSSH and Linux/BSD wording ("Failed password", "authentication failure", "Invalid user"). If a device's login is reachable from the internet, expect this to fire often; raise the threshold.

**Custom rules** alert on lines containing your own text (or a regular expression), optionally only for some device folders and only after several matches in a time window. Use them for anything specific to your devices.

Alerts never contain log text: log lines come from the devices, may hold secrets, and a notification can appear on a lock screen. A notification reads like "Logging stopped on firewall, 1 event(s) since 21:04. Check the logs." After an alert, repeats of the same rule on the same device are counted for the cooldown (30 minutes by default) and sent as one summary.

Every alert is also recorded in `alerts/YYYY-MM-DD.jsonl` with the time, rule, device, count and the log files and line numbers that triggered it, kept 30 days here and optionally copied to a NAS folder of your choice. **Dry run** records alerts without sending them, to tune the rules. **Actions > Send Test Alert** sends a test notification, also in dry run. The **Alerts** health check shows the last alert, or why delivery fails; failed deliveries are retried with backoff and never hold up logging or the NAS copy.

## Vaultwarden

Instead of storing the NAS password or the ntfy token here, both can be read from your Vaultwarden. **Actions > Configure Vaultwarden** holds the connection, used by both: the URL you open Vaultwarden at, your account email and master password. If the URL uses a name ending in `.local`, also enter the IP address it stands for (StartOS services cannot look up `.local` names); if Vaultwarden's HTTPS certificate is signed by your own certificate authority, for example the root CA of the StartOS server it runs on, paste that CA certificate. Then choose **From Vaultwarden** in Configure NAS Copy or Configure Alerts and name the item. The **Vaultwarden** health check shows whether the vault unlocks and syncs.

**Version limit:** the bundled rbw 1.15.0, the newest release, cannot sign in to Vaultwarden 1.36 or later, so this works with Vaultwarden up to 1.35.x only. That also rules out the current Vaultwarden package on StartOS. With a newer Vaultwarden, enter the secrets in their own actions.

## Limitations

- **No port 514.** StartOS keeps ports below 1025 for itself, so devices must be able to send to a custom port. Most firewalls, NAS systems and servers can; a few simple home routers cannot.
- **Encryption is optional.** Plain UDP and TCP travel across your network as readable text; use TLS (above) where that matters. Do not expose either interface to the internet.
- **Sender filtering is by address only.** Without an allow-list, any device that can reach the port can write logs; with one, a forged UDP source address can still get through. Prefer TCP.
- Logs of StartOS itself are not collected.
- Files older than the retention period are deleted, checked once an hour. Use the NAS copy, or back up, to keep them longer.
- The NAS copy speaks SMB only.
- Reading secrets from Vaultwarden works with Vaultwarden up to 1.35.x (see above).

## Backups

A StartOS backup includes the settings, the saved passwords, and all log files that exist at backup time.

## Where passwords are kept

The NAS password and the ntfy token (when entered here) and the Vaultwarden master password are stored in one file on this server that only root can read. They are never shown again in a form, never written to the service logs, and never sent anywhere but to the NAS and to Vaultwarden. Secrets read from Vaultwarden are not stored at all: they are read from the vault each time they are needed.
