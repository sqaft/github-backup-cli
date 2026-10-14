import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Git } from "../../src/core/git.js";
import { fetchLfs, hasLfsObjects } from "../../src/core/lfs.js";
import { makeTempDir } from "../helpers/git.js";

let mirror: string;

beforeEach(() => {
  mirror = makeTempDir("ghb-lfs-");
});
afterEach(() => rmSync(mirror, { recursive: true, force: true }));

describe("hasLfsObjects", () => {
  const cases: Array<[string, string[], boolean]> = [
    ["no lfs directory", [], false],
    ["empty lfs/objects", ["lfs/objects/"], false],
    ["only empty fan-out directories", ["lfs/objects/ab/cd/"], false],
    ["lfs/tmp files do not count", ["lfs/tmp/partial"], false],
    ["an object file", ["lfs/objects/ab/cd/abcd1234"], true],
  ];
  it.each(cases)("%s", async (_name, entries, expected) => {
    for (const entry of entries) {
      const target = path.join(mirror, ...entry.split("/"));
      if (entry.endsWith("/")) mkdirSync(target, { recursive: true });
      else {
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, "x");
      }
    }
    expect(await hasLfsObjects(mirror)).toBe(expected);
  });
});

describe("fetchLfs", () => {
  it("runs `git lfs fetch --all origin` in the mirror", async () => {
    const calls: Array<{ args: string[]; cwd?: string }> = [];
    const git: Git = async (args, opts) => {
      calls.push({ args, cwd: opts?.cwd });
      return { stdout: "", stderr: "" };
    };
    await fetchLfs(git, mirror);
    expect(calls).toEqual([{ args: ["lfs", "fetch", "--all", "origin"], cwd: mirror }]);
  });
});
