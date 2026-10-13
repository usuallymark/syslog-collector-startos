FROM debian:trixie-slim

# Must match RSYSLOG_VERSION in startos/utils.ts, which passes it in as a
# build argument. The build fails if Debian ships another rsyslog version, so
# the package version always says which rsyslog is inside (see UPDATING.md).
ARG RSYSLOG_VERSION

# rsyslog: the syslog receiver. tzdata: the time zone chosen in Configure
# Receiver names the daily files and stamps each line.
RUN apt-get update && apt-get install -y --no-install-recommends \
        rsyslog \
        tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/rsyslog.conf \
    && rm -rf /etc/rsyslog.d \
    && mkdir -p /var/spool/rsyslog

RUN rsyslogd -v | head -n 1 \
    && if ! rsyslogd -v | head -n 1 | grep -qF " ${RSYSLOG_VERSION:?} "; then \
        echo "rsyslog is not version ${RSYSLOG_VERSION}; update RSYSLOG_VERSION (see UPDATING.md)" >&2; \
        exit 1; \
    fi

COPY docker/housekeeping.sh /usr/local/bin/housekeeping
RUN chmod 755 /usr/local/bin/housekeeping
