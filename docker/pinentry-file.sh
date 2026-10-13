#!/bin/sh
# Non-interactive pinentry for rbw: answers GETPIN with the Vaultwarden
# master password saved by Configure NAS Copy, read from the root-only
# /data/secrets.json. Assuan requires "%" (and line breaks) to be escaped.
echo 'OK Pleased to meet you'
while read -r line; do
  case "$line" in
    GETPIN*)
      python3 -c 'import json,sys
p = json.load(open("/data/secrets.json")).get("vaultMasterPassword") or ""
sys.stdout.write("D " + p.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A") + "\n")'
      echo OK
      ;;
    BYE*) echo OK; exit 0 ;;
    *) echo OK ;;
  esac
done
