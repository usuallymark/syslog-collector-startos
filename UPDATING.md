# Updating

## rsyslog

"Upstream" is Debian stable's `rsyslog` package. The image installs whatever
Debian trixie ships, and the build fails unless `rsyslogd -v` reports
`RSYSLOG_VERSION` from `startos/utils.ts`.

When Debian moves to a new rsyslog version (the build fails with "rsyslog is
not version ..."):

1. Set `RSYSLOG_VERSION` in `startos/utils.ts` to the new version.
2. Freeze the current version: copy `startos/versions/current.ts` to
   `startos/versions/v<x>_<y>_<z>_<rev>.ts`, rename its export, and add it to
   `other:` in `startos/versions/index.ts` (newest first).
3. In `current.ts`, set `version` to `<new rsyslog version>:0` and write the
   release notes.
4. Run `npm run check`, then test on a StartOS box before pushing.

A Debian security update within the same rsyslog version (for example
`8.2504.0-1+deb13u1`) builds without changes; release it by bumping only the
revision after the colon in `current.ts` (`8.2504.0:1`).

## Python libraries

`docker/requirements.txt` pins `smbprotocol` and its dependencies by hash.
Change the version in `docker/requirements.in`, then regenerate with the
command at the top of `requirements.txt`.

## rbw

`RBW_VERSION` in the Dockerfile. rbw 1.15.0 (the newest release as of
2026-10) signs in, unlocks, syncs and reads with Vaultwarden 1.37.4, tested
on StartOS both at an address and over the bridge. It cannot create or edit
items on Vaultwarden 1.37 and later (rbw issue #385); this package only
reads. The amd64 build uses the author's `.deb`;
the arm64 binaries come from the `rbw-arm64-<version>` release of
openclaw-extrabutter-startos (built there by its `build-rbw-arm64.yml`
workflow) and are pinned by sha256. A new rbw version needs new arm64
binaries and new pins.

## start-sdk

Bump `@start9labs/start-sdk` in `package.json`, run `npm install`, read the
SDK changelog for anything that affects this package, then `npm run check`.
Commit the updated `package-lock.json`.
