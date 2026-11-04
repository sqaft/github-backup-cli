import { missingConfigHint } from "../config/load.js";
import { resolveKeep } from "../core/retention.js";
import { createSource } from "../sources/index.js";
import { createTarget } from "../targets/index.js";
import type { Manifest } from "../targets/types.js";
import { ConfigError, ExitCode } from "../util/errors.js";
import { formatBytes } from "../util/format.js";
import { formatTable } from "../util/table.js";
import { type CommandDeps, type CommonOptions, prepareWithProgress } from "./context.js";

export interface SnapshotsOptions extends CommonOptions {}

/** One snapshot of a repository in one target; `manifest` is null when it cannot be read. */
export interface SnapshotRow {
  target: string;
  repo: string;
  stamp: string;
  manifest: Manifest | null;
}

const HEADERS = ["TARGET", "STAMP", "SIZE", "REFS"] as const;

const SEGMENT = /^[A-Za-z0-9._-]+$/;

/** Accepts `owner/repo` and `owner/repo.wiki`. */
function parseRepo(repo: string): void {
  const segments = repo.split("/");
  const valid =
    segments.length === 2 && segments.every((s) => SEGMENT.test(s) && s !== "." && s !== "..");
  if (!valid) throw new ConfigError(`expected owner/repo, got "${repo}"`);
}

/** Aligned table of snapshots followed by a count line. */
export function renderSnapshots(rows: readonly SnapshotRow[]): string {
  const cells = rows.map(({ target, stamp, manifest }) => [
    target,
    stamp,
    manifest ? formatBytes(manifest.bundleBytes + (manifest.lfsTarBytes ?? 0)) : "-",
    manifest ? String(manifest.refs.length) : "-",
  ]);
  const total = `${rows.length} ${rows.length === 1 ? "snapshot" : "snapshots"}`;
  return `${formatTable(HEADERS, cells)}\n\n${total}`;
}

export function renderSnapshotsJson(rows: readonly SnapshotRow[]): string {
  return JSON.stringify(
    rows.map(({ target, repo, stamp, manifest }) => ({
      target,
      repo,
      stamp,
      bundleBytes: manifest?.bundleBytes ?? null,
      ...(manifest === null
        ? { lfsTarBytes: null }
        : manifest.lfsTarBytes === undefined
          ? {}
          : { lfsTarBytes: manifest.lfsTarBytes }),
      refs: manifest?.refs.length ?? null,
      refsHash: manifest?.refsHash ?? null,
    })),
    null,
    2,
  );
}

/**
 * `github-backup snapshots <owner/repo>`: snapshots of one repository in every target, newest
 * first. Reads only the targets, so it works without access to the source.
 */
export async function runSnapshots(
  repo: string,
  options: SnapshotsOptions,
  deps: CommandDeps,
): Promise<number> {
  parseRepo(repo);
  const { loaded, log, progress } = prepareWithProgress(options, deps);
  const { config } = loaded;
  if (config.targets.length === 0) {
    throw new ConfigError(
      "no targets configured; run github-backup setup" +
        missingConfigHint(loaded.missingConfigPath),
    );
  }

  const makeSource = deps.createSource ?? createSource;
  const sourceIds = [
    ...new Set(config.sources.map((source) => makeSource(source, { exec: deps.exec }).id)),
  ];
  const makeTarget = deps.createTarget ?? createTarget;
  const rows: SnapshotRow[] = [];
  let failed = false;

  for (const targetConfig of config.targets) {
    const target = makeTarget(targetConfig, { keep: resolveKeep(targetConfig.keep, config.keep) });
    progress?.activity(`Reading target ${target.name}`);
    try {
      const found: SnapshotRow[] = [];
      for (const sourceId of sourceIds) {
        const key = `${sourceId}/${repo}`;
        const stamps = (await target.listSnapshots(key)).slice().sort().reverse();
        for (const stamp of stamps) {
          found.push({
            target: target.name,
            repo: key,
            stamp,
            manifest: await target.readManifest(key, stamp),
          });
        }
      }
      rows.push(...found);
    } catch (err) {
      failed = true;
      log.error(err instanceof Error ? err.message : String(err), target.name);
    }
  }

  progress?.stop();

  if (rows.length === 0 && !failed) {
    const searched = config.targets.map((target) => target.name).join(", ");
    log.warn(`no snapshots of ${repo} on ${searched}; names are case-sensitive`);
  }
  deps.stdout(`${options.json ? renderSnapshotsJson(rows) : renderSnapshots(rows)}\n`);
  return failed ? ExitCode.PartialFailure : ExitCode.Success;
}
