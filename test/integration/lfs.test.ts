import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { extract } from "tar";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandDeps } from "../../src/commands/context.js";
import { createProgram } from "../../src/program.js";
import type { RepoInfo } from "../../src/sources/types.js";
import type { Manifest } from "../../src/targets/types.js";
import type { Exec } from "../../src/util/exec.js";
import {
  enableLfs,
  fakeSource,
  hasGitLfs,
  isolatedExec,
  makeTempDir,
  repoInfo,
  TestRemote,
} from "../helpers/git.js";

let root: string;
let home: string;
let clock: number;

beforeEach(() => {
  root = makeTempDir("ghb-lfs-run-");
  home = path.join(root, "home");
  clock = Date.UTC(2026, 0, 1);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** Remote with one LFS-tracked file (`big.bin`) and one plain file. */
function lfsRemote(name: string, content = `lfs payload ${"x".repeat(4000)}`) {
  const remote = new TestRemote(root, name, home);
  const env = enableLfs(remote, path.join(root, `${name}-lfs-store.git`));
  remote.commit("plain.txt", "not in lfs");
  remote.commit("big.bin", content);
  return { remote, env, content };
}

function setup(repos: RepoInfo[], env: Record<string, string>, exec?: Exec) {
  const lfsFetches: string[] = [];
  const base = isolatedExec(home);
  const deps: CommandDeps = {
    exec: (cmd, args, opts) => {
      if (args[0] === "lfs" && args[1] === "fetch") lfsFetches.push(opts?.cwd ?? "");
      return (exec ?? base)(cmd, args, opts);
    },
    env: {},
    stdout: () => {},
    stderr: () => {},
    homeDir: home,
    cwd: root,
    createSource: () => fakeSource(repos, env),
    now: () => {
      clock += 1000;
      return new Date(clock);
    },
    sleep: async () => {},
  };
  const backup = (...flags: string[]) =>
    createProgram(deps).run([
      "backup",
      "--local",
      path.join(root, "out"),
      "--cache-dir",
      path.join(root, "cache"),
      ...flags,
    ]);
  return { backup, lfsFetches };
}

const snapshotDir = (key: string) => path.join(root, "out", key);
const list = (key: string) =>
  existsSync(snapshotDir(key)) ? readdirSync(snapshotDir(key)).sort() : [];
const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

describe.skipIf(!hasGitLfs())("backup with Git LFS", () => {
  it("writes lfs.tar and lfsTarBytes, and the restored file matches the original", async () => {
    const { remote, env, content } = lfsRemote("a");
    const { backup } = setup([repoInfo("o/a", remote)], env);
    expect(await backup()).toBe(0);

    const files = list("test/o/a");
    expect(files.map((f) => f.replace(/^\d{8}T\d{6}Z/, "<stamp>"))).toEqual([
      "<stamp>.bundle",
      "<stamp>.json",
      "<stamp>.lfs.tar",
    ]);
    const dir = snapshotDir("test/o/a");
    const byExt = (ext: string) => path.join(dir, files.find((f) => f.endsWith(ext)) as string);
    const manifest = JSON.parse(readFileSync(byExt(".json"), "utf8")) as Manifest;
    expect(manifest.lfsTarBytes).toBe(statSync(byExt(".lfs.tar")).size);

    // Restore as documented, with the global LFS filter `git lfs install` sets up on a real machine.
    const clone = path.join(root, "restored");
    const exec = isolatedExec(home);
    mkdirSync(home, { recursive: true });
    await exec("git", ["lfs", "install", "--skip-repo"]);
    await exec("git", ["clone", byExt(".bundle"), clone], { env: { GIT_LFS_SKIP_SMUDGE: "1" } });
    await extract({ file: byExt(".lfs.tar"), cwd: path.join(clone, ".git") });
    await exec("git", ["lfs", "install", "--local"], { cwd: clone });
    await exec("git", ["lfs", "checkout"], { cwd: clone });
    expect(sha256(readFileSync(path.join(clone, "big.bin")))).toBe(sha256(content));
    expect(readFileSync(path.join(clone, "plain.txt"), "utf8")).toBe("not in lfs");
  });

  it("writes no lfs.tar for a repository without LFS objects", async () => {
    const plain = new TestRemote(root, "plain", home);
    plain.commit("a.txt", "1");
    const { backup } = setup([repoInfo("o/plain", plain)], {});
    expect(await backup()).toBe(0);

    const files = list("test/o/plain");
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.endsWith(".lfs.tar"))).toBe(false);
    const json = files.find((f) => f.endsWith(".json")) as string;
    const manifest = JSON.parse(readFileSync(path.join(snapshotDir("test/o/plain"), json), "utf8"));
    expect(manifest).not.toHaveProperty("lfsTarBytes");
  });

  it("skips every LFS step with --no-lfs", async () => {
    const { remote, env } = lfsRemote("a");
    const { backup, lfsFetches } = setup([repoInfo("o/a", remote)], env);
    expect(await backup("--no-lfs")).toBe(0);

    expect(lfsFetches).toEqual([]);
    expect(list("test/o/a").some((f) => f.endsWith(".lfs.tar"))).toBe(false);
    expect(existsSync(path.join(root, "cache", "test", "o", "a.git", "lfs", "objects"))).toBe(
      false,
    );
  });

  it("does not touch LFS when refs are unchanged and fetches again after a new commit", async () => {
    const { remote, env } = lfsRemote("a");
    const { backup, lfsFetches } = setup([repoInfo("o/a", remote)], env);
    expect(await backup()).toBe(0);
    expect(lfsFetches).toHaveLength(1);

    expect(await backup()).toBe(0);
    expect(lfsFetches).toHaveLength(1);

    remote.commit("big.bin", `changed ${"y".repeat(4000)}`);
    expect(await backup()).toBe(0);
    expect(lfsFetches).toHaveLength(2);
    // The second snapshot carries all LFS objects, old and new (self-contained snapshots).
    const tars = list("test/o/a").filter((f) => f.endsWith(".lfs.tar"));
    expect(tars).toHaveLength(2);
    const sizes = tars.map((f) => statSync(path.join(snapshotDir("test/o/a"), f)).size);
    expect(sizes[1]).toBeGreaterThan(sizes[0] as number);
  });

  it("does not run LFS for wikis", async () => {
    const { remote, env } = lfsRemote("a");
    const wiki = new TestRemote(root, "a.wiki-src", home);
    wiki.commit("Home.md", "hi");
    const { backup, lfsFetches } = setup(
      [repoInfo("o/a", remote, { hasWiki: true, wikiUrl: wiki.url })],
      env,
    );
    expect(await backup()).toBe(0);
    expect(lfsFetches).toHaveLength(1);
    expect(list("test/o/a.wiki").some((f) => f.endsWith(".lfs.tar"))).toBe(false);
  });
});
