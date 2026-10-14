import { randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CommandDeps } from "../../src/commands/context.js";
import { createProgram } from "../../src/program.js";
import { createTarget } from "../../src/targets/index.js";
import { s3ClientConfig } from "../../src/targets/s3.js";
import type { Manifest, Target } from "../../src/targets/types.js";
import { ExitCode } from "../../src/util/errors.js";
import { formatStamp } from "../../src/util/time.js";
import { fakeSource, isolatedExec, makeTempDir, repoInfo, TestRemote } from "../helpers/git.js";

/**
 * Runs against any S3-compatible server (CI uses S3Proxy): set GHBACKUP_TEST_S3_ENDPOINT,
 * GHBACKUP_TEST_S3_ACCESS_KEY_ID, GHBACKUP_TEST_S3_SECRET_ACCESS_KEY and optionally
 * GHBACKUP_TEST_S3_BUCKET. Skipped otherwise.
 */
const endpoint = process.env.GHBACKUP_TEST_S3_ENDPOINT;
const accessKeyId = process.env.GHBACKUP_TEST_S3_ACCESS_KEY_ID ?? "test-access";
const secretAccessKey = process.env.GHBACKUP_TEST_S3_SECRET_ACCESS_KEY ?? "test-secret";
const bucket = process.env.GHBACKUP_TEST_S3_BUCKET ?? "ghb-test";

const KEY = "github/owner/repo";

const manifest = (stamp: string, refsHash = "h"): Manifest => ({
  version: 1,
  source: "github",
  fullName: "owner/repo",
  stamp,
  refsHash,
  refs: [],
  bundleBytes: 3,
  tool: { name: "t", version: "1" },
});

