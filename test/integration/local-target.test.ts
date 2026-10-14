import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTarget } from "../../src/targets/index.js";
import type { Manifest, Target } from "../../src/targets/types.js";
import { makeTempDir } from "../helpers/git.js";

let root: string;
let target: Target;
const KEY = "test/owner/repo";

const manifest = (stamp: string, refsHash = "h"): Manifest => ({
  version: 1,
  source: "test",
  fullName: "owner/repo",
  stamp,
  refsHash,
  refs: [],
  bundleBytes: 3,
  tool: { name: "t", version: "1" },
});

const files = () => readdirSync(path.join(root, "out", KEY)).sort();

beforeEach(() => {
  root = makeTempDir("ghb-local-");
  writeFileSync(path.join(root, "a.bundle"), "abc");
  writeFileSync(path.join(root, "a.tar"), "tar");
  target = createTarget({ type: "local", name: "disk", path: path.join(root, "out") }, { keep: 2 });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("local target", () => {
  it("is empty before the first snapshot", async () => {
    expect(await target.latestManifest(KEY)).toBeNull();
    expect(await target.listSnapshots(KEY)).toEqual([]);
    await target.cleanupIncomplete(KEY);
  });

  it("writes bundle, lfs.tar and manifest without leaving partial files", async () => {
    await target.putSnapshot(KEY, "20260101T000000Z", {
      bundle: path.join(root, "a.bundle"),
      lfsTar: path.join(root, "a.tar"),
      manifest: manifest("20260101T000000Z"),
    });
    expect(files()).toEqual([
      "20260101T000000Z.bundle",
      "20260101T000000Z.json",
      "20260101T000000Z.lfs.tar",
    ]);
    expect((await target.latestManifest(KEY))?.stamp).toBe("20260101T000000Z");
  });

  it("returns the newest manifest and lists stamps oldest first", async () => {
    for (const [stamp, hash] of [
      ["20260102T000000Z", "two"],
      ["20260101T000000Z", "one"],
    ] as const) {
      await target.putSnapshot(KEY, stamp, {
        bundle: path.join(root, "a.bundle"),
        manifest: manifest(stamp, hash),
      });
    }
    expect(await target.listSnapshots(KEY)).toEqual(["20260101T000000Z", "20260102T000000Z"]);
    expect((await target.latestManifest(KEY))?.refsHash).toBe("two");
  });

  it("deletes every file of a snapshot", async () => {
    for (const stamp of ["20260101T000000Z", "20260102T000000Z"]) {
      await target.putSnapshot(KEY, stamp, {
        bundle: path.join(root, "a.bundle"),
        lfsTar: path.join(root, "a.tar"),
        manifest: manifest(stamp),
      });
    }
    await target.deleteSnapshot(KEY, "20260101T000000Z");
    expect(files().every((f) => f.startsWith("20260102T000000Z"))).toBe(true);
    expect(await target.listSnapshots(KEY)).toEqual(["20260102T000000Z"]);
  });

  it("removes files of interrupted snapshots but keeps complete ones", async () => {
    await target.putSnapshot(KEY, "20260101T000000Z", {
      bundle: path.join(root, "a.bundle"),
      manifest: manifest("20260101T000000Z"),
    });
    const dir = path.join(root, "out", KEY);
    writeFileSync(path.join(dir, "20260102T000000Z.bundle"), "half");
    writeFileSync(path.join(dir, "20260102T000000Z.lfs.tar.partial"), "half");
    writeFileSync(path.join(dir, "notes.txt"), "keep me");
    await target.cleanupIncomplete(KEY);
    expect(files()).toEqual(["20260101T000000Z.bundle", "20260101T000000Z.json", "notes.txt"]);
  });

  it("does not report a snapshot without manifest as complete", async () => {
    const dir = path.join(root, "out", KEY);
    await target.putSnapshot(KEY, "20260101T000000Z", {
      bundle: path.join(root, "a.bundle"),
      manifest: manifest("20260101T000000Z"),
    });
    writeFileSync(path.join(dir, "20260105T000000Z.bundle"), "half");
    expect(await target.listSnapshots(KEY)).toEqual(["20260101T000000Z"]);
    expect((await target.latestManifest(KEY))?.stamp).toBe("20260101T000000Z");
  });

  it("rejects repository keys that escape the root", async () => {
    await expect(target.listSnapshots("../outside")).rejects.toThrow(/invalid repository key/);
    expect(existsSync(path.join(root, "outside"))).toBe(false);
  });
});
