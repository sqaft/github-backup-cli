import type { LoadedConfig } from "../config/load.js";
import { checkGit, checkLfs, checkTarget } from "../core/checks.js";
import { resolveKeep } from "../core/retention.js";
import { createSource } from "../sources/index.js";
import { createTarget } from "../targets/index.js";
import { ExitCode } from "../util/errors.js";
import type { ProgressDisplay } from "../util/progress.js";
import { type CommandDeps, type CommonOptions, prepareWithProgress } from "./context.js";

export interface DoctorOptions extends CommonOptions {}

export interface CheckResult {
  name: string;
  status: "ok" | "failed" | "skipped";
  detail?: string;
}

const MARK = { ok: "✓", failed: "✗", skipped: "-" } as const;

/** First non-empty line, so a tool's multi-line stderr stays on one output line. */
function firstLine(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line !== "") ?? ""
  );
}

function describeError(err: unknown, stripPrefix = ""): string {
  const message = err instanceof Error ? err.message : String(err);
  return firstLine(message.startsWith(stripPrefix) ? message.slice(stripPrefix.length) : message);
}

async function runCheck(
  name: string,
  check: () => Promise<void>,
  stripPrefix?: string,
): Promise<CheckResult> {
  try {
    await check();
    return { name, status: "ok" };
  } catch (err) {
    return { name, status: "failed", detail: describeError(err, stripPrefix) };
  }
}

/** One line per check: `✓ git`, `✗ target r2: reason`, `- git-lfs: disabled`. */
export function renderChecks(checks: readonly CheckResult[]): string {
  return checks
    .map(({ name, status, detail }) => `${MARK[status]} ${name}${detail ? `: ${detail}` : ""}`)
    .join("\n");
}

async function runChecks(
  loaded: LoadedConfig,
  deps: CommandDeps,
  progress: ProgressDisplay | undefined,
): Promise<CheckResult[]> {
  const { config } = loaded;
  const checks: CheckResult[] = [];
  const check = (name: string, run: () => Promise<void>, stripPrefix?: string) => {
    progress?.activity(`Checking ${name}`);
    return runCheck(name, run, stripPrefix);
  };

  checks.push(
    loaded.configPath === undefined
      ? { name: "config", status: "skipped", detail: `none at ${loaded.missingConfigPath}` }
      : { name: "config", status: "ok", detail: loaded.configPath },
  );
  checks.push(await check("git", () => checkGit(deps.exec)));
  checks.push(
    config.lfs
      ? await check("git-lfs", () => checkLfs(deps.exec))
      : { name: "git-lfs", status: "skipped", detail: "disabled" },
  );

  const makeSource = deps.createSource ?? createSource;
  for (const sourceConfig of config.sources) {
    const source = makeSource(sourceConfig, { exec: deps.exec });
    checks.push(await check(source.id, () => source.checkPrerequisites()));
  }

  if (config.targets.length === 0) {
    checks.push({
      name: "targets",
      status: "failed",
      detail: "none configured; run github-backup setup",
    });
  }
  const makeTarget = deps.createTarget ?? createTarget;
  for (const targetConfig of config.targets) {
    checks.push(
      await check(
        `target ${targetConfig.name}`,
        async () => {
          const target = makeTarget(targetConfig, {
            keep: resolveKeep(targetConfig.keep, config.keep),
          });
          await checkTarget(target);
        },
        `target "${targetConfig.name}": `,
      ),
    );
  }
  return checks;
}

/**
 * `github-backup doctor`: runs every prerequisite check and reports all results instead of
 * stopping at the first failure. Exits 2 when any check failed.
 */
export async function runDoctor(options: DoctorOptions, deps: CommandDeps): Promise<number> {
  const { loaded, progress } = prepareWithProgress(options, deps);
  let checks: CheckResult[];
  try {
    checks = await runChecks(loaded, deps, progress);
  } finally {
    progress?.stop();
  }
  const ok = checks.every((check) => check.status !== "failed");
  deps.stdout(`${options.json ? JSON.stringify({ ok, checks }, null, 2) : renderChecks(checks)}\n`);
  return ok ? ExitCode.Success : ExitCode.Usage;
}
