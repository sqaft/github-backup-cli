import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import type { RepoInfo, Source } from "../sources/types.js";
import type { Target } from "../targets/types.js";
import { runPool, withRetry } from "../util/async.js";
import type { Exec } from "../util/exec.js";
import type { Logger } from "../util/log.js";
import type { ProgressReporter } from "../util/progress.js";
import { formatStamp, sleep } from "../util/time.js";
import type { ToolInfo } from "../util/tool.js";
import { createGit } from "./git.js";
import { createLfsTar, fetchLfs, hasLfsObjects } from "./lfs.js";
import { syncMirror } from "./mirror.js";
import { applyRetention } from "./retention.js";
import { buildManifest, createBundle, hashRefs, listRefs } from "./snapshot.js";

export type UnitKind = "repo" | "wiki";
export type UnitStatus = "ok" | "unchanged" | "skipped" | "failed";

export interface TargetResult {
  target: string;
  status: "created" | "unchanged" | "failed";
  stamp?: string;
  /** Size of the snapshot written (bundle plus LFS archive); set for `created`. */
  bytes?: number;
  error?: string;
}

/** Outcome for one repository or one wiki. */
export interface UnitResult {
  /** `<source>/<owner>/<repo>` or `<source>/<owner>/<repo>.wiki`. */
  key: string;
  kind: UnitKind;
  status: UnitStatus;
  reason?: string;
  error?: string;
  targets: TargetResult[];
}

export interface Summary {
  ok: number;
  unchanged: number;
  skipped: number;
  failed: number;
  /** Bytes written over all targets; a snapshot stored in two targets counts twice. */
  bytes: number;
  results: UnitResult[];
  /** True when the run was aborted by a signal. */
  interrupted: boolean;
}

export interface BackupInput {
  repos: RepoInfo[];
  /** Sources by id, used for the git authentication environment. */
  sources: Map<string, Source>;
  targets: Target[];
  cacheDir: string;
  concurrency: number;
  wiki: boolean;
  /** Also back up Git LFS objects (repositories only, not wikis). */
  lfs: boolean;
}

export interface BackupContext {
  exec: Exec;
  log: Logger;
  tool: ToolInfo;
  /** Told about every unit and the phase it is in. */
  progress?: ProgressReporter;
  signal?: AbortSignal;
  now?: () => Date;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Waits before the retries of a failed step. */
  retryDelaysMs?: readonly number[];
}

export const RETRY_DELAYS_MS = [1000, 5000] as const;

/** Share of a unit finished after each step; writing to the targets takes the rest. */
const PHASE_END = { fetch: 0.4, bundle: 0.6, lfs: 0.8 } as const;

interface Unit {
  key: string;
  kind: UnitKind;
  repo: RepoInfo;
  url?: string;
  mirrorDir: string;
  /** Set when there is nothing to do for this unit. */
  skip?: string;
}

