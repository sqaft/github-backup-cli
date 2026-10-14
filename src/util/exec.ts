import { spawn } from "node:child_process";

export interface ExecOptions {
  env?: Record<string, string>;
  cwd?: string;
  timeoutMs?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}

/** Runs an external command. Injected into modules so tests can fake it. */
export type Exec = (cmd: string, args: string[], opts?: ExecOptions) => Promise<ExecResult>;

export class ExecError extends Error {
  constructor(
    message: string,
    readonly cmd: string,
    /** Exit code, or a string such as `ENOENT` / `ETIMEDOUT` when no exit code exists. */
    readonly code: number | string | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "ExecError";
  }
}

/** Removes `user:pass@` from URLs so credentials never reach logs or error messages. */
export function redactUrls(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1");
}

function describeCommand(cmd: string, args: string[]): string {
  return redactUrls([cmd, ...args].join(" "));
}

export const exec: Exec = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : undefined;

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        new ExecError(
          `${cmd}: ${redactUrls(err.message)}`,
          cmd,
          err.code ?? null,
          redactUrls(err.message),
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf8");
      const err = redactUrls(Buffer.concat(stderr).toString("utf8")).trim();
      if (timedOut) {
        reject(
          new ExecError(
            `${describeCommand(cmd, args)} timed out after ${opts.timeoutMs} ms`,
            cmd,
            "ETIMEDOUT",
            err,
          ),
        );
      } else if (code !== 0) {
        const detail = err ? `: ${err}` : "";
        reject(
          new ExecError(
            `${describeCommand(cmd, args)} failed (exit ${code})${detail}`,
            cmd,
            code,
            err,
          ),
        );
      } else {
        resolve({ stdout: out, stderr: err });
      }
    });
  });
