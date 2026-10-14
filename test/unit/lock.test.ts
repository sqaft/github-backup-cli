import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireLock } from "../../src/core/lock.js";
import { ExitCode } from "../../src/util/errors.js";
import { makeTempDir } from "../helpers/git.js";

let dir: string;
let file: string;

beforeEach(() => {
  dir = makeTempDir("ghb-lock-");
  file = path.join(dir, "cache", ".lock");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("acquireLock", () => {
  it("writes the pid and removes the file on release", () => {
    const lock = acquireLock(file, { pid: 4242 });
    expect(readFileSync(file, "utf8").trim()).toBe("4242");
    lock.release();
    expect(existsSync(file)).toBe(false);
    expect(existsSync(`${file}.4242.tmp`)).toBe(false);
  });

  it("refuses a lock held by a live process with exit code 3", () => {
    const first = acquireLock(file, { pid: 1 });
    expect(() => acquireLock(file, { pid: 2, isAlive: () => true })).toThrowError(
      expect.objectContaining({ exitCode: ExitCode.Locked }),
    );
    first.release();
  });

  it("takes over a lock whose pid is dead", () => {
    acquireLock(file, { pid: 1 });
    const second = acquireLock(file, { pid: 2, isAlive: () => false });
    expect(readFileSync(file, "utf8").trim()).toBe("2");
    second.release();
    expect(existsSync(file)).toBe(false);
  });

  it("takes over an unreadable lock file", () => {
    acquireLock(file, { pid: 1 });
    writeFileSync(file, "garbage");
    acquireLock(file, { pid: 2, isAlive: () => true }).release();
  });

  it("does not remove a lock that now belongs to someone else", () => {
    const lock = acquireLock(file, { pid: 1 });
    writeFileSync(file, "99\n");
    lock.release();
    expect(existsSync(file)).toBe(true);
  });
});
