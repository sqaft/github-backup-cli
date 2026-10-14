import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGit } from "../../src/core/git.js";
import { syncMirror } from "../../src/core/mirror.js";
import { buildManifest, createBundle, hashRefs, listRefs } from "../../src/core/snapshot.js";
import { isolatedExec, makeTempDir, TestRemote } from "../helpers/git.js";

let root: string;
let home: string;
let remote: TestRemote;

const git = () => createGit({ exec: isolatedExec(home), env: {} });
const mirrorDir = () => path.join(root, "cache", "test", "o", "r.git");

beforeEach(() => {
  root = makeTempDir();
  home = path.join(root, "home");
  remote = new TestRemote(root, "remote", home);
  remote.commit("a.txt", "one");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const mirrorInput = (kind: "repo" | "wiki" = "repo", url = remote.url) => ({
  mirrorDir: mirrorDir(),
  url,
  kind,
});

async function refLines(): Promise<string[]> {
  return (await listRefs(git(), mirrorDir())).map((r) => `${r.sha} ${r.name}`);
}

describe("syncMirror", () => {
  it("clones on the first run and fetches new commits afterwards", async () => {
    expect(await syncMirror(git(), mirrorInput())).toEqual({ status: "ok" });
    expect(await refLines()).toHaveLength(1);

    remote.commit("b.txt", "two");
    remote.commit("c.txt", "three", "feature");
    remote.tag("v1");
    await syncMirror(git(), mirrorInput());
    const names = (await listRefs(git(), mirrorDir())).map((r) => r.name);
    expect(names).toEqual(["refs/heads/feature", "refs/heads/main", "refs/tags/v1"]);
    expect(existsSync(`${mirrorDir()}/HEAD`)).toBe(true);
  });

  it("keeps a branch that was deleted on the remote", async () => {
    remote.commit("c.txt", "three", "feature");
    await syncMirror(git(), mirrorInput());
    remote.git(["checkout", "main"]);
    remote.deleteBranch("feature");
    await syncMirror(git(), mirrorInput());
    const names = (await listRefs(git(), mirrorDir())).map((r) => r.name);
    expect(names).toContain("refs/heads/feature");
  });

  it("does not fetch refs/pull/*", async () => {
    remote.pushRef("refs/pull/1/head");
    await syncMirror(git(), mirrorInput());
    const names = (await listRefs(git(), mirrorDir())).map((r) => r.name);
    expect(names).toEqual(["refs/heads/main"]);
  });

  it("points HEAD at the remote default branch", async () => {
    remote.commit("c.txt", "three", "feature");
    await syncMirror(git(), mirrorInput());
    const head = await git()(["symbolic-ref", "HEAD"], { cwd: mirrorDir() });
    expect(head.stdout.trim()).toBe("refs/heads/main");
  });

  it("reports a missing wiki as skipped and leaves no mirror behind", async () => {
    const missing = `file://${path.join(root, "nope.wiki.git")}`;
    expect(await syncMirror(git(), mirrorInput("wiki", missing))).toEqual({
      status: "skipped",
      reason: "no wiki",
    });
    expect(existsSync(mirrorDir())).toBe(false);
  });

  it("fails for a missing repository", async () => {
    const missing = `file://${path.join(root, "nope.git")}`;
    await expect(syncMirror(git(), mirrorInput("repo", missing))).rejects.toThrow();
  });
});

describe("snapshot", () => {
  it("hashes equal refs to the same digest regardless of order", () => {
    const a = { name: "refs/heads/a", sha: "1".repeat(40) };
    const b = { name: "refs/heads/b", sha: "2".repeat(40) };
    expect(hashRefs([a, b])).toBe(hashRefs([b, a]));
    expect(hashRefs([a, b])).not.toBe(hashRefs([a, { ...b, sha: "3".repeat(40) }]));
    expect(hashRefs([])).toMatch(/^[0-9a-f]{64}$/);
  });

  it("restores every branch and tag from the bundle", async () => {
    remote.commit("c.txt", "three", "feature");
    remote.tag("v1");
    remote.commit("d.txt", "four", "main");
    await syncMirror(git(), mirrorInput());

    const refs = await listRefs(git(), mirrorDir());
    const bundle = path.join(root, "x.bundle");
    const bytes = await createBundle(git(), mirrorDir(), bundle);
    expect(bytes).toBeGreaterThan(0);

    const restored = path.join(root, "restored");
    await git()(["clone", "--mirror", bundle, restored]);
    const restoredRefs = await git()(["for-each-ref", "refs/heads", "refs/tags"], {
      cwd: restored,
    });
    expect(restoredRefs.stdout).toBe(remote.refs());

    const manifest = buildManifest({
      source: "test",
      fullName: "o/r",
      stamp: "20260101T000000Z",
      refs,
      bundleBytes: bytes,
      tool: { name: "t", version: "1" },
    });
    expect(manifest).toMatchObject({ version: 1, refsHash: hashRefs(refs), bundleBytes: bytes });
    expect(manifest).not.toHaveProperty("lfsTarBytes");
  });
});
