#!/bin/sh
# Non-interactive pinentry for rbw: answers GETPIN with the Vaultwarden
# master password saved by Configure NAS Copy. Assuan requires "%" to be
# escaped; printf keeps backslashes intact.
CREDS=/data/rbw/master-password
echo 'OK Pleased to meet you'
while read -r line; do
  case "$line" in
    GETPIN*) printf 'D %s\n' "$(sed 's/%/%25/g' "$CREDS")"; echo OK ;;
    BYE*) echo OK; exit 0 ;;
    *) echo OK ;;
  esac
done
