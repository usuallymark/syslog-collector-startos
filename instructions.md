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
4. Add your sending devices under **Configure Receiver > Allowed Senders** (the task on the service page takes you there). Until you do, the Rejected Senders check warns that every sender is accepted.
5. Optionally, in **Actions > Configure Receiver**, change the port, turn UDP or TCP off, change how folders are named, change how many days are kept on this server (3 by default), or pick your time zone (UTC by default; choose a region, then a city). The time zone decides when each daily file starts.
6. Optionally, set up the copy to a NAS (below).

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

## Limiting who can send

Until you set an allow-list, anything that can reach the address and port can write logs, including fake lines. Log Collector still accepts them, so your first test works, but it raises a task asking you to set the list, and the **Rejected Senders** health check shows a warning beginning "Danger: No allow-list". In **Configure Receiver > Allowed Senders**, list the devices that may send: an IPv4 address (`10.0.0.1`), an IPv4 range (`10.0.0.0/24`) or an IPv6 address, each with an optional label. Messages from any other address are dropped before they are written.

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
  - **From Vaultwarden**: create a Login item holding the NAS username and password, then enter Vaultwarden's URL, the item's name, your Vaultwarden account email and your master password. If the URL uses a name ending in `.local`, also enter the IP address it stands for (StartOS services cannot look up `.local` names). If Vaultwarden's HTTPS certificate is signed by your own certificate authority, for example the root CA of the StartOS server it runs on, paste that CA certificate. The item is read before every copy, so a changed NAS password is picked up by itself.

  **Vaultwarden version limit:** the bundled rbw 1.15.0, the newest release, cannot sign in to Vaultwarden 1.36 or later. The Vaultwarden option therefore works with Vaultwarden up to 1.35.x only, which also rules out the current Vaultwarden package on StartOS. With a newer Vaultwarden, use **Enter here**.

The folder on the NAS mirrors the one here: `syslog/firewall/2026-10-13.log`. **Actions > Push Now** copies at once, and the **NAS Copy** health check shows when the last copy worked, or why it failed.

While the copy is on, a file is only deleted from this server after it has been copied in its final state, even when the NAS is unreachable for longer than the retention period. Watch the **Log Storage** check if that happens.

## Limitations

- **No port 514.** StartOS keeps ports below 1025 for itself, so devices must be able to send to a custom port. Most firewalls, NAS systems and servers can; a few simple home routers cannot.
- **No encryption (TLS) yet.** Messages travel across your network in plain text, like standard syslog. Do not expose the Syslog interface to the internet.
- **Sender filtering is by address only.** Without an allow-list, any device that can reach the port can write logs; with one, a forged UDP source address can still get through. Prefer TCP.
- Logs of StartOS itself are not collected.
- Files older than the retention period are deleted, checked once an hour. Use the NAS copy, or back up, to keep them longer.
- The NAS copy speaks SMB only.
- Reading the NAS login from Vaultwarden works with Vaultwarden up to 1.35.x (see above).

## Backups

A StartOS backup includes the settings, the saved passwords, and all log files that exist at backup time.

## Where passwords are kept

The NAS password ("Enter here") and the Vaultwarden master password are stored in one file on this server that only root can read. They are never shown again in a form, never written to the service logs, and never sent anywhere but to the NAS and to Vaultwarden. When the login comes from Vaultwarden, the NAS password itself is not stored at all: it is read from the vault before each copy.
