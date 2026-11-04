# github-backup-cli

A Node.js/TypeScript CLI (`github-backup`) that backs up every repository you can reach through the GitHub CLI (`gh`): your personal repositories and those of all organizations you belong to, including wikis and Git LFS objects. Backups go to a local directory and/or any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO) as git bundle snapshots. A new snapshot is created only when branches or tags changed, and each target keeps the newest N snapshots per repository.

The goal is an independent, restorable copy of your complete git history in case you lose a repository or your GitHub account.

- Private, archived and forked repositories are included by default; narrow the set with glob filters.
- Branches and repositories deleted on GitHub stay in the backup (mirrors never prune).
- Runs once and exits: schedule it with cron or launchd.

## Requirements

- Node.js 22 or newer.
- `git`.
- The GitHub CLI `gh`, signed in with at least the `repo` and `read:org` scopes (`gh auth login`). If an organization enforces SAML SSO, authorize the token for it.
- `git-lfs` when LFS backup is enabled (the default). Without it `backup` stops with exit code 2 and tells you to install it or pass `--no-lfs`.
- Linux or macOS. Windows is not supported.

## Install

The tool is installed from the repository; it is not published to npm.

```sh
git clone https://github.com/sqaft/github-backup-cli.git
cd github-backup-cli
npm ci
npm run build
npm link            # optional: puts `github-backup` on your PATH
```

Without `npm link`, run `node dist/cli.js` instead of `github-backup`.

## Quick start

```sh
github-backup setup                  # choose where backups go
github-backup doctor                 # check tools, GitHub sign-in and target access
github-backup repos                  # which repositories would be backed up
github-backup backup                 # back them all up
github-backup snapshots acme/app     # what is stored for one repository
```

The first run mirrors every repository into the cache directory (`~/.cache/github-backup-cli`) and writes one snapshot per repository. Later runs fetch only what changed.

To try it without a config file, pass a directory: `github-backup backup --to ~/backups`. Running `backup` again skips unchanged repositories.

## Commands

```text
github-backup setup                    create the config file or add a target
github-backup doctor                   check tools, GitHub sign-in and target access
github-backup repos                    list the repositories that would be backed up
github-backup backup                   back up repositories to the targets
github-backup snapshots <owner/repo>   list a repository's snapshots on each target
```

`github-backup` without a command prints the help to stderr and exits with code 2.

| Flag | Commands | Meaning |
| --- | --- | --- |
| `-c`, `--config <path>` | all | Config file. Default `~/.config/github-backup-cli/config.json` (`$XDG_CONFIG_HOME/github-backup-cli/config.json` if set). |
| `--json` | all but `setup` | Machine-readable output on stdout (`repos`: the repositories; `backup`: the run summary; `doctor`: the checks; `snapshots`: the snapshots). |
| `-v`, `--verbose` | all but `setup` | Also log git commands and details. Cannot be combined with `--quiet`. |
| `-q`, `--quiet` | all but `setup` | Log only errors and the final summary. Also hides the `backup` progress block. |
| `-i`, `--include <glob>` | `repos`, `backup` | Only repositories whose `owner/repo` matches the glob. Repeatable. Default `*/*`. |
| `-e`, `--exclude <glob>` | `repos`, `backup` | Skip repositories matching the glob. Repeatable. Applied after `--include`. |
| `--no-archived` | `repos`, `backup` | Skip archived repositories. |
| `--no-forks` | `repos`, `backup` | Skip forks. |
| `--cache-dir <dir>` | `backup` | Directory for mirrors and temporary files. Default `~/.cache/github-backup-cli`. |
| `--concurrency <n>` | `backup` | Repositories processed in parallel (1-64). Default 4. |
| `--keep <n>` | `backup` | Snapshots kept per repository and target. Default 7; a target's own `keep` wins. |
| `--no-wiki` | `backup` | Skip wikis. |
| `--no-lfs` | `backup`, `doctor` | Skip Git LFS objects (also skips the `git-lfs` check). |
| `-t`, `--target <name>` | `backup`, `doctor`, `snapshots`, `setup` | Use only the configured target with this name. Repeatable. With `setup`, offers this name for the new target. |
| `--to <path>` | `backup`, `doctor`, `snapshots` | Add a temporary local target named `local` at this directory. |

