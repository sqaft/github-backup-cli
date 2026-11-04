import { type ConfigFlags, type LoadedConfig, loadConfig } from "../config/load.js";
import type { SourceConfig, TargetConfig } from "../config/schema.js";
import type { Source } from "../sources/types.js";
import type { Target } from "../targets/types.js";
import type { Paint } from "../util/color.js";
import { ConfigError } from "../util/errors.js";
import type { Exec } from "../util/exec.js";
import { createLogger, type Logger, type LogLevel } from "../util/log.js";
import type { ProgressDisplay } from "../util/progress.js";
import type { Prompter } from "../util/prompt.js";

/** Everything a command needs from the outside world; replaced in tests. */
export interface CommandDeps {
  exec: Exec;
  env: Record<string, string | undefined>;
  /** Writes machine- or human-readable results to stdout. */
  stdout: (text: string) => void;
  /** Writes log lines to stderr. */
  stderr: (line: string) => void;
  homeDir?: string;
  cwd?: string;
  createSource?: (config: SourceConfig, deps: { exec: Exec }) => Source;
  createTarget?: (config: TargetConfig, options: { keep: number }) => Target;
  /** Present only when a person can answer questions at a terminal. */
  createPrompter?: () => Prompter;
  /** Present only when progress can be drawn on a terminal. */
  createProgress?: () => ProgressDisplay;
  /** Present only when stderr can show color; absent means plain text. */
  paint?: Paint;
  /** Aborts a running backup, like SIGINT does. */
  signal?: AbortSignal;
  /** Clock and waiting, replaced in tests. */
  now?: () => Date;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  retryDelaysMs?: readonly number[];
}

export interface CommonOptions extends ConfigFlags {
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export function logLevel(options: CommonOptions): LogLevel {
  if (options.verbose && options.quiet) {
    throw new ConfigError("--verbose and --quiet cannot be used together");
  }
  if (options.quiet) return "quiet";
  return options.verbose ? "verbose" : "normal";
}

/**
 * `prepare` for commands that wait on tools or the network. On a terminal the display shows the
 * work under way; log lines go through it. The caller stops it before writing the result.
 */
export function prepareWithProgress(
  options: CommonOptions,
  deps: CommandDeps,
): { loaded: LoadedConfig; log: Logger; progress?: ProgressDisplay } {
  const progress = options.quiet ? undefined : deps.createProgress?.();
  const prepared = prepare(options, progress ? { ...deps, stderr: progress.log } : deps);
  return { ...prepared, progress };
}

/** Loads the configuration and creates the logger, masking configured credentials. */
export function prepare(
  options: CommonOptions,
  deps: CommandDeps,
): { loaded: LoadedConfig; log: Logger } {
  const log = createLogger({
    level: logLevel(options),
    write: deps.stderr,
    paint: deps.paint,
  });
  const loaded = loadConfig({
    flags: options,
    env: deps.env,
    homeDir: deps.homeDir,
    cwd: deps.cwd,
  });
  for (const secret of loaded.secrets) log.addSecret(secret);
  for (const warning of loaded.warnings) log.warn(warning);
  return { loaded, log };
}
