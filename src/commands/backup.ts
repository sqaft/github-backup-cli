import path from "node:path";
import { type LoadedConfig, missingConfigHint } from "../config/load.js";
import { checkGit, checkLfs, checkTarget } from "../core/checks.js";
import { discoverRepos } from "../core/discover.js";
import { acquireLock, type Lock } from "../core/lock.js";
import { resolveKeep } from "../core/retention.js";
import { backupRepos, type Summary } from "../core/run.js";
import type { ListFailure } from "../sources/types.js";
import { createTarget } from "../targets/index.js";
import { type Paint, plain } from "../util/color.js";
import { ConfigError, ExitCode } from "../util/errors.js";
import { formatBytes } from "../util/format.js";
import type { Logger } from "../util/log.js";
import { formatDuration, type ProgressDisplay } from "../util/progress.js";
import { readToolInfo } from "../util/tool.js";
import { type CommandDeps, type CommonOptions, prepareWithProgress } from "./context.js";
import { setupMissingConfig } from "./setup.js";

export interface BackupOptions extends CommonOptions {}

/** Lines printed to stderr at the end of a run. */
export function renderSummary(
  summary: Summary,
  listFailures: ListFailure[],
  durationMs: number,
  paint: Paint = plain,
): string[] {
  const written = summary.bytes > 0 ? `, ${formatBytes(summary.bytes)} written` : "";
  const lines = [
    `Backup finished in ${formatDuration(durationMs)}: ${summary.ok} backed up, ` +
      `${summary.unchanged} unchanged, ${summary.skipped} skipped, ${summary.failed} failed` +
      written,
  ];
  const failed = summary.results.filter((r) => r.status === "failed");
  for (const result of failed) {
    lines.push(`  ${paint("red", "failed: ")}${result.key}: ${result.error}`);
  }
  for (const failure of listFailures) {
    lines.push(`  ${paint("red", "not listed: ")}${failure.owner}: ${failure.message}`);
  }
  if (summary.interrupted) {
    lines.push(paint("yellow", "Interrupted before all repositories were processed."));
  }
  return lines;
}

export function renderJson(
  summary: Summary,
  listFailures: ListFailure[],
  durationMs: number,
): string {
  const { results, ...counts } = summary;
  return JSON.stringify(
    {
      summary: { ...counts, durationMs },
      failures: results
        .filter((r) => r.status === "failed")
        .map((r) => ({ repo: r.key, error: r.error, targets: r.targets })),
      listFailures,
      results,
    },
    null,
    2,
  );
}

/** Checks the prerequisites, then runs the backup under the lock. */
async function checkAndBackUp(
  { config, missingConfigPath }: LoadedConfig,
  log: Logger,
  options: BackupOptions,
  deps: CommandDeps,
  progress: ProgressDisplay | undefined,
): Promise<number> {
  if (config.targets.length === 0) {
    throw new ConfigError(
      `no targets configured; use --to <path> or add targets to config${missingConfigHint(missingConfigPath)}`,
    );
  }
  const create = deps.createTarget ?? createTarget;
  const targets = config.targets.map((target) =>
    create(target, { keep: resolveKeep(target.keep, config.keep) }),
  );
  progress?.activity("Checking tools");
  await checkGit(deps.exec);
  if (config.lfs) await checkLfs(deps.exec);
  for (const target of targets) {
    progress?.activity(`Checking target ${target.name}`);
    await checkTarget(target);
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (deps.signal?.aborted) abort();
  deps.signal?.addEventListener("abort", abort, { once: true });
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  let lock: Lock | undefined;
  const clock = deps.now ?? (() => new Date());
  try {
    lock = acquireLock(path.join(config.cacheDir, ".lock"));
    const startedAt = clock().getTime();
    progress?.activity("Listing repositories");
    const discovery = await discoverRepos(config.sources, {
      exec: deps.exec,
      log,
      createSource: deps.createSource,
    });
    if (controller.signal.aborted) return ExitCode.Interrupted;

    progress?.activity("Preparing");
    const summary = await backupRepos(
      {
        repos: discovery.repos,
        sources: discovery.sources,
        targets,
        cacheDir: config.cacheDir,
        concurrency: config.concurrency,
        wiki: config.wiki,
        lfs: config.lfs,
      },
      {
        exec: deps.exec,
        log,
        tool: readToolInfo(),
        progress,
        signal: controller.signal,
        now: deps.now,
        sleep: deps.sleep,
        retryDelaysMs: deps.retryDelaysMs,
      },
    );
    const durationMs = clock().getTime() - startedAt;
    progress?.stop();

    for (const line of renderSummary(summary, discovery.failures, durationMs, deps.paint)) {
      log.summary(line);
    }
    if (options.json) deps.stdout(`${renderJson(summary, discovery.failures, durationMs)}\n`);

    if (summary.interrupted) return ExitCode.Interrupted;
    return summary.failed > 0 || discovery.failures.length > 0
      ? ExitCode.PartialFailure
      : ExitCode.Success;
  } finally {
    lock?.release();
    deps.signal?.removeEventListener("abort", abort);
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}

/** `github-backup backup`. Returns the process exit code. */
export async function runBackup(options: BackupOptions, deps: CommandDeps): Promise<number> {
  await setupMissingConfig(options, deps);
  const { loaded, log, progress } = prepareWithProgress(options, deps);
  try {
    return await checkAndBackUp(loaded, log, options, deps, progress);
  } finally {
    progress?.stop();
  }
}
