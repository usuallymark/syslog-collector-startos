"""Log Collector alerts: watch new log lines and notify through ntfy.

Run by `collector alerts`. It follows the daily files rsyslog writes (it
never touches them, so alerting can neither lose nor delay a log line),
applies the rules from the "alerts" section of /etc/collector.json, and for
every alert:

- appends a record to /data/alerts/<YYYY-MM-DD>.jsonl (time, rule, device,
  count, and the log file and line numbers of the lines that triggered it);
- unless in dry run, sends a short, fixed notification to ntfy. Log text is
  never sent: it comes from the devices, can carry secrets, and the
  notification may show on a lock screen.

One alert per rule and device, then a cooldown that rolls repeats into a
count, sent when the cooldown ends. Failed deliveries are queued and retried
with backoff; they never block anything else. Status for the Alerts health
check goes to /data/state/alerts-status.json.
"""

import collections
import datetime
import json
import os
import re
import ssl
import subprocess
import time
import urllib.error
import urllib.request

LOGS_DIR = os.environ.get('LOGS_DIR', '/data/logs')
STATE_DIR = os.environ.get('STATE_DIR', '/data/state')
ALERTS_DIR = os.environ.get('ALERTS_DIR', '/data/alerts')
SECRETS = os.environ.get('COLLECTOR_SECRETS', '/data/secrets.json')

STATE_FILE = os.path.join(STATE_DIR, 'alerter.json')
STATUS_FILE = os.path.join(STATE_DIR, 'alerts-status.json')
REJECTED_FILE = os.path.join(STATE_DIR, 'rejected.json')
PUSH_STATE = os.path.join(STATE_DIR, 'nas-push.json')
TEST_TRIGGER = os.path.join(STATE_DIR, 'alert-test')

DAY_FILE = re.compile(r'^\d{4}-\d{2}-\d{2}\.log$')

# Standard OpenSSH and PAM wording, the same on any Linux or BSD system.
AUTH_FAILURE = re.compile(
    r'Failed password|authentication failure|Invalid user', re.IGNORECASE
)

SEVERITIES = {
    'emerg': 0, 'alert': 1, 'crit': 2, 'err': 3, 'warning': 4,
    'notice': 5, 'info': 6, 'debug': 7,
}

RULE_TITLES = {
    'stopped': 'Logging stopped',
    'resumed': 'Logging resumed',
    'unknownSender': 'Unknown sender',
    'severity': 'High-severity message',
    'volume': 'Volume spike',
    'collector': 'Collector problem',
    'authBurst': 'Authentication failures',
}

BUCKET = 600  # volume buckets: 10 minutes
BASELINE_BUCKETS = 144  # 24 hours
MIN_HISTORY = 36  # 6 hours before the volume rule can fire


def log(msg):
    print(f'alerts: {msg}', flush=True)


def now_iso(t=None):
    return (
        datetime.datetime.fromtimestamp(t if t is not None else time.time())
        .astimezone()
        .isoformat(timespec='seconds')
    )


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


def secret(name):
    return load_json(SECRETS, {}).get(name) or ''


def safe_name(text):
    """A device name fit for a notification: senders choose their own
    hostnames, so keep only plain characters and a sane length."""
    clean = re.sub(r'[^A-Za-z0-9._:-]', '_', str(text))[:48]
    return clean or 'unknown'


# ── Following the day files ─────────────────────────────────────────────────


class Tailer:
    """Reads lines added to the day files since the last call. Remembers the
    byte offset and line number of every file, so a restart resumes where
    it stopped and line numbers in alert records stay right."""

    def __init__(self, files):
        self.files = files  # rel path -> {"offset": int, "line": int}

    def scan(self, start_at_end=False):
        out = []
        present = set()
        try:
            devices = sorted(os.listdir(LOGS_DIR))
        except OSError:
            return out
        for device in devices:
            d = os.path.join(LOGS_DIR, device)
            if not os.path.isdir(d):
                continue
            for name in sorted(os.listdir(d)):
                if not DAY_FILE.match(name):
                    continue
                rel = f'{device}/{name}'
                path = os.path.join(d, name)
                present.add(rel)
                try:
                    size = os.path.getsize(path)
                except OSError:
                    continue
                pos = self.files.get(rel)
                if pos is None:
                    if start_at_end:
                        # First run: count the lines already there, do not
                        # alert on them.
                        self.files[rel] = {'offset': size, 'line': count_lines(path, size)}
                        continue
                    pos = self.files[rel] = {'offset': 0, 'line': 0}
                if size < pos['offset']:  # file replaced
                    pos['offset'], pos['line'] = 0, 0
                if size == pos['offset']:
                    continue
                with open(path, 'rb') as f:
                    f.seek(pos['offset'])
                    chunk = f.read(size - pos['offset'])
                end = chunk.rfind(b'\n')
                if end < 0:
                    continue  # no complete line yet
                for raw in chunk[: end + 1].splitlines():
                    pos['line'] += 1
                    out.append((device, rel, pos['line'], raw.decode('utf-8', 'replace')))
                pos['offset'] += end + 1
        for rel in [r for r in self.files if r not in present]:
            del self.files[rel]
        return out


