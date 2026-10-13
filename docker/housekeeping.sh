#!/bin/sh
# Deletes daily log files that are older than the retention period, then
# empty sender folders. Runs once an hour for as long as the service runs.
#
#   housekeeping <retention days>
#
# With 3 days, today's file and the files of the 3 days before it are kept.
# Only files named YYYY-MM-DD.log are touched. The day boundary follows TZ,
# the same time zone rsyslog uses to name the files.
set -u

LOGS_DIR="${LOGS_DIR:-/data/logs}"
DAYS="${1:-}"

case "$DAYS" in
  '' | *[!0-9]*)
    echo "housekeeping: retention days must be a whole number, got '$DAYS'" >&2
    exit 1
    ;;
esac

while :; do
  cutoff=$(date -d "-${DAYS} days" +%F)
  removed=0
  for f in "$LOGS_DIR"/*/*.log; do
    [ -f "$f" ] || continue
    day=$(basename "$f" .log)
    case "$day" in
      [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
      *) continue ;;
    esac
    if [ "$day" \< "$cutoff" ]; then
      rm -f -- "$f" && removed=$((removed + 1))
    fi
  done
  find "$LOGS_DIR" -mindepth 1 -maxdepth 1 -type d -empty -delete 2>/dev/null
  if [ "$removed" -gt 0 ]; then
    echo "housekeeping: removed $removed log file(s) dated before $cutoff"
  fi
  sleep 3600
done
