# github-backup-cli

A Node.js/TypeScript CLI (`github-backup`) that backs up every repository you can reach through the GitHub CLI (`gh`): your personal repositories and those of all organizations you belong to, with wikis and Git LFS objects. Backups go to a local directory and/or any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO) as git bundle snapshots, and a new snapshot is created only when refs change.

Status: under development. `list` and `backup` to local targets work; S3 targets and Git LFS are not implemented yet. See the plan (Turkish) in [plans/README.md](plans/README.md).

## Requirements

Node.js 22 or newer, `git`, and the GitHub CLI (`gh`) signed in with at least the `repo` and `read:org` scopes. Linux and macOS.

## Build

```sh
npm ci && npm run build
node dist/cli.js list
```

## Usage

```sh
github-backup list [--include <glob>] [--exclude <glob>] [--no-archived] [--no-forks] [--json]
github-backup backup --local ~/git-backup [--keep 7] [--concurrency 4] [--no-wiki] [--json]
```

`backup` mirrors every repository (and its wiki) into the cache directory (`~/.cache/github-backup-cli` by default), and writes a new snapshot to each target when the branches or tags changed since the last one. Mirrors only ever grow: branches deleted on GitHub stay in the backup. Each target keeps the newest `keep` snapshots per repository (default 7; a target's own `keep` wins over `--keep`).

`--target <name>` runs only the named targets from the config file; `--local <path>` adds a temporary `local` target. Without any target the command exits with code 2. Log lines go to stderr; `--json` prints a machine-readable summary to stdout.

Exit codes: `0` success, `1` at least one repository failed (the others are still backed up), `2` configuration or prerequisite error, `3` another run is in progress, `130` interrupted.

## Snapshot layout

```text
<root>/<source>/<owner>/<repo>/<stamp>.bundle
<root>/<source>/<owner>/<repo>/<stamp>.json      # manifest, written last
<root>/<source>/<owner>/<repo>.wiki/...          # wiki, same layout
```

`<stamp>` is the UTC time as `YYYYMMDDTHHMMSSZ`. A snapshot without its `.json` manifest is incomplete and is removed on the next run.

## Restoring

A bundle is a normal git repository history:

```sh
git clone ~/git-backup/github/acme/app/20260101T020000Z.bundle app
```

To get every branch and tag as local refs instead, use `git clone --mirror <bundle> app.git`.