def count_lines(path, size):
    n = 0
    with open(path, 'rb') as f:
        remaining = size
        while remaining > 0:
            block = f.read(min(1 << 20, remaining))
            if not block:
                break
            n += block.count(b'\n')
            remaining -= len(block)
    return n


def parse(line):
    """Fields of a collector line: time, source IP, severity, message."""
    parts = line.split(' ', 5)
    if len(parts) < 5:
        return None
    _, ip, facsev = parts[0], parts[1], parts[2]
    sev = SEVERITIES.get(facsev.rsplit('.', 1)[-1])
    message = parts[5] if len(parts) > 5 else ''
    tag = parts[4]
    return {'ip': ip, 'severity': sev, 'text': f'{tag} {message}'}


# ── Alert bookkeeping ───────────────────────────────────────────────────────


class Alerts:
    def __init__(self, cfg, state):
        self.cfg = cfg
        self.state = state
        self.cooldown = int(cfg.get('cooldownMinutes', 30)) * 60
        self.windows = collections.defaultdict(collections.deque)

    def title(self, rule):
        if rule.startswith('custom:'):
            return rule[len('custom:'):]
        return RULE_TITLES.get(rule, rule)

    def priority(self, rule):
        if rule.startswith('custom:'):
            for c in self.cfg.get('custom', []):
                if 'custom:' + c['name'] == rule:
                    return int(c.get('priority', 4))
            return 4
        key = 'stopped' if rule == 'resumed' else rule
        return int((self.cfg.get('rules', {}).get(key) or {}).get('priority', 4))

    def event(self, rule, device, ref=None, now=None):
        """One occurrence. Sends at once outside the cooldown; inside it, the
        event is counted and summed up when the cooldown ends."""
        now = now if now is not None else time.time()
        key = f'{rule}|{device}'
        cd = self.state.setdefault('cooldowns', {}).setdefault(
            key, {'until': 0, 'pending': 0, 'since': None, 'refs': []}
        )
        if ref:
            cd['refs'] = (cd['refs'] + [ref])[-50:]
        if now >= cd['until']:
            refs = cd['refs'] or ([ref] if ref else [])
            self.fire(rule, device, 1, now, refs, now)
            cd.update(until=now + self.cooldown, pending=0, since=None, refs=[])
        else:
            cd['pending'] += 1
            cd['since'] = cd['since'] or now

    def flush(self, now=None):
        """Send the roll-ups of cooldowns that have ended."""
        now = now if now is not None else time.time()
        for key, cd in list(self.state.get('cooldowns', {}).items()):
            if now < cd['until']:
                continue
            if cd['pending']:
                rule, device = key.split('|', 1)
                self.fire(rule, device, cd['pending'], cd['since'], cd['refs'], now)
                cd.update(until=now + self.cooldown, pending=0, since=None, refs=[])
            elif now - cd['until'] > 86400:
                del self.state['cooldowns'][key]

    def fire(self, rule, device, count, since, refs, now):
        dry = bool(self.cfg.get('dryRun'))
        record = {
            'time': now_iso(now),
            'rule': rule,
            'device': device,
            'count': count,
            'since': now_iso(since),
            'lines': refs,
            'dryRun': dry,
        }
        os.makedirs(ALERTS_DIR, exist_ok=True)
        day = datetime.datetime.fromtimestamp(now).strftime('%Y-%m-%d')
        with open(os.path.join(ALERTS_DIR, f'{day}.jsonl'), 'a') as f:
            f.write(json.dumps(record, sort_keys=True) + '\n')
        status = self.state.setdefault('status', {})
        status['lastRecorded'] = {'time': record['time'], 'rule': rule, 'device': device}
        log(f'{self.title(rule)} on {device} ({count})' + (' [dry run]' if dry else ''))
        if dry:
            return
        since_txt = datetime.datetime.fromtimestamp(since).strftime('%H:%M')
        text = (
            f'{self.title(rule)} on {safe_name(device)}, {count} event(s) '
            f'since {since_txt}. Check the logs.'
        )
        self.state.setdefault('queue', []).append(
            {'title': f'Log Collector: {self.title(rule)}', 'text': text,
             'priority': self.priority(rule), 'tries': 0, 'next': 0}
        )

    def burst(self, key, need, window, now):
        """True when `need` events fell within `window` seconds."""
        q = self.windows[key]
        q.append(now)
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= need:
            q.clear()
            return True
        return False


