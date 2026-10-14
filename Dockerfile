FROM debian:trixie-slim

# Must match RSYSLOG_VERSION in startos/utils.ts, which passes it in as a
# build argument. The build fails if Debian ships another rsyslog version, so
# the package version always says which rsyslog is inside (see UPDATING.md).
ARG RSYSLOG_VERSION
ARG RBW_VERSION=1.15.0

# - rsyslog: the syslog receiver
# - tzdata: the time zone chosen in Configure Receiver names the daily files
#   and stamps each line
# - python3 (+ pip, build time only): collector.py, retention and NAS copy
# - curl, ca-certificates: download rbw below
# - pinentry-curses: required by the rbw package (our own pinentry is used)
RUN apt-get update && apt-get install -y --no-install-recommends \
        rsyslog \
        tzdata \
        python3 \
        python3-pip \
        curl \
        ca-certificates \
        pinentry-curses \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/rsyslog.conf \
    && rm -rf /etc/rsyslog.d \
    && mkdir -p /var/spool/rsyslog

RUN rsyslogd -v | head -n 1 \
    && if ! rsyslogd -v | head -n 1 | grep -qF " ${RSYSLOG_VERSION:?} "; then \
        echo "rsyslog is not version ${RSYSLOG_VERSION}; update RSYSLOG_VERSION (see UPDATING.md)" >&2; \
        exit 1; \
    fi

# smbprotocol (SMB client for the NAS copy), hash-pinned in
# docker/requirements.txt, generated from docker/requirements.in.
COPY docker/requirements.txt /tmp/requirements.txt
RUN pip install --break-system-packages --no-cache-dir --target /opt/python-libs \
        --require-hashes --only-binary :all: -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt \
    && apt-get purge -y python3-pip && apt-get autoremove -y \
    && PYTHONPATH=/opt/python-libs python3 -c 'import smbclient'
ENV PYTHONPATH=/opt/python-libs

# rbw (Bitwarden/Vaultwarden CLI) to read the NAS login from Vaultwarden.
# - amd64: the author's .deb
# - arm64: the author publishes no arm64 build; these binaries were compiled
#   from the same release once and are sha256-pinned (see UPDATING.md)
RUN ARCH="$(dpkg --print-architecture)" && \
    if [ "$ARCH" = "amd64" ]; then \
        curl -fsSL "https://git.tozt.net/rbw/releases/deb/rbw_${RBW_VERSION}_amd64.deb" -o /tmp/rbw.deb && \
        dpkg -i /tmp/rbw.deb && \
        rm /tmp/rbw.deb; \
    elif [ "$ARCH" = "arm64" ]; then \
        RBW_URL="https://github.com/usuallymark/openclaw-extrabutter-startos/releases/download/rbw-arm64-${RBW_VERSION}" && \
        curl -fsSL "$RBW_URL/rbw" -o /usr/local/bin/rbw && \
        curl -fsSL "$RBW_URL/rbw-agent" -o /usr/local/bin/rbw-agent && \
        echo "11e2fc0effa04148388fa03c71e39edb3a191ea9a7909d81d3d330ee99de05c6  /usr/local/bin/rbw" | sha256sum -c - && \
        echo "4854370cc9fb74af3ed5c82159ddebbe5c63e6e9cc70176f6ea417b25be1d3c5  /usr/local/bin/rbw-agent" | sha256sum -c - && \
        chmod 755 /usr/local/bin/rbw /usr/local/bin/rbw-agent; \
    else \
        echo "Unsupported arch: $ARCH" && exit 1; \
    fi \
    && rbw --version

COPY docker/collector.py /usr/local/bin/collector
COPY docker/alerter.py /usr/local/bin/alerter.py
COPY docker/pinentry-file.sh /usr/local/bin/pinentry-file
RUN chmod 755 /usr/local/bin/collector /usr/local/bin/pinentry-file
