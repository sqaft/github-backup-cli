import path from "node:path";
import { discoverRepos } from "../core/discover.js";
import { acquireLock, type Lock } from "../core/lock.js";
import { resolveKeep } from "../core/retention.js";
import { backupRepos, type Summary } from "../core/run.js";
import type { ListFailure } from "../sources/types.js";
import { createTarget } from "../targets/index.js";
import type { Target } from "../targets/types.js";
import { ConfigError, ExitCode, PrerequisiteError } from "../util/errors.js";
import type { Exec } from "../util/exec.js";
import { readToolInfo } from "../util/tool.js";
import { type CommandDeps, type CommonOptions, prepare } from "./context.js";

export interface BackupOptions extends CommonOptions {}

async function checkGit(exec: Exec): Promise<void> {
  try {
    await exec("git", ["--version"]);
  } catch {
    throw new PrerequisiteError("git is not installed or not in PATH; install git and try again");
  }
}

/** Fails with exit code 2 when a target's storage is unreachable or rejects the credentials. */
async function checkTargets(targets: Target[]): Promise<void> {
  for (const target of targets) {
    try {
      await target.checkAccess?.();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new PrerequisiteError(`target "${target.name}": ${reason}`);
    }
  }
}

/** Lines printed to stderr at the end of a run. */
export function renderSummary(summary: Summary, listFailures: ListFailure[]): string[] {
  const lines = [
    `Backup finished: ${summary.ok} backed up, ${summary.unchanged} unchanged, ` +
      `${summary.skipped} skipped, ${summary.failed} failed`,
  ];
  const failed = summary.results.filter((r) => r.status === "failed");
  for (const result of failed) lines.push(`  failed: ${result.key}: ${result.error}`);
  for (const failure of listFailures) {
    lines.push(`  not listed: ${failure.owner}: ${failure.message}`);
  }
  if (summary.interrupted) lines.push("Interrupted before all repositories were processed.");
  return lines;
}

export function renderJson(summary: Summary, listFailures: ListFailure[]): string {
  const { results, ...counts } = summary;
  return JSON.stringify(
    {
      summary: counts,
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

/** `github-backup backup`. Returns the process exit code. */
export async function runBackup(options: BackupOptions, deps: CommandDeps): Promise<number> {
  const { loaded, log } = prepare(options, deps);
  const { config } = loaded;
  if (config.targets.length === 0) {
    throw new ConfigError("no targets configured; use --local <path> or add targets to config");
  }
  const targets = config.targets.map((target) =>
    createTarget(target, { keep: resolveKeep(target.keep, config.keep) }),
  );
  await checkGit(deps.exec);
  await checkTargets(targets);

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (deps.signal?.aborted) abort();
  deps.signal?.addEventListener("abort", abort, { once: true });
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  let lock: Lock | undefined;
  try {
    lock = acquireLock(path.join(config.cacheDir, ".lock"));
    const discovery = await discoverRepos(config.sources, {
      exec: deps.exec,
      log,
      createSource: deps.createSource,
    });
    if (controller.signal.aborted) return ExitCode.Interrupted;

    const summary = await backupRepos(
      {
        repos: discovery.repos,
        sources: discovery.sources,
        targets,
        cacheDir: config.cacheDir,
        concurrency: config.concurrency,
        wiki: config.wiki,
      },
      {
        exec: deps.exec,
        log,
        tool: readToolInfo(),
        signal: controller.signal,
        now: deps.now,
        sleep: deps.sleep,
        retryDelaysMs: deps.retryDelaysMs,
      },
    );

    for (const line of renderSummary(summary, discovery.failures)) log.summary(line);
    if (options.json) deps.stdout(`${renderJson(summary, discovery.failures)}\n`);

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