# ── ntfy ────────────────────────────────────────────────────────────────────


def ntfy_token(ntfy):
    src = ntfy.get('tokenSource', 'none')
    if src == 'manual':
        return secret('ntfyToken')
    if src == 'vaultwarden':
        if not ntfy.get('vaultReady'):
            raise RuntimeError('Vaultwarden is not set up; connect it in Configure Vaultwarden')
        # A hidden custom field (OpenClaw Extra Butter keeps it in "api_key"),
        # or "password" for the item's own password.
        item = ntfy.get('vaultItem', '')
        field = ntfy.get('vaultField') or 'api_key'
        subprocess.run(['rbw', 'unlock'], capture_output=True, timeout=90)
        r = subprocess.run(
            ['rbw', 'get', '--field', field, item], capture_output=True, text=True, timeout=60
        )
        if r.returncode != 0 or not r.stdout.strip():
            raise RuntimeError(
                f'Vaultwarden item "{item}", field "{field}": '
                f'{r.stderr.strip() or "empty or not found"}'
            )
        return r.stdout.strip()
    return ''


def ntfy_send(ntfy, title, text, priority):
    url = ntfy['url'].rstrip('/') + '/' + ntfy['topic']
    req = urllib.request.Request(url, data=text.encode('utf-8'), method='POST')
    req.add_header('Title', title)
    req.add_header('Priority', str(priority))
    req.add_header('Tags', 'warning')
    token = ntfy_token(ntfy)
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    ctx = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE') or None)
    try:
        with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
            r.read()
    except urllib.error.HTTPError as e:
        hint = {401: 'unauthorized: check the token', 403: 'forbidden: the token may not publish to this topic'}
        raise RuntimeError(f'ntfy answered {e.code}' + (f' ({hint[e.code]})' if e.code in hint else ''))
    except urllib.error.URLError as e:
        raise RuntimeError(f'could not reach ntfy: {e.reason}')


def deliver(cfg, state, now):
    queue = state.get('queue', [])
    status = state.setdefault('status', {})
    for item in list(queue):
        if now < item['next']:
            continue
        try:
            ntfy_send(cfg['ntfy'], item['title'], item['text'], item['priority'])
            queue.remove(item)
            status['lastSent'] = now_iso(now)
            status['lastError'] = None
        except Exception as e:
            item['tries'] += 1
            item['next'] = now + min(30 * 60, 60 * 2 ** (item['tries'] - 1))
            status['lastError'] = str(e)
            status['lastErrorAt'] = now_iso(now)
            log(f'delivery failed (try {item["tries"]}): {e}')
            if item['tries'] >= 20:  # about 8 hours: give up on this one
                queue.remove(item)
            break  # the server is probably down: try again later
    status['queued'] = len(queue)


# ── The rules ───────────────────────────────────────────────────────────────