describe.skipIf(!endpoint)("s3 target (integration)", () => {
  const s3 = new S3Client(
    s3ClientConfig({ name: "test", endpoint, forcePathStyle: true, accessKeyId, secretAccessKey }),
  );
  let root: string;
  let prefix: string;

  const s3Config = (extra: Record<string, unknown> = {}) => ({
    type: "s3" as const,
    name: "bucket",
    bucket,
    prefix,
    endpoint,
    forcePathStyle: true,
    accessKeyId,
    secretAccessKey,
    ...extra,
  });
  const makeTarget = (keep = 2, extra: Record<string, unknown> = {}): Target =>
    createTarget(s3Config(extra), { keep });

  async function keysUnder(under: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: under, ContinuationToken: token }),
      );
      for (const o of page.Contents ?? []) if (o.Key) keys.push(o.Key);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys.sort();
  }
  const put = (key: string, body = "x") =>
    s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));

  beforeAll(async () => {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (err) {
      const name = (err as Error).name;
      if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") throw err;
    }
  });
  afterAll(() => s3.destroy());

  beforeEach(() => {
    root = makeTempDir("ghb-s3-");
    prefix = `ghb-test/${randomUUID()}`;
    writeFileSync(path.join(root, "a.bundle"), "abc");
    writeFileSync(path.join(root, "a.tar"), "tar");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const files = (extra: { lfsTar?: string } = {}) => ({
    bundle: path.join(root, "a.bundle"),
    ...extra,
  });

  it("is empty before the first snapshot", async () => {
    const target = makeTarget();
    expect(await target.latestManifest(KEY)).toBeNull();
    expect(await target.listSnapshots(KEY)).toEqual([]);
    await target.cleanupIncomplete(KEY);
    await target.checkAccess?.();
  });

  it("stores bundle, lfs.tar and manifest under the shared layout", async () => {
    const target = makeTarget();
    await target.putSnapshot(KEY, "20260101T000000Z", {
      ...files({ lfsTar: path.join(root, "a.tar") }),
      manifest: manifest("20260101T000000Z"),
    });
    expect(await keysUnder(`${prefix}/`)).toEqual(
      ["bundle", "json", "lfs.tar"].map((ext) => `${prefix}/${KEY}/20260101T000000Z.${ext}`),
    );
    expect(await target.latestManifest(KEY)).toEqual(manifest("20260101T000000Z"));
  });

  it("normalizes slashes around the prefix", async () => {
    const target = makeTarget(2, { prefix: `/${prefix}//` });
    await target.putSnapshot(KEY, "20260101T000000Z", {
      ...files(),
      manifest: manifest("20260101T000000Z"),
    });
    expect(await keysUnder(`${prefix}/`)).toContain(`${prefix}/${KEY}/20260101T000000Z.json`);
  });

  it("uploads large bundles in several parts and downloads them intact", async () => {
    const big = path.join(root, "big.bundle");
    writeFileSync(big, randomBytes(20 * 1024 * 1024));
    const target = makeTarget();
    await target.putSnapshot(KEY, "20260101T000000Z", {
      bundle: big,
      manifest: manifest("20260101T000000Z"),
    });
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const object = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: `${prefix}/${KEY}/20260101T000000Z.bundle` }),
    );
    const bytes = await object.Body?.transformToByteArray();
    expect(Buffer.from(bytes ?? []).equals(readFileSync(big))).toBe(true);
  }, 60_000);

  it("returns the newest manifest and lists stamps oldest first", async () => {
    const target = makeTarget();
    for (const [stamp, hash] of [
      ["20260102T000000Z", "two"],
      ["20260101T000000Z", "one"],
    ] as const) {
      await target.putSnapshot(KEY, stamp, { ...files(), manifest: manifest(stamp, hash) });
    }
    expect(await target.listSnapshots(KEY)).toEqual(["20260101T000000Z", "20260102T000000Z"]);
    expect((await target.latestManifest(KEY))?.refsHash).toBe("two");
  });

  it("deletes every object of a snapshot and nothing else", async () => {
    const target = makeTarget();
    for (const stamp of ["20260101T000000Z", "20260102T000000Z"]) {
      await target.putSnapshot(KEY, stamp, {
        ...files({ lfsTar: path.join(root, "a.tar") }),
        manifest: manifest(stamp),
      });
    }
    await target.deleteSnapshot(KEY, "20260101T000000Z");
    expect((await keysUnder(`${prefix}/`)).every((k) => k.includes("20260102T000000Z"))).toBe(true);
    expect(await target.listSnapshots(KEY)).toEqual(["20260102T000000Z"]);
  });

  it("removes objects of interrupted snapshots but keeps complete ones and other files", async () => {
    const target = makeTarget();
    await target.putSnapshot(KEY, "20260101T000000Z", {
      ...files(),
      manifest: manifest("20260101T000000Z"),
    });
    await put(`${prefix}/${KEY}/20260102T000000Z.bundle`, "half");
    await put(`${prefix}/${KEY}/20260102T000000Z.lfs.tar`, "half");
    await put(`${prefix}/${KEY}/notes.txt`, "keep me");
    expect(await target.listSnapshots(KEY)).toEqual(["20260101T000000Z"]);
    await target.cleanupIncomplete(KEY);
    expect(await keysUnder(`${prefix}/`)).toEqual([
      `${prefix}/${KEY}/20260101T000000Z.bundle`,
      `${prefix}/${KEY}/20260101T000000Z.json`,
      `${prefix}/${KEY}/notes.txt`,
    ]);
  });

  it("lists more than 1000 objects across pages", async () => {
    const target = makeTarget();
    const start = Date.UTC(2026, 0, 1);
    const stamps = Array.from({ length: 1005 }, (_, i) => formatStamp(new Date(start + i * 1000)));
    for (let i = 0; i < stamps.length; i += 50) {
      await Promise.all(
        stamps
          .slice(i, i + 50)
          .map((stamp) => put(`${prefix}/${KEY}/${stamp}.json`, JSON.stringify(manifest(stamp)))),
      );
    }
    expect(await target.listSnapshots(KEY)).toEqual(stamps);
    expect((await target.latestManifest(KEY))?.stamp).toBe(stamps.at(-1));

    await target.cleanupIncomplete(KEY);
    expect(await target.listSnapshots(KEY)).toHaveLength(1005);
  }, 120_000);

  it("deletes a snapshot with more than 1000 matching objects", async () => {
    const target = makeTarget();
    const stamp = "20260101T000000Z";
    await target.putSnapshot(KEY, stamp, { ...files(), manifest: manifest(stamp) });
    await Promise.all(
      Array.from({ length: 1005 }, (_, i) => put(`${prefix}/${KEY}/${stamp}.extra${i}`)),
    );
    await target.deleteSnapshot(KEY, stamp);
    expect(await keysUnder(`${prefix}/`)).toEqual([]);
  }, 120_000);

  it("fails the access check for a missing bucket, naming it", async () => {
    const target = createTarget(s3Config({ bucket: `missing-${randomUUID()}` }), { keep: 2 });
    await expect(target.checkAccess?.()).rejects.toThrow(/cannot access bucket "missing-/);
  });

  it("fails the access check for wrong credentials without leaking them", async () => {
    const target = createTarget(s3Config({ secretAccessKey: "definitely-wrong-secret" }), {
      keep: 2,
    });
    const error = await target.checkAccess?.().catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/cannot access bucket/);
    expect((error as Error).message).not.toContain("definitely-wrong-secret");
  });
});

