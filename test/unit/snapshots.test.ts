import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandDeps } from "../../src/commands/context.js";
import { renderSnapshots, runSnapshots } from "../../src/commands/snapshots.js";
import type { Source } from "../../src/sources/types.js";
import type { Manifest, Target } from "../../src/targets/types.js";
import { ConfigError } from "../../src/util/errors.js";

let home: string;
let configFile: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "ghb-snapshots-"));
  configFile = path.join(home, "config.json");
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const manifest = (stamp: string, extra: Partial<Manifest> = {}): Manifest => ({
  version: 1,
  source: "github",
  fullName: "me/app",
  stamp,
  refsHash: `hash-${stamp}`,
  refs: [
    { name: "refs/heads/main", sha: "a" },
    { name: "refs/tags/v1", sha: "b" },
  ],
  bundleBytes: 2048,
  tool: { name: "t", version: "1" },
  ...extra,
});

/** In-memory storage: `<key>` -> stamp -> manifest (null = unreadable). */
type Store = Record<string, Record<string, Manifest | null>>;

interface SetupOptions {
  targets: Record<string, Store | Error>;
  config?: Record<string, unknown>;
}

function setup(options: SetupOptions) {
  writeFileSync(
    configFile,
    JSON.stringify({
      ...options.config,
      targets: Object.keys(options.targets).map((name) => ({
        type: "local",
        name,
        path: path.join(home, name),
      })),
    }),
  );
  const out: string[] = [];
  const err: string[] = [];
  const sourceCalls = { checkPrerequisites: 0, listRepos: 0 };
  const source: Source = {
    id: "github",
    checkPrerequisites: async () => {
      sourceCalls.checkPrerequisites += 1;
    },
    listRepos: async () => {
      sourceCalls.listRepos += 1;
      return { repos: [], failures: [] };
    },
    gitEnv: () => ({}),
  };
  const deps: CommandDeps = {
    exec: async () => {
      throw new Error("no process may run");
    },
    env: {},
    stdout: (text) => out.push(text),
    stderr: (line) => err.push(line),
    homeDir: home,
    cwd: home,
    createSource: () => source,
    createTarget: (config) => {
      const store = options.targets[config.name];
      const read = (key: string) => {
        if (store instanceof Error) throw store;
        return store?.[key] ?? {};
      };
      return {
        name: config.name,
        // Oldest first, like the real targets.
        listSnapshots: async (key: string) => Object.keys(read(key)).sort(),
        readManifest: async (key: string, stamp: string) => read(key)[stamp] ?? null,
      } as unknown as Target;
    },
  };
  return {
    run: (repo: string, flags: Record<string, unknown> = {}) =>
      runSnapshots(repo, { config: configFile, ...flags }, deps),
    out: () => out.join(""),
    err: () => err.join("\n"),
    sourceCalls,
  };
}