def run(full_cfg):
    cfg = full_cfg.get('alerts') or {}
    if not cfg.get('enabled'):
        log('off')
        save_json(STATUS_FILE, {'enabled': False})
        while True:
            time.sleep(86400)

    cfg.setdefault('ntfy', {})['vaultReady'] = bool(full_cfg.get('vault'))
    rules = cfg.get('rules', {})
    custom = []
    for c in cfg.get('custom', []):
        try:
            pattern = re.compile(c['pattern'] if c.get('regex') else re.escape(c['pattern']), re.IGNORECASE)
        except re.error as e:
            log(f'custom rule "{c["name"]}" skipped: {e}')
            continue
        custom.append((c, pattern, set(c.get('devices') or [])))
    # Single allowed addresses with their own silence limit: IP -> (name, seconds).
    watched = {w['ip']: (w['name'], int(w.get('minutes', 15)) * 60) for w in cfg.get('watched', [])}

    state = load_json(STATE_FILE, {})
    first_run = 'files' not in state
    tailer = Tailer(state.setdefault('files', {}))
    alerts = Alerts(cfg, state)
    seen = state.setdefault('lastSeen', {})  # source IP -> time
    stopped = state.setdefault('stopped', {})  # source IP -> time it stopped
    volume = state.setdefault('volume', {})  # device -> {"bucket", "count", "history"}
    rejected_seen = state.setdefault('rejectedSeen', {})  # IP -> total seen
    started = time.time()
    for ip in watched:
        seen.setdefault(ip, started)
    for ip in [ip for ip in stopped if ip not in watched]:
        del stopped[ip]  # no longer watched: no "resumed" alert for it
    tailer.scan(start_at_end=first_run)
    if first_run:  # earlier rejections are not news
        for ip, e in load_json(REJECTED_FILE, {}).get('ips', {}).items():
            rejected_seen[ip] = int(e.get('total', 0))

    n_rules = sum(1 for k in RULE_TITLES if k != 'resumed' and (rules.get(k) or {}).get('on')) + len(custom)
    log(f'on, {n_rules} rule(s)' + (', dry run' if cfg.get('dryRun') else ''))
    last_save = last_minute = 0.0

    while True:
        now = time.time()

        if os.path.exists(TEST_TRIGGER):
            try:
                os.remove(TEST_TRIGGER)
            except OSError:
                pass
            state.setdefault('queue', []).insert(0, {
                'title': 'Log Collector: test alert',
                'text': 'Test alert from Log Collector. Alerts reach this device.',
                'priority': 3, 'tries': 0, 'next': 0,
            })

        # Close volume buckets.
        bucket = int(now // BUCKET)
        for v in volume.values():
            while v['bucket'] < bucket:
                v['history'] = (v['history'] + [v['count']])[-BASELINE_BUCKETS:]
                v['count'] = 0
                v['fired'] = False
                v['bucket'] += 1
                if bucket - v['bucket'] > BASELINE_BUCKETS:  # long gap
                    v['bucket'] = bucket

        for device, rel, lineno, line in tailer.scan():
            f = parse(line)
            if not f:
                continue
            ref = {'file': rel, 'line': lineno}
            ip = f['ip']
            seen[ip] = now
            if ip in stopped:
                if (rules.get('stopped') or {}).get('on'):
                    alerts.event('resumed', watched.get(ip, (ip, 0))[0], ref, now)
                del stopped[ip]

            r = rules.get('severity') or {}
            if r.get('on') and f['severity'] is not None and f['severity'] <= int(r.get('max', 2)):
                alerts.event('severity', device, ref, now)

            r = rules.get('authBurst') or {}
            if r.get('on') and AUTH_FAILURE.search(f['text']):
                if alerts.burst(f'auth|{device}', int(r.get('count', 10)), int(r.get('minutes', 5)) * 60, now):
                    alerts.event('authBurst', device, ref, now)

            for c, pattern, devices in custom:
                if devices and device not in devices:
                    continue
                if pattern.search(f['text']):
                    if alerts.burst(f'custom:{c["name"]}|{device}', int(c.get('count', 1)), int(c.get('minutes', 5)) * 60, now):
                        alerts.event('custom:' + c['name'], device, ref, now)

            r = rules.get('volume') or {}
            if r.get('on'):
                v = volume.setdefault(device, {'bucket': int(now // BUCKET), 'count': 0, 'history': []})
                v['count'] += 1
                hist = v['history']
                if len(hist) >= MIN_HISTORY:
                    base = max(1.0, sum(hist) / len(hist))
                    if v['count'] >= int(r.get('minLines', 200)) and v['count'] > float(r.get('factor', 10)) * base and not v.get('fired'):
                        v['fired'] = True
                        alerts.event('volume', device, ref, now)

        if now - last_minute >= 60:
            last_minute = now
            r = rules.get('stopped') or {}
            if r.get('on'):
                for ip, (name, limit) in watched.items():
                    if ip not in stopped and now - seen.get(ip, started) > limit:
                        stopped[ip] = now
                        alerts.event('stopped', name, None, now)

            r = rules.get('unknownSender') or {}
            if r.get('on'):
                rej = load_json(REJECTED_FILE, {}).get('ips', {})
                for ip, e in rej.items():
                    total = int(e.get('total', 0))
                    if total > int(rejected_seen.get(ip, 0)):
                        rejected_seen[ip] = total
                        alerts.event('unknownSender', ip, None, now)

            r = rules.get('collector') or {}
            if r.get('on'):
                push = load_json(PUSH_STATE, {})
                if full_cfg.get('nas') and push.get('lastError'):
                    ok = push.get('lastSuccess')
                    t_ok = datetime.datetime.fromisoformat(ok).timestamp() if ok else started
                    if now - t_ok > 3600:
                        alerts.event('collector', 'nas-copy', None, now)
                try:
                    fs = os.statvfs(LOGS_DIR)
                    if fs.f_blocks and fs.f_bavail / fs.f_blocks < 0.05:
                        alerts.event('collector', 'disk', None, now)
                except OSError:
                    pass

        alerts.flush(now)
        if state.get('queue') and (cfg.get('ntfy') or {}).get('url'):
            deliver(cfg, state, now)

        if now - last_save >= 10:
            last_save = now
            status = state.setdefault('status', {})
            status.update(enabled=True, dryRun=bool(cfg.get('dryRun')), rules=n_rules,
                          queued=len(state.get('queue', [])))
            save_json(STATE_FILE, state)
            save_json(STATUS_FILE, status)
        time.sleep(2)