describe.skipIf(!endpoint)("backup to local and s3 targets (integration)", () => {
  let root: string;
  let home: string;
  let clock: number;
  let prefix: string;
  const s3 = new S3Client(
    s3ClientConfig({ name: "test", endpoint, forcePathStyle: true, accessKeyId, secretAccessKey }),
  );

  beforeAll(async () => {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch {
      // Created by the other suite or earlier runs.
    }
  });
  afterAll(() => s3.destroy());

  beforeEach(() => {
    root = makeTempDir("ghb-s3run-");
    home = path.join(root, "home");
    clock = Date.UTC(2026, 0, 1);
    prefix = `ghb-test/${randomUUID()}`;
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function setup(
    repos: ReturnType<typeof repoInfo>[],
    targetOverrides: Record<string, unknown> = {},
    env: Record<string, string> = {},
  ) {
    const configFile = path.join(root, "config.json");
    writeFileSync(
      configFile,
      JSON.stringify({
        keep: 7,
        targets: [
          { type: "local", name: "disk", path: path.join(root, "out") },
          {
            type: "s3",
            name: "bucket",
            bucket,
            prefix,
            endpoint,
            forcePathStyle: true,
            accessKeyId,
            secretAccessKey,
            ...targetOverrides,
          },
        ],
      }),
    );
    const out: string[] = [];
    const err: string[] = [];
    const deps: CommandDeps = {
      exec: isolatedExec(home),
      env,
      stdout: (text) => out.push(text),
      stderr: (line) => err.push(line),
      homeDir: home,
      cwd: root,
      createSource: () => fakeSource(repos),
      now: () => {
        clock += 1000;
        return new Date(clock);
      },
      sleep: async () => {},
    };
    const backup = async (...flags: string[]) => {
      out.length = 0;
      const code = await createProgram(deps).run([
        "backup",
        "--config",
        configFile,
        "--cache-dir",
        path.join(root, "cache"),
        "--json",
        ...flags,
      ]);
      return { code, json: out.length ? JSON.parse(out.join("")) : undefined };
    };
    return { backup, err };
  }

  const localDir = (key: string) => path.join(root, "out", key);
  const localFiles = (key: string) => readdirSync(localDir(key)).sort();
  async function s3Names(key: string): Promise<string[]> {
    const dir = `${prefix}/${key}/`;
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: dir }));
    return (page.Contents ?? []).map((o) => (o.Key ?? "").slice(dir.length)).sort();
  }
  async function s3Text(key: string): Promise<string> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return (await object.Body?.transformToString()) ?? "";
  }

  it("writes the same file names and manifests to both targets", async () => {
    const remote = new TestRemote(root, "a", home);
    remote.commit("a.txt", "1");
    const { backup } = setup([repoInfo("o/a", remote)]);

    expect((await backup()).code).toBe(ExitCode.Success);

    const names = localFiles("test/o/a");
    expect(names).toHaveLength(2);
    expect(await s3Names("test/o/a")).toEqual(names);
    const json = names.find((n) => n.endsWith(".json")) as string;
    expect(await s3Text(`${prefix}/test/o/a/${json}`)).toBe(
      readFileSync(path.join(localDir("test/o/a"), json), "utf8"),
    );
  });

  it("creates no new snapshot for unchanged repositories and keeps the newest N", async () => {
    const remote = new TestRemote(root, "a", home);
    remote.commit("a.txt", "1");
    const { backup } = setup([repoInfo("o/a", remote)], { keep: 2 });

    expect((await backup()).code).toBe(0);
    const first = await s3Names("test/o/a");
    const second = await backup();
    expect(second.json.summary).toMatchObject({ ok: 0, unchanged: 1 });
    expect(await s3Names("test/o/a")).toEqual(first);

    for (const n of [2, 3, 4]) {
      remote.commit("a.txt", String(n));
      expect((await backup()).code).toBe(0);
    }
    const names = await s3Names("test/o/a");
    expect(names.filter((n) => n.endsWith(".json"))).toHaveLength(2);
    expect(names.filter((n) => n.endsWith(".bundle"))).toHaveLength(2);
    // The local target has no per-target keep and still holds every snapshot (keep 7).
    expect(localFiles("test/o/a").filter((n) => n.endsWith(".json"))).toHaveLength(4);
  }, 60_000);

  it("reads the credentials from GHBACKUP_S3_* when the config has none", async () => {
    const remote = new TestRemote(root, "a", home);
    remote.commit("a.txt", "1");
    const { backup } = setup(
      [repoInfo("o/a", remote)],
      { accessKeyId: undefined, secretAccessKey: undefined },
      { GHBACKUP_S3_ACCESS_KEY_ID: accessKeyId, GHBACKUP_S3_SECRET_ACCESS_KEY: secretAccessKey },
    );
    expect((await backup()).code).toBe(0);
    expect(await s3Names("test/o/a")).toHaveLength(2);
  });

  it("exits with 2 and a masked message when the credentials are wrong", async () => {
    const remote = new TestRemote(root, "a", home);
    remote.commit("a.txt", "1");
    const { backup, err } = setup([repoInfo("o/a", remote)], {
      secretAccessKey: "wrong-secret-value",
    });

    const { code } = await backup();
    expect(code).toBe(ExitCode.Usage);
    const output = err.join("\n");
    expect(output).toContain('target "bucket": cannot access bucket');
    expect(output).not.toContain("wrong-secret-value");
    // Nothing was written anywhere: the check runs before any backup work.
    expect(() => readdirSync(path.join(root, "out"))).toThrow();
  });
});
