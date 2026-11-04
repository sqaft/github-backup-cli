import { type Exec, type ExecResult, redactUrls } from "../util/exec.js";
import type { Logger } from "../util/log.js";

/** Runs `git` with the source's authentication environment. */
export type Git = (args: string[], opts?: GitCallOptions) => Promise<ExecResult>;

export type OnPercent = (percent: number) => void;

export interface GitCallOptions {
  cwd?: string;
  /** Receives the transfer percentage of a command started with `--progress`. */
  onPercent?: OnPercent;
}

export interface GitOptions {
  exec: Exec;
  env: Record<string, string>;
  signal?: AbortSignal;
  log?: Logger;
  scope?: string;
}

const TRANSFER_LINE = /^(?:Receiving|Unpacking|Writing) objects: +(\d+)%/;

/** The percentage in one line of `--progress` output, when the line is about the object transfer. */
export function parseTransferPercent(line: string): number | undefined {
  const percent = TRANSFER_LINE.exec(line)?.[1];
  return percent === undefined ? undefined : Number(percent);
}

export function createGit(options: GitOptions): Git {
  return (args, opts = {}) => {
    options.log?.debug(redactUrls(`git ${args.join(" ")}`), options.scope);
    const { onPercent } = opts;
    if (!onPercent) {
      return options.exec("git", args, { env: options.env, cwd: opts.cwd, signal: options.signal });
    }
    return options.exec("git", args, {
      // git translates its progress messages, and they are matched in English.
      env: { ...options.env, LC_ALL: "C" },
      cwd: opts.cwd,
      signal: options.signal,
      onStderrLine: (line) => {
        const percent = parseTransferPercent(line);
        if (percent !== undefined) onPercent(percent);
      },
    });
  };
}
