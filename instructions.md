# Log Collector

Log Collector receives syslog from devices on your network and writes it into plain text files: one folder per device, one file per day. It can also copy those files to a shared folder on a NAS. Nothing needs to be set up before it starts; the defaults work.

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
4. Optionally, run **Actions > Configure Receiver** to change the port, turn UDP or TCP off, change how folders are named, change how many days are kept on this server (3 by default), or pick your time zone (UTC by default; choose a region, then a city). The time zone decides when each daily file starts.
5. Optionally, set up the copy to a NAS (below).

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

## Copying the logs to a NAS

**Actions > Configure NAS Copy** copies the daily files to a shared folder on a NAS over SMB, on a schedule. It starts off, and every detail is yours to enter:

- **NAS Address**: the NAS's IP address. Names ending in `.local` usually do not resolve inside StartOS services.
- **Share** and **Folder**: where the files go, for example share `logs`, folder `syslog`. The folder is created if missing. Use a folder for these logs only: expired `YYYY-MM-DD.log` files in its device folders are deleted.
- **Copy Interval**: from every 5 minutes to once a day (every hour by default). Today's file is copied again each time it has grown.
- **Keep Logs on the NAS For**: 30 days by default.
- **NAS Login**: an account that can write to the share. Three ways to give it:
  - **Enter here**: the NAS username and password.
  - **From Vaultwarden on this server**: Vaultwarden installed on the same StartOS server.
  - **From Vaultwarden at an address**: Vaultwarden running elsewhere. Enter its URL. If the URL uses a name ending in `.local`, also enter the IP address it stands for (StartOS services cannot look up `.local` names). If its HTTPS certificate is signed by your own certificate authority, for example the root CA of the StartOS server it runs on, paste that CA certificate.

  For both Vaultwarden options, create a Login item holding the NAS username and password, and enter the item's name, your Vaultwarden account email and your master password. The item is read before every copy, so a changed NAS password is picked up by itself.

The folder on the NAS mirrors the one here: `syslog/firewall/2026-10-13.log`. **Actions > Push Now** copies at once, and the **NAS Copy** health check shows when the last copy worked, or why it failed.

While the copy is on, a file is only deleted from this server after it has been copied in its final state, even when the NAS is unreachable for longer than the retention period. Watch the **Log Storage** check if that happens.

## Limitations

- **No port 514.** StartOS keeps ports below 1025 for itself, so devices must be able to send to a custom port. Most firewalls, NAS systems and servers can; a few simple home routers cannot.
- **No encryption (TLS) yet.** Messages travel across your network in plain text, like standard syslog. Do not expose the Syslog interface to the internet.
- **No sender filtering yet.** Any device that can reach the address and port can write logs.
- Logs of StartOS itself are not collected.
- Files older than the retention period are deleted, checked once an hour. Use the NAS copy, or back up, to keep them longer.
- The NAS copy speaks SMB only.

## Backups

A StartOS backup includes the settings, the saved passwords, and all log files that exist at backup time.

## Where passwords are kept

The NAS password ("Enter here") and the Vaultwarden master password are stored in one file on this server that only root can read. They are never shown again in a form, never written to the service logs, and never sent anywhere but to the NAS and to Vaultwarden. When the login comes from Vaultwarden, the NAS password itself is not stored at all: it is read from the vault before each copy.