function planUnits(input: BackupInput): Unit[] {
  const units: Unit[] = [];
  for (const repo of input.repos) {
    const key = `${repo.source}/${repo.owner}/${repo.name}`;
    const mirrorBase = path.join(input.cacheDir, repo.source, repo.owner);
    units.push({
      key,
      kind: "repo",
      repo,
      url: repo.cloneUrl,
      mirrorDir: path.join(mirrorBase, `${repo.name}.git`),
      ...(repo.isEmpty ? { skip: "empty" } : {}),
    });
    if (input.wiki && repo.hasWiki) {
      units.push({
        key: `${key}.wiki`,
        kind: "wiki",
        repo,
        url: repo.wikiUrl,
        mirrorDir: path.join(mirrorBase, `${repo.name}.wiki.git`),
        ...(repo.wikiUrl ? {} : { skip: "no wiki" }),
      });
    }
  }
  return units;
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function finish(unit: Unit, status: UnitStatus, targets: TargetResult[], extra = {}): UnitResult {
  return { key: unit.key, kind: unit.kind, status, targets, ...extra };
}

async function processUnit(
  unit: Unit,
  input: BackupInput,
  ctx: BackupContext,
): Promise<UnitResult> {
  const { log, progress } = ctx;
  // Per-unit lines would flood the area above a progress block.
  const chatty = (text: string, scope: string) => log[progress ? "debug" : "info"](text, scope);
  const phase = (label: string, from: number, to = from) =>
    progress?.phase(unit.key, label, from, to);
  const onPercent = progress ? (percent: number) => progress.percent(unit.key, percent) : undefined;
  if (unit.skip !== undefined) {
    chatty(`skipped: ${unit.skip}`, unit.key);
    return finish(unit, "skipped", [], { reason: unit.skip });
  }
  const source = input.sources.get(unit.repo.source);
  if (!source || !unit.url) {
    return finish(unit, "failed", [], { error: `no source "${unit.repo.source}" for ${unit.key}` });
  }

  const git = createGit({
    exec: ctx.exec,
    env: source.gitEnv(),
    signal: ctx.signal,
    log,
    scope: unit.key,
  });
  const retry = <T>(fn: () => Promise<T>) =>
    withRetry(fn, {
      delaysMs: ctx.retryDelaysMs ?? RETRY_DELAYS_MS,
      sleep: ctx.sleep ?? sleep,
      signal: ctx.signal,
      onRetry: (err, attempt) => log.warn(`retry ${attempt}: ${message(err)}`, unit.key),
    });
  const url = unit.url;
  let tmpDir: string | undefined;

  try {
    phase("fetching", 0, PHASE_END.fetch);
    const mirror = await retry(() =>
      syncMirror(git, { mirrorDir: unit.mirrorDir, url, kind: unit.kind, onPercent }),
    );
    if (mirror.status === "skipped") {
      chatty(`skipped: ${mirror.reason}`, unit.key);
      return finish(unit, "skipped", [], { reason: mirror.reason });
    }

    phase("checking targets", PHASE_END.fetch);
    const refs = await listRefs(git, unit.mirrorDir);
    if (refs.length === 0) {
      chatty("skipped: empty", unit.key);
      return finish(unit, "skipped", [], { reason: "empty" });
    }
    const refsHash = hashRefs(refs);

    const results: TargetResult[] = [];
    const pending: Target[] = [];
    for (const target of input.targets) {
      try {
        const latest = await retry(() => target.latestManifest(unit.key));
        if (latest?.refsHash === refsHash) {
          results.push({ target: target.name, status: "unchanged" });
        } else {
          pending.push(target);
        }
      } catch (err) {
        results.push({ target: target.name, status: "failed", error: message(err) });
      }
    }

    if (pending.length > 0) {
      phase("bundling", PHASE_END.fetch, PHASE_END.bundle);
      tmpDir = await mkdtemp(path.join(input.cacheDir, "tmp", "unit-"));
      const bundle = path.join(tmpDir, "snapshot.bundle");
      const bundleBytes = await retry(() => createBundle(git, unit.mirrorDir, bundle, onPercent));
      let lfsTar: string | undefined;
      let lfsTarBytes: number | undefined;
      // LFS objects belong to refs, so they are only fetched when a new snapshot is due.
      if (input.lfs && unit.kind === "repo") {
        phase("fetching LFS", PHASE_END.bundle, PHASE_END.lfs);
        await retry(() => fetchLfs(git, unit.mirrorDir));
        if (await hasLfsObjects(unit.mirrorDir)) {
          phase("archiving LFS", PHASE_END.lfs);
          lfsTar = path.join(tmpDir, "snapshot.lfs.tar");
          const file = lfsTar;
          lfsTarBytes = await retry(() => createLfsTar(unit.mirrorDir, file));
        }
      }
      const stamp = formatStamp((ctx.now ?? (() => new Date()))());
      const manifest = buildManifest({
        source: unit.repo.source,
        fullName: unit.kind === "wiki" ? `${unit.repo.fullName}.wiki` : unit.repo.fullName,
        stamp,
        refs,
        bundleBytes,
        ...(lfsTarBytes === undefined ? {} : { lfsTarBytes }),
        tool: ctx.tool,
      });
      const writeShare = (1 - PHASE_END.lfs) / pending.length;
      for (const [index, target] of pending.entries()) {
        const writeEnd = PHASE_END.lfs + writeShare * (index + 1);
        try {
          phase(`writing to ${target.name}`, writeEnd - writeShare, writeEnd);
          await retry(() =>
            target.putSnapshot(
              unit.key,
              stamp,
              {
                bundle,
                ...(lfsTar ? { lfsTar } : {}),
                manifest,
              },
              onPercent,
            ),
          );
          phase(`pruning ${target.name}`, writeEnd);
          await retry(() => applyRetention(target, unit.key));
          results.push({
            target: target.name,
            status: "created",
            stamp,
            bytes: bundleBytes + (lfsTarBytes ?? 0),
          });
          log.info(`snapshot ${stamp} written to ${target.name}`, unit.key);
        } catch (err) {
          results.push({ target: target.name, status: "failed", error: message(err) });
        }
      }
    }

    const failed = results.filter((r) => r.status === "failed");
    if (failed.length > 0) {
      const error = failed.map((r) => `${r.target}: ${r.error}`).join("; ");
      log.error(error, unit.key);
      return finish(unit, "failed", results, { error });
    }
    const created = results.some((r) => r.status === "created");
    if (!created) chatty("unchanged", unit.key);
    return finish(unit, created ? "ok" : "unchanged", results);
  } catch (err) {
    const error = ctx.signal?.aborted ? "interrupted" : message(err);
    log.error(error, unit.key);
    return finish(unit, "failed", [], { error });
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  }
}

async function trackUnit(unit: Unit, input: BackupInput, ctx: BackupContext): Promise<UnitResult> {
  ctx.progress?.unitStart(unit.key);
  const result = await processUnit(unit, input, ctx);
  ctx.progress?.unitDone(unit.key, result.status);
  return result;
}

export function summarize(results: UnitResult[], interrupted: boolean): Summary {
  const count = (status: UnitStatus) => results.filter((r) => r.status === status).length;
  return {
    ok: count("ok"),
    unchanged: count("unchanged"),
    skipped: count("skipped"),
    failed: count("failed"),
    bytes: results.reduce(
      (sum, r) => sum + r.targets.reduce((inner, t) => inner + (t.bytes ?? 0), 0),
      0,
    ),
    results,
    interrupted,
  };
}

/** Mirrors, snapshots and stores every repository (and wiki) with bounded concurrency. */
export async function backupRepos(input: BackupInput, ctx: BackupContext): Promise<Summary> {
  const tmpRoot = path.join(input.cacheDir, "tmp");
  // The run lock is held, so leftovers in tmp/ belong to a run that was killed.
  await rm(tmpRoot, { recursive: true, force: true });
  await mkdir(tmpRoot, { recursive: true });
  try {
    const units = planUnits(input);
    ctx.progress?.start(units.length);
    const results = await runPool(
      units,
      input.concurrency,
      (unit) => trackUnit(unit, input, ctx),
      ctx.signal,
    );
    return summarize(results, ctx.signal?.aborted ?? false);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}
