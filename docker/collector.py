#!/usr/bin/env python3
"""Log Collector helper: local retention and the copy to an SMB share.

    collector housekeeping   delete expired local files, once an hour
    collector push           copy the daily files to the NAS, on a schedule

Both run for as long as the service runs. Settings come from the JSON file
main.ts writes into the container at every start (COLLECTOR_CONFIG). The
push state, read by the health check, is /data/state/nas-push.json.

A local file is deleted only once it is past the local retention period
and, while the NAS copy is on, has been copied to the NAS in its final
state. Only files named YYYY-MM-DD.log inside a sender folder are ever
deleted, locally or on the NAS.
"""

import datetime
import json
import os
import re
import subprocess
import sys
import time

CONFIG = os.environ.get('COLLECTOR_CONFIG', '/etc/collector.json')
SECRETS = os.environ.get('COLLECTOR_SECRETS', '/data/secrets.json')
LOGS_DIR = os.environ.get('LOGS_DIR', '/data/logs')
STATE_DIR = os.environ.get('STATE_DIR', '/data/state')
STATE_FILE = os.path.join(STATE_DIR, 'nas-push.json')
PUSH_NOW = os.path.join(STATE_DIR, 'push-now')
RSYSLOG_STATS = os.path.join(STATE_DIR, 'rsyslog-stats.json')
REJECTED_FILE = os.path.join(STATE_DIR, 'rejected.json')

DAY_FILE = re.compile(r'^\d{4}-\d{2}-\d{2}\.log$')


def log(msg):
    print(msg, flush=True)


def now_iso():
    return datetime.datetime.now().astimezone().isoformat(timespec='seconds')


def load_config():
    with open(CONFIG) as f:
        return json.load(f)


def load_state():
    try:
        with open(STATE_FILE) as f:
            s = json.load(f)
        if isinstance(s, dict):
            s.setdefault('files', {})
            return s
    except (OSError, ValueError):
        pass
    return {'files': {}}


def save_state(state):
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = STATE_FILE + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(state, f, indent=2, sort_keys=True)
    os.replace(tmp, STATE_FILE)


def cutoff(days):
    """Files dated before this YYYY-MM-DD are expired (local time, TZ)."""
    return (datetime.date.today() - datetime.timedelta(days=days)).isoformat()


def local_day_files():
    """[(relative path 'sender/YYYY-MM-DD.log', absolute path)], sorted."""
    out = []
    try:
        senders = sorted(os.listdir(LOGS_DIR))
    except OSError:
        return out
    for sender in senders:
        d = os.path.join(LOGS_DIR, sender)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            p = os.path.join(d, name)
            if DAY_FILE.match(name) and os.path.isfile(p):
                out.append((f'{sender}/{name}', p))
    return out


# ── Local retention ─────────────────────────────────────────────────────────


def housekeeping_once(cfg):
    days = int(cfg['localRetentionDays'])
    nas_on = bool(cfg.get('nas'))
    limit = cutoff(days)
    state = load_state() if nas_on else {}
    # Copies made to an earlier NAS destination do not count.
    if nas_on and state.get('filesTarget') != target(cfg['nas']):
        state['files'] = {}
    files = state.get('files', {})
    removed = kept = 0
    for rel, path in local_day_files():
        day = os.path.basename(rel)[:-4]
        if day >= limit:
            continue
        if nas_on and files.get(rel) != os.path.getsize(path):
            kept += 1  # not on the NAS yet: keep it until it is
            continue
        os.remove(path)
        removed += 1
    for sender in os.listdir(LOGS_DIR) if os.path.isdir(LOGS_DIR) else []:
        d = os.path.join(LOGS_DIR, sender)
        if os.path.isdir(d) and not os.listdir(d):
            os.rmdir(d)
    if removed:
        log(f'housekeeping: removed {removed} log file(s) dated before {limit}')
    if kept:
        log(f'housekeeping: kept {kept} expired file(s) that are not on the NAS yet')