describe("snapshots", () => {
  it("prints a table with the newest snapshot first and a count", async () => {
    const { run, out } = setup({
      targets: {
        disk: {
          "github/me/app": {
            "20260101T000000Z": manifest("20260101T000000Z"),
            "20260103T000000Z": manifest("20260103T000000Z", { lfsTarBytes: 1024 }),
            "20260102T000000Z": manifest("20260102T000000Z"),
          },
        },
      },
    });
    expect(await run("me/app")).toBe(0);
    const lines = out().split("\n");
    expect(lines[0]).toMatch(/^TARGET\s+STAMP\s+SIZE\s+REFS$/);
    expect(lines.slice(1, 4).map((l) => l.split(/\s+/)[1])).toEqual([
      "20260103T000000Z",
      "20260102T000000Z",
      "20260101T000000Z",
    ]);
    expect(lines[1]).toMatch(/^disk\s+20260103T000000Z\s+3.0 KB\s+2$/);
    expect(lines[2]).toMatch(/^disk\s+20260102T000000Z\s+2.0 KB\s+2$/);
    expect(lines.slice(4)).toEqual(["", "3 snapshots", ""]);
  });

  it("uses the singular for one snapshot", async () => {
    const { run, out } = setup({
      targets: { disk: { "github/me/app": { "20260101T000000Z": manifest("20260101T000000Z") } } },
    });
    await run("me/app");
    expect(out()).toContain("\n\n1 snapshot\n");
  });

  it("looks up the wiki under its own key", async () => {
    const { run, out } = setup({
      targets: {
        disk: {
          "github/me/app": { "20260101T000000Z": manifest("20260101T000000Z") },
          "github/me/app.wiki": { "20260105T000000Z": manifest("20260105T000000Z") },
        },
      },
    });
    expect(await run("me/app.wiki", { json: true })).toBe(0);
    expect(JSON.parse(out())).toMatchObject([
      { target: "disk", repo: "github/me/app.wiki", stamp: "20260105T000000Z" },
    ]);
  });

  it("exits 0 with zero snapshots", async () => {
    const { run, out } = setup({ targets: { disk: {} } });
    expect(await run("me/app")).toBe(0);
    expect(out()).toContain("\n\n0 snapshots\n");
  });

  it.each([
    "app",
    "me/app/extra",
    "/me/app",
    "me/",
    "../app",
    "me/..",
    "./app",
    "me/.",
    "me/a pp",
    "",
  ])("rejects %j", async (repo) => {
    const { run } = setup({ targets: { disk: {} } });
    const error = await run(repo).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).exitCode).toBe(2);
    expect((error as ConfigError).message).toBe(`expected owner/repo, got "${repo}"`);
  });

  it("reports a failing target, still prints the others and exits 1", async () => {
    const { run, out, err } = setup({
      targets: {
        broken: new Error("cannot list snapshots: denied"),
        disk: { "github/me/app": { "20260101T000000Z": manifest("20260101T000000Z") } },
      },
    });
    expect(await run("me/app")).toBe(1);
    expect(err()).toContain("broken: cannot list snapshots: denied");
    expect(out()).toContain("disk");
    expect(out()).toContain("1 snapshot");
    expect(out()).not.toContain("broken");
  });

  it("shows - for a manifest that cannot be read", async () => {
    const { run, out } = setup({
      targets: { disk: { "github/me/app": { "20260101T000000Z": null } } },
    });
    expect(await run("me/app")).toBe(0);
    expect(out().split("\n")[1]).toMatch(/^disk\s+20260101T000000Z\s+-\s+-$/);
  });

  it("prints json with counts, nulls for unreadable manifests and no absent lfsTarBytes", async () => {
    const { run, out } = setup({
      targets: {
        disk: {
          "github/me/app": {
            "20260101T000000Z": null,
            "20260102T000000Z": manifest("20260102T000000Z"),
            "20260103T000000Z": manifest("20260103T000000Z", { lfsTarBytes: 10 }),
          },
        },
      },
    });
    expect(await run("me/app", { json: true })).toBe(0);
    const rows = JSON.parse(out()) as Array<Record<string, unknown>>;
    expect(rows).toEqual([
      {
        target: "disk",
        repo: "github/me/app",
        stamp: "20260103T000000Z",
        bundleBytes: 2048,
        lfsTarBytes: 10,
        refs: 2,
        refsHash: "hash-20260103T000000Z",
      },
      {
        target: "disk",
        repo: "github/me/app",
        stamp: "20260102T000000Z",
        bundleBytes: 2048,
        refs: 2,
        refsHash: "hash-20260102T000000Z",
      },
      {
        target: "disk",
        repo: "github/me/app",
        stamp: "20260101T000000Z",
        bundleBytes: null,
        lfsTarBytes: null,
        refs: null,
        refsHash: null,
      },
    ]);
    expect(rows[1]).not.toHaveProperty("lfsTarBytes");
  });

  it("never touches the source", async () => {
    const { run, sourceCalls } = setup({ targets: { disk: {} } });
    await run("me/app");
    expect(sourceCalls).toEqual({ checkPrerequisites: 0, listRepos: 0 });
  });

  it("explains a missing target configuration", async () => {
    const { run } = setup({ targets: {} });
    await expect(run("me/app")).rejects.toThrow(/no targets configured; run github-backup setup/);
  });
});

describe("renderSnapshots", () => {
  it("adds the LFS archive to the size", () => {
    const text = renderSnapshots([
      {
        target: "r2",
        repo: "github/me/app",
        stamp: "20260101T000000Z",
        manifest: manifest("20260101T000000Z", { bundleBytes: 1024, lfsTarBytes: 1024 }),
      },
    ]);
    expect(text).toMatch(/r2\s+20260101T000000Z\s+2.0 KB\s+2/);
  });
});
