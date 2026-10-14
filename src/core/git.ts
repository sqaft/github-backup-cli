import { type Exec, type ExecResult, redactUrls } from "../util/exec.js";
import type { Logger } from "../util/log.js";

/** Runs `git` with the source's authentication environment. */
export type Git = (args: string[], opts?: { cwd?: string }) => Promise<ExecResult>;

export interface GitOptions {
  exec: Exec;
  env: Record<string, string>;
  signal?: AbortSignal;
  log?: Logger;
  scope?: string;
}

export function createGit(options: GitOptions): Git {
  return (args, opts = {}) => {
    options.log?.debug(redactUrls(`git ${args.join(" ")}`), options.scope);
    return options.exec("git", args, { env: options.env, cwd: opts.cwd, signal: options.signal });
  };
}