`--no-archived`, `--no-forks`, `--no-wiki` and `--no-lfs` override the environment and the config file only when you type them.

`repos` prints a table (`REPO`, `ARCHIVED`, `FORK`, `WIKI`, `EMPTY`) and a total. `backup` writes log lines to stderr, a summary at the end, and with `--json` a machine-readable summary to stdout. The summary shows the duration, the counts and the bytes written; a snapshot written to two targets counts twice. Without any target (`--to` or a configured one) `backup` exits with code 2, unless [first-run setup](#first-run-setup) can ask for one.

### Checking the setup

`doctor` runs every check `backup` depends on without backing anything up, and reports all of them instead of stopping at the first problem. It writes nothing and does not list repositories. It exits with code 2 if a check failed.

```text
$ github-backup doctor
✓ config: /home/me/.config/github-backup-cli/config.json
✓ git
✓ git-lfs
✓ github
✓ target disk
✗ target r2: cannot access bucket "my-backups": Forbidden (HTTP 403)
```

### Listing snapshots

`snapshots <owner/repo>` shows what each target stores for one repository, newest first. Use `<owner/repo>.wiki` for a wiki. It reads only the targets, so it needs neither `gh` nor GitHub access and also finds repositories that were deleted on GitHub. It exits with code 1 if a target could not be read; the other targets are still shown.

```text
$ github-backup snapshots acme/app
TARGET  STAMP             SIZE    REFS
disk    20261104T023000Z  184 MB  42
disk    20261103T023000Z  183 MB  41
r2      20261104T023000Z  184 MB  42

3 snapshots
```

Repository names are matched exactly, including upper and lower case. When nothing is found, a warning names the targets that were searched and the exit code stays 0.

### Progress

When stderr is a terminal, `backup`, `repos`, `doctor` and `snapshots` show what they are working on while you wait, on a single line with a spinner and, after the first second, the running time:

```text
⠹ Listing repositories...  12s
```

Listing repositories through `gh` can take a while with many organizations. Once it is done, `backup` replaces the line with a progress block below the log lines:

```text
[█████████████░░░░░░░░░░░░░░░░░] 16/40 44%  2m 13s  ~2m 49s left
  backed up 9 · unchanged 5 · failed 2
  fetching             [█████░░░░░░░] 45%  github/acme/api  12s
  bundling             [██████████░░] 83%  github/acme/web  1m 4s
  writing to offsite   [███░░░░░░░░░] 27%  github/acme/web.wiki  3s
```

The first line shows how many repositories and wikis have finished, the elapsed time and, once there is enough to go on, a rough estimate of the time left. The bar, percentage and estimate also include the work done so far on the ones in flight, and every repository or wiki weighs the same, whatever its size. The second line counts the results so far. Each line below it is one repository or wiki in flight, with its current step, how far that step is and how long the repository or wiki has been running. Fetching, bundling and writing to S3 report a percentage; other steps, such as LFS transfers and writing to a local target, show only their name. The block disappears before the summary is printed. Neither the line nor the block is drawn with `--quiet`, when stderr is redirected (cron, launchd, files), or on a `TERM=dumb` terminal. With `--json` they stay on stderr, so stdout remains clean.

While the block is drawn, unchanged and skipped repositories are not logged one by one (`--verbose` shows them); written snapshots, warnings and errors are.

The block, log lines and summary use color on a terminal. `NO_COLOR` turns it off.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success (unchanged and skipped repositories count as success). |
| `1` | At least one repository, wiki, target or repository owner failed; the others were still backed up. |
| `2` | Configuration, flag or prerequisite error (missing tool, `gh` not signed in, bucket not reachable, no target), a missing command, or a failed `doctor` check. |
| `3` | Another `backup` run is in progress (lock in the cache directory). |
| `130` | Interrupted by SIGINT/SIGTERM (running git processes are stopped and the lock is released), or first-run setup was cancelled. |

A lock file (`<cacheDir>/.lock`, containing the PID) prevents overlapping runs; a lock left by a dead process is taken over.

## First-run setup

`github-backup setup` asks for one or more targets at the terminal:

- The storage: an S3-compatible bucket (Cloudflare R2, AWS S3, Backblaze B2 or another service) or a local directory.
- The target name, offering the `--target` value if you passed one.
- For S3: the provider's connection details, the bucket, a key prefix (default `git`) and the access keys. The secret access key is not shown while you type.

Every target is checked with the same access check `backup` uses; if it fails, you see the reason and can enter the settings again. The answers are saved to the config file path (`--config`, `GHBACKUP_CONFIG` or the default) with mode `600`. Ctrl-C saves nothing and exits with code 130.

If the config file already exists, `setup` adds the new targets to it and keeps every other field. If it does not, `setup` writes only `targets`; everything else keeps its default until you edit the file.

`backup` runs the same questions when it starts at a terminal without `--to` and the config file does not exist, then continues in the same run. `setup` needs a terminal, and `backup` asks only when both stdin and stderr are terminals, so cron and launchd jobs never wait for an answer: they exit with code 2 and the error names the missing config file. `backup` never changes an existing config file, and `repos`, `doctor`, `snapshots` and `backup --to <path>` do not ask.

## Configuration

Settings come from, in order of priority: command-line flag, environment variable, config file, built-in default. The config file is optional if flags and environment variables are enough. A ready-to-edit example is in [config.example.json](config.example.json).

```json
{
  "cacheDir": "~/.cache/github-backup-cli",
  "concurrency": 4,
  "wiki": true,
  "lfs": true,
  "keep": 7,
  "sources": [
    {
      "type": "github",
      "include": ["*/*"],
      "exclude": [],
      "archived": true,
      "forks": true
    }
  ],
  "targets": [
    { "type": "local", "name": "disk", "path": "/backups/git" },
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
  ]
}
```

The schema is strict: an unknown field is an error, and the message names the field path (for example `targets.0.bucket`). Target names must be unique.

### Top-level fields

| Field | Default | Environment variable | Flag |
| --- | --- | --- | --- |
| `cacheDir` | `~/.cache/github-backup-cli` | `GHBACKUP_CACHE_DIR` | `--cache-dir` |
| `concurrency` (1-64) | `4` | `GHBACKUP_CONCURRENCY` | `--concurrency` |
| `wiki` | `true` | `GHBACKUP_WIKI` | `--no-wiki` |
| `lfs` | `true` | `GHBACKUP_LFS` | `--no-lfs` |
| `keep` (positive integer) | `7` | `GHBACKUP_KEEP` | `--keep` |
| `sources` | one `github` source with the defaults below | - | - |
| `targets` | none | `GHBACKUP_TARGETS` (names to run, comma separated) | `--target`, `--to` |

Other environment variables: `GHBACKUP_CONFIG` (config file path, same as `--config`), `GHBACKUP_INCLUDE` and `GHBACKUP_EXCLUDE` (comma-separated globs), `GHBACKUP_S3_ACCESS_KEY_ID` and `GHBACKUP_S3_SECRET_ACCESS_KEY` (see [S3 targets](#s3-targets)). Booleans accept `true`, `false`, `1` and `0`. Empty variables are ignored.

`cacheDir` and a local target's `path` expand `~`, `$VAR` and `${VAR}`; relative paths are resolved against the current directory.

### `github` source

| Field | Default | Meaning |
| --- | --- | --- |
| `type` | - | Must be `"github"`. |
| `include` | `["*/*"]` | Globs on `owner/repo`; a repository must match at least one. An empty list accepts everything. |
| `exclude` | `[]` | Globs on `owner/repo`; matching repositories are skipped. |
| `archived` | `true` | `false` skips archived repositories. |
| `forks` | `true` | `false` skips forks. |

Globs match `owner/repo` case-insensitively: `*` and `?` do not cross `/`, `**` does, and a pattern without `/` matches nothing. So `acme/*` is every repository of `acme`, `*/*` is everything, and `*/legacy-*` is every repository whose name starts with `legacy-`. The flags and variables `--include`, `--exclude`, `--no-archived`, `--no-forks`, `GHBACKUP_INCLUDE` and `GHBACKUP_EXCLUDE` override these fields of every `github` source.

The source lists your own repositories plus those of every organization you are a member of. Repositories of other users that you merely collaborate on are not included. If an organization's repositories cannot be listed (for example SSO is not authorized), a warning is printed, the other owners are backed up, and the exit code is 1.

### Targets

Every target has a unique `name` and an optional `keep` that overrides the global `keep` and `--keep`.

`local`:

| Field | Meaning |
| --- | --- |
| `path` | Directory that receives the snapshots (created if missing). |

`s3`: see the next section.

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

Provider settings:

| Provider | `endpoint` | `region` | `forcePathStyle` |
| --- | --- | --- | --- |
| AWS S3 | omit | your bucket's region, e.g. `eu-central-1` | `false` |
| Cloudflare R2 | `https://<account-id>.r2.cloudflarestorage.com` | `auto` | `false` |
| Backblaze B2 | `https://s3.<region>.backblazeb2.com` (the endpoint shown for the bucket) | the region in the endpoint, e.g. `us-west-004` | `false` |
| MinIO | `http://host:9000` or your HTTPS URL | `us-east-1` | `true` |

The key needs `s3:ListBucket` (also used by the start-up bucket check), `s3:GetObject`, `s3:PutObject` and `s3:DeleteObject`; to clean up multipart uploads that were interrupted, also `s3:ListBucketMultipartUploads` and `s3:AbortMultipartUpload` (without them the cleanup is skipped). Restrict the key to this one bucket.

Before any work starts, `backup` checks every S3 target with a `HeadBucket` request. If the bucket is missing or the credentials are rejected, it prints the target name and the reason (with keys masked) and exits with code 2. Credentials in the config file are readable by anyone who can read that file: `chmod 600` it (a warning is printed otherwise; first-run setup already does this).

Objects are uploaded as streaming multipart uploads, so large bundles are not held in memory, and an object appears only when its upload completes. The manifest is uploaded last.

## What a backup contains

- All branches and tags with their full history (`refs/heads/*` and `refs/tags/*`). Pull request refs (`refs/pull/*`) are not fetched.
- The wiki repository of every repository that has one (a separate unit named `<repo>.wiki`).
- Git LFS objects: every snapshot of a repository that uses LFS gets a `<stamp>.lfs.tar` with all LFS objects of the mirror.

Mirrors in the cache directory are only ever fetched into, never pruned, so branches and repositories deleted on GitHub stay in the backup. Each bundle contains the whole repository, not just the changes since the previous snapshot.

## Snapshot layout

```text
<root>/<source>/<owner>/<repo>/<stamp>.bundle
<root>/<source>/<owner>/<repo>/<stamp>.lfs.tar   # only if the repository has LFS objects
<root>/<source>/<owner>/<repo>/<stamp>.json      # manifest, written last
<root>/<source>/<owner>/<repo>.wiki/...          # wiki, same layout (never has an .lfs.tar)
```

`<root>` is the target's `path`, or `s3://<bucket>/<prefix>` for S3 targets; both use the same layout. `<source>` is `github`. `<stamp>` is the UTC time as `YYYYMMDDTHHMMSSZ`.

The manifest is JSON: `version`, `source`, `fullName`, `stamp`, `refsHash` (SHA-256 of the sorted `<sha> <ref>` list), `refs` (name and SHA of every ref), `bundleBytes`, `lfsTarBytes` (if any) and `tool` (name and version). A snapshot without its `.json` manifest is incomplete: it is not counted, and it is removed on the next run.

A new snapshot is written to a target only when the repository's `refsHash` differs from the newest manifest on that target, so unchanged repositories take no extra space. After writing, each target keeps the newest `keep` snapshots per repository (bundle, LFS tar and manifest are deleted together).

## Scheduling

`github-backup` runs once and exits; use your system scheduler. Make sure `gh`, `git` and `git-lfs` are on the scheduler's `PATH` and that `gh` is signed in for the same user.

### cron

```cron
# Every day at 02:30; log lines go to a file, exit code 1/2/3 shows up in the log.
30 2 * * * PATH=/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin github-backup backup --quiet >> "$HOME/github-backup.log" 2>&1
```

Put targets and credentials in the config file. If a run may outlast the interval, nothing needs to be done: a second run exits with code 3 while the first holds the lock.

### launchd (macOS)

Save as `~/Library/LaunchAgents/com.example.github-backup.plist`, then run `launchctl load ~/Library/LaunchAgents/com.example.github-backup.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.example.github-backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/github-backup</string>
    <string>backup</string>
    <string>--quiet</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>2</integer>
    <key>Minute</key>
    <integer>30</integer>
  </dict>
  <key>StandardErrorPath</key>
  <string>/tmp/github-backup.log</string>
</dict>
</plist>
```

Use the path printed by `which github-backup` (or `node` with the full path to `dist/cli.js`).

## Restoring

There is no `restore` command; a snapshot is restored with git. Copy the files of one snapshot from the target first (from S3, for example `aws s3 cp --recursive s3://my-backups/git/github/acme/app/ . --exclude '*' --include '20260101T020000Z.*'`; add `--endpoint-url` for non-AWS services).

A bundle is a normal git repository history:

```sh
git clone ~/git-backup/github/acme/app/20260101T020000Z.bundle app
```

To get every branch and tag as local refs instead, use `git clone --mirror <bundle> app.git`. A wiki is restored the same way from `<repo>.wiki/<stamp>.bundle`.

If the snapshot has an `.lfs.tar`, clone with `GIT_LFS_SKIP_SMUDGE=1` (a bundle has no LFS server, so a plain clone fails at checkout), unpack the tar into the clone's `.git` directory and check the LFS files out:

```sh
GIT_LFS_SKIP_SMUDGE=1 git clone 20260101T020000Z.bundle restored
tar -xf 20260101T020000Z.lfs.tar -C restored/.git     # lfs/objects/... lands in .git/lfs/objects
cd restored && git lfs install --local && git lfs checkout
```

To push a restored repository to a new remote, add the remote and push the refs you need (`git push --mirror <url>` for a mirror clone; for LFS repositories also `git lfs push --all <url>`).

## Limitations

- Only git data, wikis and LFS objects are backed up. Issues, pull requests, comments, releases and release assets are not.
- Only github.com; GitHub Enterprise is not supported.
- Only your own repositories and those of organizations you belong to.
- `refs/pull/*` is not backed up.
- Nothing is ever deleted from the backup because it disappeared on GitHub; only old snapshots beyond `keep` are removed.
- No built-in scheduler and no `restore` command.
- Linux and macOS only.

## Development

```sh
npm ci
npm run lint        # Biome
npm run typecheck   # tsc --noEmit
npm test            # Vitest
npm run build       # tsc -> dist/
```

S3 integration tests run only when `GHBACKUP_TEST_S3_ENDPOINT` (plus `GHBACKUP_TEST_S3_ACCESS_KEY_ID` and `GHBACKUP_TEST_S3_SECRET_ACCESS_KEY`) point at an S3-compatible server; CI starts S3Proxy for this. LFS tests need `git-lfs` and are skipped without it.

To add a new source (another git service) or target (another storage), see [CONTRIBUTING.md](CONTRIBUTING.md).
