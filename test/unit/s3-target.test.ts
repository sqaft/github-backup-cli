import { writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load.js";
import { createProgram } from "../../src/program.js";
import {
  createS3Target,
  describeS3Error,
  maskSecrets,
  normalizePrefix,
  objectKey,
  s3ClientConfig,
} from "../../src/targets/s3.js";
import { ConfigError } from "../../src/util/errors.js";
import { exec } from "../../src/util/exec.js";
import { makeTempDir } from "../helpers/git.js";

describe("normalizePrefix", () => {
  it.each([
    [undefined, ""],
    ["", ""],
    ["/", ""],
    ["git", "git"],
    ["/git/", "git"],
    ["git//backups/", "git/backups"],
    ["///a///b///", "a/b"],
  ])("%j -> %j", (input, expected) => {
    expect(normalizePrefix(input)).toBe(expected);
  });
});

describe("objectKey", () => {
  it.each([
    ["git", "github/o/r", "20260101T000000Z.bundle", "git/github/o/r/20260101T000000Z.bundle"],
    ["", "github/o/r", "20260101T000000Z.json", "github/o/r/20260101T000000Z.json"],
    ["git", "github/o/r", undefined, "git/github/o/r/"],
    ["", "github/o/r.wiki", undefined, "github/o/r.wiki/"],
  ])("prefix %j, repo %j, name %j", (prefix, repoKey, name, expected) => {
    expect(objectKey(prefix, repoKey, name)).toBe(expected);
  });

  it.each(["../x", "github/../x", "/abs", "github//r", "./x"])("rejects %j", (repoKey) => {
    expect(() => objectKey("p", repoKey)).toThrow(/invalid repository key/);
  });
});

describe("s3ClientConfig", () => {
  const base = { name: "bucket" };

  it("defaults to us-east-1, virtual-host style and no explicit credentials", () => {
    const config = s3ClientConfig(base);
    expect(config.region).toBe("us-east-1");
    expect(config.forcePathStyle).toBe(false);
    expect(config.credentials).toBeUndefined();
    expect(config.endpoint).toBeUndefined();
  });

  it("only sends checksums where the API requires them", () => {
    const config = s3ClientConfig(base);
    expect(config.requestChecksumCalculation).toBe("WHEN_REQUIRED");
    expect(config.responseChecksumValidation).toBe("WHEN_REQUIRED");
  });

  it("passes endpoint, region, path style and static credentials", () => {
    const config = s3ClientConfig({
      ...base,
      endpoint: "http://localhost:9000",
      region: "auto",
      forcePathStyle: true,
      accessKeyId: "id",
      secretAccessKey: "secret",
    });
    expect(config).toMatchObject({
      endpoint: "http://localhost:9000",
      region: "auto",
      forcePathStyle: true,
      credentials: { accessKeyId: "id", secretAccessKey: "secret" },
    });
  });

  it.each([{ accessKeyId: "id" }, { secretAccessKey: "secret" }])(
    "rejects half a key pair: %j",
    (keys) => {
      expect(() => s3ClientConfig({ ...base, ...keys })).toThrow(ConfigError);
    },
  );
});

describe("credential precedence (config > GHBACKUP_S3_* env > SDK chain)", () => {
  function load(target: Record<string, unknown>, env: Record<string, string>) {
    const dir = makeTempDir("ghb-s3cfg-");
    const file = path.join(dir, "config.json");
    writeFileSync(
      file,
      JSON.stringify({ targets: [{ type: "s3", name: "s", bucket: "b", ...target }] }),
    );
    writeFileSync(path.join(dir, ".keep"), "");
    const { config, secrets } = loadConfig({
      flags: { config: file },
      env,
      homeDir: dir,
      cwd: dir,
    });
    const s3 = config.targets[0];
    if (s3?.type !== "s3") throw new Error("expected an s3 target");
    return { s3, secrets };
  }

  it("prefers the configuration file", () => {
    const { s3 } = load(
      { accessKeyId: "file-id", secretAccessKey: "file-secret" },
      { GHBACKUP_S3_ACCESS_KEY_ID: "env-id", GHBACKUP_S3_SECRET_ACCESS_KEY: "env-secret" },
    );
    expect(s3).toMatchObject({ accessKeyId: "file-id", secretAccessKey: "file-secret" });
  });

  it("falls back to the environment, and masks what it finds", () => {
    const { s3, secrets } = load(
      {},
      { GHBACKUP_S3_ACCESS_KEY_ID: "env-id", GHBACKUP_S3_SECRET_ACCESS_KEY: "env-secret" },
    );
    expect(s3).toMatchObject({ accessKeyId: "env-id", secretAccessKey: "env-secret" });
    expect(secrets).toEqual(["env-id", "env-secret"]);
  });

  it("leaves credentials unset for the SDK chain when neither is given", () => {
    const { s3 } = load({}, {});
    expect(s3.accessKeyId).toBeUndefined();
    expect(s3ClientConfig(s3).credentials).toBeUndefined();
  });
});

describe("error descriptions", () => {
  it("masks credentials", () => {
    expect(maskSecrets("id=AKIA1 key=s3cr3t", ["AKIA1", "s3cr3t", undefined, ""])).toBe(
      "id=*** key=***",
    );
  });

  it("combines name, message and HTTP status and masks keys", () => {
    const err = Object.assign(new Error("The key AKIA1 does not exist"), {
      name: "InvalidAccessKeyId",
      $metadata: { httpStatusCode: 403 },
    });
    expect(describeS3Error(err, ["AKIA1"])).toBe(
      "InvalidAccessKeyId: The key *** does not exist (HTTP 403)",
    );
  });

  it("drops the SDK's placeholder message", () => {
    const err = Object.assign(new Error("UnknownError"), {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });
    expect(describeS3Error(err, [])).toBe("NotFound (HTTP 404)");
  });
});

/** Minimal in-memory client that understands the commands the target sends. */
function fakeClient(initial: string[], pageSize = 1000) {
  const keys = new Set(initial);
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  // biome-ignore lint/suspicious/noExplicitAny: loosely typed stand-in for SDK commands
  const send = async (command: { constructor: { name: string }; input: Record<string, any> }) => {
    const name = command.constructor.name;
    const input = command.input;
    calls.push({ name, input });
    switch (name) {
      case "ListObjectsV2Command": {
        const all = [...keys].filter((k) => k.startsWith(input.Prefix)).sort();
        const start = input.ContinuationToken ? Number(input.ContinuationToken) : 0;
        const page = all.slice(start, start + pageSize);
        const more = start + pageSize < all.length;
        return {
          Contents: page.map((Key) => ({ Key })),
          IsTruncated: more,
          NextContinuationToken: more ? String(start + pageSize) : undefined,
        };
      }
      case "DeleteObjectCommand":
        keys.delete(input.Key);
        return {};
      case "DeleteObjectsCommand":
        for (const { Key } of input.Delete.Objects) keys.delete(Key);
        return {};
      case "ListMultipartUploadsCommand":
        throw Object.assign(new Error("not supported"), { name: "NotImplemented" });
      case "GetObjectCommand":
        return {
          Body: { transformToString: async () => JSON.stringify({ stamp: "from-fake" }) },
        };
      default:
        throw new Error(`unexpected command ${name}`);
    }
  };
  return { client: { send } as never, keys, calls };
}

const stampKey = (stamp: string, ext: string) => `git/github/o/r/${stamp}.${ext}`;

describe("s3 target against a fake client", () => {
  const options = { name: "s", bucket: "b", prefix: "/git/", keep: 3 };

  it("follows continuation tokens when listing snapshots", async () => {
    const initial = [];
    for (let i = 1; i <= 5; i++) initial.push(stampKey(`2026010${i}T000000Z`, "json"));
    for (let i = 1; i <= 5; i++) initial.push(stampKey(`2026010${i}T000000Z`, "bundle"));
    const { client, calls } = fakeClient(initial, 3);
    const target = createS3Target({ ...options, client });

    const stamps = await target.listSnapshots("github/o/r");
    expect(stamps).toEqual([1, 2, 3, 4, 5].map((i) => `2026010${i}T000000Z`));
    expect(calls.filter((c) => c.name === "ListObjectsV2Command")).toHaveLength(4);
  });

  it("treats a snapshot without a manifest as incomplete and ignores other repositories", async () => {
    const { client } = fakeClient([
      stampKey("20260101T000000Z", "bundle"),
      stampKey("20260101T000000Z", "json"),
      stampKey("20260102T000000Z", "bundle"),
      "git/github/o/r.wiki/20260109T000000Z.json",
      "git/github/o/r/nested/20260110T000000Z.json",
    ]);
    const target = createS3Target({ ...options, client });
    expect(await target.listSnapshots("github/o/r")).toEqual(["20260101T000000Z"]);
    expect(await target.latestManifest("github/o/r")).toEqual({ stamp: "from-fake" });
    expect(await target.latestManifest("github/o/none")).toBeNull();
  });

  it("deletes the manifest first, then the rest in groups of 1000", async () => {
    const stamp = "20260101T000000Z";
    const initial = [
      stampKey(stamp, "json"),
      stampKey(stamp, "bundle"),
      stampKey(stamp, "lfs.tar"),
    ];
    // 2500 more objects with the same stamp so deletion needs three batches.
    for (let i = 0; i < 2500; i++) initial.push(`git/github/o/r/${stamp}.part${i}`);
    initial.push(stampKey("20260102T000000Z", "json"));
    const { client, keys, calls } = fakeClient(initial);
    const target = createS3Target({ ...options, client });

    await target.deleteSnapshot("github/o/r", stamp);

    const deletes = calls.filter((c) => c.name.startsWith("Delete"));
    expect(deletes[0]?.name).toBe("DeleteObjectCommand");
    expect(deletes[0]?.input.Key).toBe(stampKey(stamp, "json"));
    const batches = deletes
      .slice(1)
      .map((c) => (c.input.Delete as { Objects: unknown[] }).Objects.length);
    expect(batches).toEqual([1000, 1000, 502]);
    expect([...keys]).toEqual([stampKey("20260102T000000Z", "json")]);
  });

  it("reports DeleteObjects failures", async () => {
    const stamp = "20260101T000000Z";
    const { client } = fakeClient([stampKey(stamp, "json"), stampKey(stamp, "bundle")]);
    const original = (client as { send: (c: unknown) => Promise<unknown> }).send;
    (client as { send: unknown }).send = async (c: { constructor: { name: string } }) =>
      c.constructor.name === "DeleteObjectsCommand"
        ? { Errors: [{ Key: "k", Code: "AccessDenied", Message: "no" }] }
        : original(c);
    const target = createS3Target({ ...options, client });
    await expect(target.deleteSnapshot("github/o/r", stamp)).rejects.toThrow(
      /cannot delete snapshot.*AccessDenied/,
    );
  });

  it("removes only objects of snapshots without a manifest", async () => {
    const { client, keys } = fakeClient([
      stampKey("20260101T000000Z", "bundle"),
      stampKey("20260101T000000Z", "json"),
      stampKey("20260102T000000Z", "bundle"),
      stampKey("20260102T000000Z", "lfs.tar"),
      "git/github/o/r/notes.txt",
      "git/github/o/r.wiki/20260102T000000Z.bundle",
    ]);
    const target = createS3Target({ ...options, client });
    // The fake rejects ListMultipartUploads; that must not fail the cleanup.
    await target.cleanupIncomplete("github/o/r");
    expect([...keys].sort()).toEqual([
      "git/github/o/r.wiki/20260102T000000Z.bundle",
      "git/github/o/r/20260101T000000Z.bundle",
      "git/github/o/r/20260101T000000Z.json",
      "git/github/o/r/notes.txt",
    ]);
  });

  it("rejects repository keys that escape the prefix", async () => {
    const { client } = fakeClient([]);
    const target = createS3Target({ ...options, client });
    await expect(target.listSnapshots("../outside")).rejects.toThrow(/invalid repository key/);
  });

  it("names the bucket and hides credentials when the access check fails", async () => {
    const client = {
      send: async () => {
        throw Object.assign(new Error("bad key AKIA1 / s3cr3t"), {
          name: "InvalidAccessKeyId",
          $metadata: { httpStatusCode: 403 },
        });
      },
    } as never;
    const target = createS3Target({
      ...options,
      accessKeyId: "AKIA1",
      secretAccessKey: "s3cr3t",
      client,
    });
    const error = await target.checkAccess?.().catch((e: Error) => e);
    expect((error as Error).message).toBe(
      'cannot access bucket "b": InvalidAccessKeyId: bad key *** / *** (HTTP 403)',
    );
  });
});

describe("backup with an unreachable bucket", () => {
  it("exits with 2 before doing any work and never prints the credentials", async () => {
    const root = makeTempDir("ghb-s3fail-");
    const configFile = path.join(root, "config.json");
    writeFileSync(
      configFile,
      JSON.stringify({
        targets: [
          {
            type: "s3",
            name: "remote",
            bucket: "nope",
            endpoint: "http://127.0.0.1:1",
            forcePathStyle: true,
            accessKeyId: "AKIAUNITTESTID",
            secretAccessKey: "unit-test-secret",
          },
        ],
      }),
    );
    const err: string[] = [];
    const code = await createProgram({
      exec,
      env: {},
      stdout: () => {},
      stderr: (line) => err.push(line),
      homeDir: root,
      cwd: root,
    }).run(["backup", "--config", configFile, "--cache-dir", path.join(root, "cache")]);

    const output = err.join("\n");
    expect(code).toBe(2);
    expect(output).toContain('target "remote": cannot access bucket "nope"');
    expect(output).not.toContain("AKIAUNITTESTID");
    expect(output).not.toContain("unit-test-secret");
  }, 30_000);
});