# ── Rejected senders ────────────────────────────────────────────────────────


def read_reject_counters():
    """rsyslog's per-IP reject counters (counts since rsyslog started), from
    the newest "rejected" line impstats wrote; then empty the stats file so
    it never grows. None if impstats wrote nothing since the last read."""
    try:
        with open(RSYSLOG_STATS) as f:
            lines = f.readlines()
        with open(RSYSLOG_STATS, 'w'):
            pass
    except OSError:
        return None
    latest = None
    for line in lines:
        start = line.find('{')
        if start < 0:
            continue
        try:
            rec = json.loads(line[start:])
        except ValueError:
            continue
        if rec.get('origin') == 'dynstats.bucket' and rec.get('name') == 'rejected':
            latest = rec.get('values') or {}
    return latest


def load_json(path, default):
    try:
        with open(path) as f:
            v = json.load(f)
        return v if isinstance(v, type(default)) else default
    except (OSError, ValueError):
        return default


def save_json(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(value, f, indent=2, sort_keys=True)
    os.replace(tmp, path)


def rejected_once(started_at):
    """Fold new reject counts into rejected.json (totals, last seen, and the
    most recent rejected IP), and log each IP at most once an hour."""
    counters = read_reject_counters()
    if counters is None:
        return
    state = load_json(REJECTED_FILE, {})
    ips = state.setdefault('ips', {})
    # Counters restart at zero when rsyslog restarts.
    if state.get('since') != started_at:
        state['since'] = started_at
        for e in ips.values():
            e['counter'] = 0
    now = time.time()
    for ip, count in counters.items():
        e = ips.setdefault(ip, {'total': 0, 'counter': 0})
        delta = count - e.get('counter', 0)
        if delta < 0:
            delta = count
        e['counter'] = count
        if delta <= 0:
            continue
        e['total'] = e.get('total', 0) + delta
        e['lastSeen'] = now_iso()
        state['last'] = {'ip': ip, 'at': e['lastSeen']}
        e.setdefault('pending', 0)
        e['pending'] += delta
        if now - e.get('lastLogged', 0) >= 3600:
            log(f'allow-list: rejected {e["pending"]} line(s) from {ip}')
            e['lastLogged'] = now
            e['pending'] = 0
    # Forget IPs not seen for 30 days.
    cutoff_iso = (datetime.datetime.now().astimezone() - datetime.timedelta(days=30)).isoformat()
    for ip in [ip for ip, e in ips.items() if e.get('lastSeen', '') < cutoff_iso and ip not in counters]:
        del ips[ip]
    save_json(REJECTED_FILE, state)


def housekeeping(cfg):
    started_at = now_iso()
    next_retention = 0.0
    while True:
        if time.time() >= next_retention:
            try:
                housekeeping_once(cfg)
            except Exception as e:  # keep running; try again next hour
                log(f'housekeeping: {e}')
            next_retention = time.time() + 3600
        if cfg.get('allowList'):
            try:
                rejected_once(started_at)
            except Exception as e:
                log(f'allow-list: {e}')
        time.sleep(60)


# ── Credentials ─────────────────────────────────────────────────────────────


class PushError(RuntimeError):
    pass


def rbw(*args, timeout=90):
    r = subprocess.run(
        ['rbw', *args], capture_output=True, text=True, timeout=timeout
    )
    return r.returncode, r.stdout, r.stderr.strip()


def secret(name):
    """A password saved by Configure NAS Copy (root-only secrets.json)."""
    try:
        with open(SECRETS) as f:
            return json.load(f).get(name) or ''
    except (OSError, ValueError):
        return ''


def credentials(nas):
    c = nas['credentials']
    if c['source'] == 'manual':
        password = secret('nasPassword')
        if not password:
            raise PushError('no NAS password saved; enter it in Configure NAS Copy')
        return c['username'], password
    item = c['item']
    if not c.get('baseUrl'):
        raise PushError('no Vaultwarden URL set; enter it in Configure NAS Copy')
    code, _, err = rbw('unlock')
    if code != 0:
        raise PushError(
            f'Vaultwarden: could not sign in or unlock the vault: {first_line(err)}. '
            'Check the URL, email and master password. rbw 1.15.0 works with '
            'Vaultwarden up to 1.35.x; with 1.36 or later, enter the NAS login '
            'in Configure NAS Copy instead'
        )
    code, _, err = rbw('sync')
    if code != 0:
        # Keep going with rbw's local copy of the vault.
        log(f'push: Vaultwarden sync failed, using the local copy: {first_line(err)}')
    code, out, err = rbw('get', '--raw', item)
    if code != 0:
        raise PushError(f'Vaultwarden: item "{item}": {first_line(err)}')
    try:
        data = json.loads(out).get('data') or {}
    except ValueError:
        raise PushError(f'Vaultwarden: item "{item}" could not be read')
    user, password = data.get('username'), data.get('password')
    if not user or not password:
        raise PushError(
            f'Vaultwarden: item "{item}" needs a username and a password (a Login item)'
        )
    return user, password


def prepare_rbw(c):
    """Start each run with a fresh rbw agent; sign out of Vaultwarden when
    the account or the server address changed, so rbw signs in again."""
    rbw('stop-agent', timeout=20)
    marker = os.path.join(os.environ.get('HOME', '/data/rbw'), 'signed-in-as.json')
    now = {'email': c.get('email'), 'baseUrl': c.get('baseUrl')}
    try:
        with open(marker) as f:
            before = json.load(f)
    except (OSError, ValueError):
        before = None
    if before != now:
        if before is not None:
            log('push: Vaultwarden account or address changed, signing in again')
        rbw('purge', timeout=20)
        os.makedirs(os.path.dirname(marker), exist_ok=True)
        with open(marker, 'w') as f:
            json.dump(now, f)


def first_line(text):
    lines = [l for l in (text or '').splitlines() if l.strip()]
    return lines[-1].strip() if lines else 'unknown error'


# ── NAS copy ────────────────────────────────────────────────────────────────


def unc(host, share, *parts):
    segs = []
    for p in parts:
        segs += [s for s in str(p).replace('\\', '/').split('/') if s and s != '.']
    if '..' in segs:
        raise PushError('".." is not allowed in the NAS folder')
    return '\\\\' + '\\'.join([host, share, *segs])


KNOWN_ERRORS = [
    ('STATUS_LOGON_FAILURE', 'wrong username or password'),
    ('STATUS_ACCOUNT_DISABLED', 'the NAS account is disabled'),
    ('STATUS_BAD_NETWORK_NAME', 'share "{share}" does not exist'),
    ('STATUS_ACCESS_DENIED', 'access denied: the account cannot write to this share or folder'),
    ('STATUS_DISK_FULL', 'the NAS share is full'),
]


def explain(e, host, share):
    text = str(e)
    for code, msg in KNOWN_ERRORS:
        if code in text:
            return msg.format(share=share)
    if isinstance(e, (ConnectionError, TimeoutError)) or 'timed out' in text.lower() or 'Failed to connect' in text:
        return f'could not connect to {host} on port 445 ({text})'
    return text


def target(nas):
    return f'//{nas["host"]}/{nas["share"]}/{nas["folder"]}'


def push_once(cfg, state):
    import smbclient  # smbprotocol
    from smbprotocol.exceptions import SMBException

    nas = cfg['nas']
    host, share, folder = nas['host'], nas['share'], nas['folder']
    user, password = credentials(nas)
    try:
        smbclient.register_session(
            host, username=user, password=password, connection_timeout=30
        )
        # Open the share itself first: makedirs() on a share that does not
        # exist never returns (smbprotocol 1.17).
        try:
            smbclient.listdir(unc(host, share))
        except OSError as e:
            if e.errno == 2:
                raise PushError(f'NAS: share "{share}" was not found on {host}')
            raise
        base = unc(host, share, folder)
        smbclient.makedirs(base, exist_ok=True)

        # A new destination starts from scratch: everything is copied again.
        target_id = target(nas)
        if state.get('filesTarget') != target_id:
            state['filesTarget'] = target_id
            state['files'] = {}

        copied = 0
        files = state['files']
        local = local_day_files()
        for rel, path in local:
            size = os.path.getsize(path)
            if files.get(rel) == size:
                continue
            sender, name = rel.split('/')
            remote_dir = unc(host, share, folder, sender)
            smbclient.makedirs(remote_dir, exist_ok=True)
            dest = remote_dir + '\\' + name
            part = remote_dir + '\\.' + name + '.part'
            with open(path, 'rb') as src:
                data = src.read(size)  # exactly what has been written so far
            with smbclient.open_file(part, mode='wb') as dst:
                dst.write(data)
            smbclient.replace(part, dest)
            files[rel] = len(data)
            copied += 1
        # Forget files that no longer exist locally.
        present = {rel for rel, _ in local}
        for rel in list(files):
            if rel not in present:
                del files[rel]

        # NAS retention: only YYYY-MM-DD.log files in sender folders.
        limit = cutoff(int(nas['retentionDays']))
        removed = 0
        for entry in smbclient.scandir(base):
            if not entry.is_dir():
                continue
            sender_dir = base + '\\' + entry.name
            here = 0
            for name in [e.name for e in smbclient.scandir(sender_dir)]:
                if DAY_FILE.match(name) and name[:-4] < limit:
                    smbclient.remove(sender_dir + '\\' + name)
                    here += 1
            if here and not smbclient.listdir(sender_dir):
                smbclient.rmdir(sender_dir)
            removed += here
        return copied, removed
    except PushError:
        raise
    except (SMBException, OSError, ValueError) as e:
        raise PushError(f'NAS: {explain(e, host, share)}')
    finally:
        try:
            smbclient.reset_connection_cache()
        except Exception:
            pass


def push(cfg):
    nas = cfg.get('nas')
    if not nas:
        log('push: the NAS copy is off')
        while True:
            time.sleep(86400)
    interval = int(nas['intervalMinutes']) * 60
    if nas['credentials']['source'] != 'manual':
        prepare_rbw(nas['credentials'])
    log(
        f'push: copying to //{nas["host"]}/{nas["share"]}/{nas["folder"]} '
        f'every {nas["intervalMinutes"]} min'
    )
    next_run = 0.0
    while True:
        forced = os.path.exists(PUSH_NOW)
        if forced or time.time() >= next_run:
            if forced:
                try:
                    os.remove(PUSH_NOW)
                except OSError:
                    pass
            state = load_state()
            state['target'] = target(nas)
            state['lastAttempt'] = now_iso()
            try:
                copied, removed = push_once(cfg, state)
                state['lastSuccess'] = state['lastAttempt']
                state['lastError'] = None
                log(
                    f'push: done, {copied} file(s) copied'
                    + (f', {removed} expired file(s) removed from the NAS' if removed else '')
                )
            except Exception as e:
                state['lastError'] = str(e) or e.__class__.__name__
                log(f'push: failed: {state["lastError"]}')
            save_state(state)
            next_run = time.time() + interval
        time.sleep(10)


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ('housekeeping', 'push', 'push-once'):
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    cfg = load_config()
    cmd = sys.argv[1]
    if cmd == 'housekeeping':
        housekeeping(cfg)
    elif cmd == 'push':
        push(cfg)
    else:  # one copy, for testing
        state = load_state()
        print(push_once(cfg, state))
        save_state(state)


if __name__ == '__main__':
    main()
