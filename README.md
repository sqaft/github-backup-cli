# github-backup-cli

A Node.js/TypeScript CLI (`github-backup`) that backs up every repository you can reach through the GitHub CLI (`gh`): your personal repositories and those of all organizations you belong to, with wikis and Git LFS objects. Backups go to a local directory and/or any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO) as git bundle snapshots, and a new snapshot is created only when refs change.

Status: under development. `list` and `backup` to local and S3 targets work; Git LFS is not implemented yet. See the plan (Turkish) in [plans/README.md](plans/README.md).

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

## S3 targets

Any S3-compatible service works (AWS S3, Cloudflare R2, Backblaze B2, MinIO, ...). Add a target of type `s3` to the config file:

```json
{
  "type": "s3",
  "name": "r2",
  "bucket": "my-backups",
  "prefix": "git",
  "endpoint": "https://ACCOUNT_ID.r2.cloudflarestorage.com",
  "region": "auto",
  "forcePathStyle": false,
  "accessKeyId": "YOUR_ACCESS_KEY_ID",
  "secretAccessKey": "YOUR_SECRET_ACCESS_KEY",
  "keep": 14
}
```

| Field | Meaning |
| --- | --- |
| `bucket` | Bucket name (required). |
| `prefix` | Key prefix inside the bucket; leading, trailing and doubled `/` are ignored. Default: bucket root. |
| `endpoint` | Service URL; leave out for AWS S3. |
| `region` | Default `us-east-1`; R2 uses `auto`. |
| `forcePathStyle` | Use `https://host/bucket/key` instead of `https://bucket.host/key` (MinIO and some self-hosted services need it). Default `false`. |
| `accessKeyId`, `secretAccessKey` | Static credentials. If both are left out, `GHBACKUP_S3_ACCESS_KEY_ID` and `GHBACKUP_S3_SECRET_ACCESS_KEY` are used, and then the AWS SDK's default chain (environment, shared credentials file, instance role). Setting only one of the two is an error. |
| `keep` | Snapshots kept per repository on this target; overrides the global `keep` and `--keep`. |

The key needs `s3:ListBucket` (also used by the start-up bucket check), `s3:GetObject`, `s3:PutObject` and `s3:DeleteObject`; to clean up multipart uploads that were interrupted, also `s3:ListBucketMultipartUploads` and `s3:AbortMultipartUpload` (without them the cleanup is skipped). Restrict the key to this one bucket.

Before any work starts, `backup` checks every S3 target with a `HeadBucket` request. If the bucket is missing or the credentials are rejected, it prints the target name and the reason (with keys masked) and exits with code 2. Credentials in the config file are readable by anyone who can read that file: `chmod 600` it (a warning is printed otherwise).

Objects are uploaded as streaming multipart uploads, so large bundles are not held in memory, and an object appears only when its upload completes. The manifest is uploaded last.

## Snapshot layout

```text
<root>/<source>/<owner>/<repo>/<stamp>.bundle
<root>/<source>/<owner>/<repo>/<stamp>.json      # manifest, written last
<root>/<source>/<owner>/<repo>.wiki/...          # wiki, same layout
```

`<root>` is the target's `path`, or `s3://<bucket>/<prefix>` for S3 targets; both use the same layout. `<stamp>` is the UTC time as `YYYYMMDDTHHMMSSZ`. A snapshot without its `.json` manifest is incomplete and is removed on the next run.

## Restoring

A bundle is a normal git repository history:

```sh
git clone ~/git-backup/github/acme/app/20260101T020000Z.bundle app
```

To get every branch and tag as local refs instead, use `git clone --mirror <bundle> app.git`.
