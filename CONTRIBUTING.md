# Contributing

## Setup and checks

```sh
git clone https://github.com/sqaft/github-backup-cli.git
cd github-backup-cli
npm ci
npm run dev -- --help   # run from source
npm run lint        # Biome (npm run format fixes formatting)
npm run typecheck   # tsc --noEmit
npm test            # Vitest: unit tests and integration tests with real temporary git repositories
npm run build       # tsc -> dist/
```

All four must pass before a change is merged; CI runs them on Node 22 and 24. You need `git` and `git-lfs` locally (LFS tests are skipped without `git-lfs`). S3 integration tests run only when `GHBACKUP_TEST_S3_ENDPOINT`, `GHBACKUP_TEST_S3_ACCESS_KEY_ID` and `GHBACKUP_TEST_S3_SECRET_ACCESS_KEY` point at an S3-compatible server such as S3Proxy (see `.github/workflows/ci.yml` for the container CI uses).

## Ground rules

- The core (`src/core`) knows nothing about a specific source or target type. Type-specific code lives only in `src/sources/*` and `src/targets/*`.
- Call external programs only through `Exec` from `src/util/exec.ts`, with an argument array (no shell). Modules take `exec` as a dependency so tests can pass a fake.
- Never change the user's global git config. Authentication for git child processes goes through the environment returned by `Source.gitEnv()`.
- Write run output only through the `Logger`, never `console.*` or `process.stderr`: during a backup the progress block owns stderr, and a direct write corrupts it.
- Terminal colors go through `Paint` from `src/util/color.ts`. Fit a line to the terminal width before painting it: cutting a string that contains escape codes corrupts the display.
- Never log tokens or access keys, and keep them out of error messages. Register secrets with the logger (`log.addSecret`) and strip credentials from URLs in messages.
- New behavior comes with tests. Test git operations against real temporary repositories (`test/helpers/git.ts`: `TestRemote`, `fakeSource`, `isolatedExec`), and pure logic with table-driven unit tests.
- Code, comments, the README and commit messages are in English.
- The configuration schema is strict. When you change it, update `config.example.json` and the configuration reference in `README.md` in the same change. The same goes for flags and environment variables (`src/program.ts`, `src/config/load.ts`, README).

## Adding a source

A source is a git service the backup reads repositories from (the first one is `github`, using the `gh` CLI).

1. Implement the `Source` interface from `src/sources/types.ts` in `src/sources/<id>.ts`:
   - `id`: the source type. It becomes the first segment of every repo key (`<id>/<owner>/<repo>`) and the folder name in the cache and in the targets.
   - `checkPrerequisites()`: throw `PrerequisiteError` when a tool or login is missing.
   - `listRepos()`: return `{ repos, failures }`. An owner that cannot be listed goes into `failures`; do not throw for it.
   - `gitEnv()`: environment for git child processes (credential helper, `GIT_TERMINAL_PROMPT=0`).
2. Add a `type` branch to `sourceSchema` in `src/config/schema.ts` (a strict object; `filterRepos` needs `include`, `exclude`, `archived` and `forks`). `load.ts` applies flag and environment overrides to `github` sources only; extend `applyOverrides` if the new source should honor them too.
3. Register it in `createSource` in `src/sources/index.ts`.
4. Add tests (parsing of the service's output with a fake `exec`, as `test/unit/github-source.test.ts` does) and update `config.example.json` and the README.

## Adding a target

A target is a storage that receives snapshots (`local` and `s3` exist).

1. Implement the `Target` interface from `src/targets/types.ts` in `src/targets/<type>.ts`. Keep the shared layout `<root>/<source>/<owner>/<repo>/<stamp>.{bundle,lfs.tar,json}` and reuse the file name parsing in `src/targets/names.ts`. The contract that the core relies on:
   - `putSnapshot` writes the bundle and LFS tar first and the manifest last; a snapshot without its manifest is incomplete. Files must not appear under their final name before they are complete.
   - `putSnapshot` calls `onPercent` with the share of bytes stored so far when the storage can tell; without it the progress block shows only the step name.
   - `listSnapshots` returns only snapshots that have a manifest, oldest first.
   - `readManifest` returns the manifest of one snapshot, or null when it is missing or not valid JSON. Storage errors are thrown.
   - `deleteSnapshot` removes the manifest first.
   - `cleanupIncomplete` removes leftovers that have no manifest.
   - `checkAccess` (optional) fails early with a readable reason when the storage is unreachable. It must not change the storage; `doctor` runs it too.
2. Add a `type` branch to `targetSchema` in `src/config/schema.ts` (strict object with `name`, an optional `keep` and the type's own fields). If a field needs expansion or a credential fallback, handle it in `resolveTarget` or the credential step of `loadConfig` in `src/config/load.ts`.
3. Register it in `createTarget` in `src/targets/index.ts`, and add its first-run questions: export a `TargetSetup` (from `src/targets/types.ts`) and list it in `TARGET_SETUPS`. `prompt` returns the raw target; `src/commands/setup.ts` validates it, runs `checkAccess` and writes the file. Ask through `askText`, `askYesNo` and `askChoice` from `src/util/prompt.ts`, and pass `hidden: true` for secrets.
4. Add unit tests with a fake client and integration tests against a real service or a local stand-in, in the style of `test/integration/local-target.test.ts` and `test/integration/s3-target.test.ts`, and cover the questions in `test/unit/setup.test.ts`.
5. Update `config.example.json`, the README (target reference and snapshot layout) and, if the layout or manifest changes, `src/core/snapshot.ts`.

## Commits and pull requests

Write commit messages in English with a short imperative subject. Keep a pull request to one logical change, and describe what changed and how you verified it.
