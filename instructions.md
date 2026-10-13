# Log Collector

Log Collector receives syslog from devices on your network and writes it into plain text files: one folder per device, one file per day. Nothing needs to be set up before it starts; the defaults work.

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
2026-10-13T14:02:11.408211-05:00 10.0.0.1 local0.info firewall filterlog[61522]: ...
```

That is: when it was received, the sender's IP address, the facility and severity, the hostname the device sent, the program, and the message.

## Getting set up

1. Open **Interfaces > Syslog** and note the address and port (port **5514** by default).
2. On each device, set that address and port as a remote syslog server. Examples are below.
3. Check the **Last Message** health check on the dashboard. Within a minute of a device sending something, it shows the device's folder name.
4. Optionally, run **Actions > Configure Receiver** to change the port, turn UDP or TCP off, name folders by IP address instead of hostname, change how many days are kept (3 by default), or set your time zone (UTC by default). The time zone decides when each daily file starts.

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

## Limitations

- **No port 514.** StartOS keeps ports below 1025 for itself, so devices must be able to send to a custom port. Most firewalls, NAS systems and servers can; a few simple home routers cannot.
- **No encryption (TLS) yet.** Messages travel across your network in plain text, like standard syslog. Do not expose the Syslog interface to the internet.
- **No sender filtering yet.** Any device that can reach the address and port can write logs.
- Logs of StartOS itself are not collected.
- Files older than the retention period are deleted, checked once an hour. Back up or copy anything you want to keep longer.

## Backups

A StartOS backup includes the settings and all log files that exist at backup time.
