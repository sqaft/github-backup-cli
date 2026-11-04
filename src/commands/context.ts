import { type ConfigFlags, type LoadedConfig, loadConfig } from "../config/load.js";
import type { SourceConfig, TargetConfig } from "../config/schema.js";
import type { Source } from "../sources/types.js";
import type { Target } from "../targets/types.js";
import { ConfigError } from "../util/errors.js";
import type { Exec } from "../util/exec.js";
import { createLogger, type Logger, type LogLevel } from "../util/log.js";
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

/** Loads the configuration and creates the logger, masking configured credentials. */
export function prepare(
  options: CommonOptions,
  deps: CommandDeps,
): { loaded: LoadedConfig; log: Logger } {
  const log = createLogger({ level: logLevel(options), write: deps.stderr });
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
