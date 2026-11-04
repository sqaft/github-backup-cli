import { linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CliError, ExitCode } from "../util/errors.js";

export interface Lock {
  release(): void;
}

export interface LockOptions {
  pid?: number;
  isAlive?: (pid: number) => boolean;
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readPid(file: string): number | undefined {
  try {
    const pid = Number.parseInt(readFileSync(file, "utf8").trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Takes the run lock (`<cacheDir>/.lock` holding our PID). A lock whose PID is gone is taken
 * over; a live one ends the run with exit code 3. The PID file is created complete
 * via a hard link, so a concurrent reader never sees a half-written lock.
 */
export function acquireLock(file: string, options: LockOptions = {}): Lock {
  const pid = options.pid ?? process.pid;
  const isAlive = options.isAlive ?? isProcessAlive;
  mkdirSync(path.dirname(file), { recursive: true });
  const staging = `${file}.${pid}.tmp`;
  writeFileSync(staging, `${pid}\n`);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        linkSync(staging, file);
        return {
          release() {
            if (readPid(file) === pid) rmSync(file, { force: true });
          },
        };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        const holder = readPid(file);
        if (holder !== undefined && isAlive(holder)) {
          throw new CliError(
            `another backup run is in progress (pid ${holder}, lock ${file})`,
            ExitCode.Locked,
          );
        }
        rmSync(file, { force: true });
      }
    }
    throw new CliError(`could not acquire the lock ${file}`, ExitCode.Locked);
  } finally {
    rmSync(staging, { force: true });
  }
}
