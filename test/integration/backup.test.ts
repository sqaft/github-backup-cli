import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderSummary } from "../../src/commands/backup.js";
import type { CommandDeps } from "../../src/commands/context.js";
import type { Summary } from "../../src/core/run.js";
import { createProgram } from "../../src/program.js";
import type { RepoInfo } from "../../src/sources/types.js";
import { ansi } from "../../src/util/color.js";
import { ExitCode } from "../../src/util/errors.js";
import type { ProgressDisplay } from "../../src/util/progress.js";
import { fakeSource, isolatedExec, makeTempDir, repoInfo, TestRemote } from "../helpers/git.js";

interface Json {
  summary: {
    ok: number;
    unchanged: number;
    skipped: number;
    failed: number;
    bytes: number;
    durationMs: number;
  };
  failures: Array<{ repo: string; error: string }>;
  results: Array<{ key: string; status: string; reason?: string }>;
}

let root: string;
let home: string;
let clock: number;

beforeEach(() => {
  root = makeTempDir("ghb-run-");
  home = path.join(root, "home");
  clock = Date.UTC(2026, 0, 1);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function setup(repos: RepoInfo[], extra: Partial<CommandDeps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const deps: CommandDeps = {
    exec: isolatedExec(home),
    env: {},
    stdout: (text) => out.push(text),
    stderr: (line) => err.push(line),
    homeDir: home,
    cwd: root,
    createSource: () => fakeSource(repos),
    // Every call to now() is one second later so snapshots never share a stamp.
    now: () => {
      clock += 1000;
      return new Date(clock);
    },
    sleep: async () => {},
    ...extra,
  };
  const backup = async (...flags: string[]) => {
    out.length = 0;
    const code = await createProgram(deps).run([
      "backup",
      "--to",
      path.join(root, "out"),
      "--cache-dir",
      path.join(root, "cache"),
      ...flags,
    ]);
    return { code, json: out.length ? (JSON.parse(out.join("")) as Json) : undefined };
  };
  return { backup, err };
}

const snapshotDir = (key: string) => path.join(root, "out", key);
const list = (key: string) =>
  existsSync(snapshotDir(key)) ? readdirSync(snapshotDir(key)).sort() : [];

/** A display that records calls, in order, instead of drawing. */
function recordingProgress() {
  const events: string[] = [];
  const display: ProgressDisplay = {
    activity: (label) => events.push(`activity ${label}`),
    start: (total) => events.push(`start ${total}`),
    unitStart: (key) => events.push(`unitStart ${key}`),
    phase: (key, label) => events.push(`phase ${key} ${label}`),
    percent: (key, percent) => events.push(`percent ${key} ${percent}`),
    unitDone: (key, status) => events.push(`unitDone ${key} ${status}`),
    log: (line) => events.push(`log ${line}`),
    stop: () => events.push("stop"),
  };
  return { events, createProgress: () => display };
}

describe("backup", () => {
  it("reports every unit from start to done, whatever its outcome", async () => {
    const a = new TestRemote(root, "a", home);
    a.commit("a.txt", "1");
    const broken = { url: `file://${path.join(root, "missing.git")}` };
    const { events, createProgress } = recordingProgress();
    const { backup, err } = setup(
      [repoInfo("o/a", a), repoInfo("o/broken", broken), repoInfo("o/empty", a, { isEmpty: true })],
      { createProgress },
    );

    await backup("--concurrency", "1");

    const reported = events.filter((event) => !/^(log|percent) /.test(event));
    expect(reported).toEqual([
      "activity Checking tools",
      "activity Checking target local",
      "activity Listing repositories",
      "activity Preparing",
      "start 3",
      "unitStart test/o/a",
      "phase test/o/a fetching",
      "phase test/o/a checking targets",
      "phase test/o/a bundling",
      "phase test/o/a fetching LFS",
      "phase test/o/a writing to local",
      "phase test/o/a pruning local",
      "unitDone test/o/a ok",
      "unitStart test/o/broken",
      "phase test/o/broken fetching",
      "unitDone test/o/broken failed",
      "unitStart test/o/empty",
      "unitDone test/o/empty skipped",
      "stop",
      "stop",
    ]);
    // Log lines go through the display, and the summary comes after the block is gone.
    expect(events.some((event) => event.includes("INFO"))).toBe(true);
    expect(err.join("\n")).not.toContain("INFO");
    const lastStop = events.lastIndexOf("stop");
    const firstStop = events.indexOf("stop");
    expect(lastStop).toBeGreaterThan(firstStop);
    expect(events.slice(firstStop + 1, lastStop).join("\n")).toContain("Backup finished");
  });

  it("reports git's transfer percentages and keeps them out of errors", async () => {
    const a = new TestRemote(root, "a", home);
    a.commit("a.txt", "1");
    const broken = { url: `file://${path.join(root, "missing.git")}` };
    const { events, createProgress } = recordingProgress();
    const repos = [repoInfo("o/a", a), repoInfo("o/broken", broken)];
    // git stays silent while unpacking a small fetch; a limit of 1 forces the reported path.
    const unpackLimit = {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "fetch.unpackLimit",
      GIT_CONFIG_VALUE_0: "1",
    };
    const { backup } = setup(repos, {
      createProgress,
      createSource: () => fakeSource(repos, unpackLimit),
    });

    const { json } = await backup("--concurrency", "1", "--json");

    const fetching = events.indexOf("phase test/o/a fetching");
    const bundling = events.indexOf("phase test/o/a bundling");
    const done = events.indexOf("unitDone test/o/a ok");
    expect(events.slice(fetching, bundling)).toContain("percent test/o/a 100");
    expect(events.slice(bundling, done)).toContain("percent test/o/a 100");
    expect(json?.failures[0]?.error).not.toContain("%");
  });

  it("keeps per-unit unchanged and skipped lines off the progress block", async () => {
    const a = new TestRemote(root, "a", home);
    a.commit("a.txt", "1");
    const repos = [repoInfo("o/a", a), repoInfo("o/empty", a, { isEmpty: true })];
    const withProgress = recordingProgress();
    const shown = setup(repos, { createProgress: withProgress.createProgress });
    await shown.backup();
    withProgress.events.length = 0;
    await shown.backup();

    const logged = withProgress.events.filter((event) => event.startsWith("log ")).join("\n");
    expect(logged).not.toContain("test/o/a: unchanged");
    expect(logged).not.toContain("test/o/empty: skipped");

    withProgress.events.length = 0;
    await shown.backup("--verbose");
    const verbose = withProgress.events.filter((event) => event.startsWith("log ")).join("\n");
    expect(verbose).toContain("DEBUG test/o/a: unchanged");
    expect(verbose).toContain("DEBUG test/o/empty: skipped: empty");

    const plain = setup(repos);
    await plain.backup();
    plain.err.length = 0;
    await plain.backup();
    expect(plain.err.join("\n")).toContain("INFO  test/o/a: unchanged");
    expect(plain.err.join("\n")).toContain("INFO  test/o/empty: skipped: empty");
  });

  it("counts no bytes for an unchanged run", async () => {
    const a = new TestRemote(root, "a", home);
    a.commit("a.txt", "1");
    const { backup } = setup([repoInfo("o/a", a)]);
    expect((await backup("--json")).json?.summary.bytes).toBeGreaterThan(0);
    expect((await backup("--json")).json?.summary.bytes).toBe(0);
  });

  it("removes the activity line before a failed check is reported", async () => {
    const { events, createProgress } = recordingProgress();
    const { backup } = setup([], {
      createProgress,
      exec: async (_cmd: string, args: string[]) => {
        if (args[0] === "--version") throw new Error("no git");
        return { stdout: "", stderr: "" };
      },
    });

    await backup();

    expect(events).toEqual(["activity Checking tools", "stop"]);
  });

  it("draws no progress with --quiet", async () => {
    const a = new TestRemote(root, "a", home);
    a.commit("a.txt", "1");
    const { events, createProgress } = recordingProgress();
    const { backup, err } = setup([repoInfo("o/a", a)], { createProgress });

    await backup("--quiet");

    expect(events).toEqual([]);
    expect(err.join("\n")).toContain("Backup finished");
  });

  it("backs up good repositories, fails the broken one and exits 1", async () => {
    const a = new TestRemote(root, "a", home);
    a.commit("a.txt", "1");
    const b = new TestRemote(root, "b", home);
    b.commit("b.txt", "1");
    const broken = { url: `file://${path.join(root, "missing.git")}` };
    const { backup, err } = setup([
      repoInfo("o/a", a),
      repoInfo("o/broken", broken),
      repoInfo("o/b", b),
    ]);

    const { code, json } = await backup("--json");
    expect(code).toBe(ExitCode.PartialFailure);
    expect(json?.summary).toEqual({
      ok: 2,
      unchanged: 0,
      skipped: 0,
      failed: 1,
      bytes: expect.any(Number),
      durationMs: expect.any(Number),
      interrupted: false,
    });
    expect(json?.summary.bytes).toBeGreaterThan(0);
    expect(json?.summary.durationMs).toBeGreaterThanOrEqual(0);
    expect(json?.failures.map((f) => f.repo)).toEqual(["test/o/broken"]);
    expect(list("test/o/a")).toHaveLength(2);
    expect(list("test/o/b")).toHaveLength(2);
    expect(err.join("\n")).toContain("1 failed");
    expect(err.join("\n")).toContain("failed: test/o/broken");
  });

  it("creates no new snapshot when refs are unchanged, and one when they change", async () => {
    const a = new TestRemote(root, "a", home);
    a.commit("a.txt", "1");
    const { backup } = setup([repoInfo("o/a", a)]);

    expect((await backup()).code).toBe(0);
    const first = list("test/o/a");
    const second = await backup("--json");
    expect(second.code).toBe(0);
    expect(second.json?.summary).toMatchObject({ ok: 0, unchanged: 1 });
    expect(list("test/o/a")).toEqual(first);

    a.commit("a.txt", "2");
    expect((await backup()).code).toBe(0);
    expect(list("test/o/a")).toHaveLength(4);
  });

  it("keeps only the newest snapshots (--keep 2 after 3 changes)", async () => {
    const a = new TestRemote(root, "a", home);
    const { backup } = setup([repoInfo("o/a", a)]);
    for (const n of [1, 2, 3]) {
      a.commit("a.txt", String(n));
      expect((await backup("--keep", "2")).code).toBe(0);
    }
    const files = list("test/o/a");
    expect(files.filter((f) => f.endsWith(".json"))).toHaveLength(2);
    expect(files.filter((f) => f.endsWith(".bundle"))).toHaveLength(2);
  });

  it("restores a repository from the written bundle", async () => {
    const a = new TestRemote(root, "a", home);
    a.commit("a.txt", "1");
    a.commit("b.txt", "2", "feature");
    a.tag("v1");
    const { backup } = setup([repoInfo("o/a", a)]);
    await backup();

    const bundle = list("test/o/a").find((f) => f.endsWith(".bundle")) as string;
    const restored = path.join(root, "restored");
    const exec = isolatedExec(home);
    await exec("git", ["clone", "--mirror", path.join(snapshotDir("test/o/a"), bundle), restored]);
    const { stdout } = await exec("git", ["for-each-ref", "refs/heads", "refs/tags"], {
      cwd: restored,
    });
    expect(stdout).toBe(a.refs());
  });

  it("backs up the wiki and skips repositories without one or without content", async () => {
    const a = new TestRemote(root, "a", home);
    a.commit("a.txt", "1");
    const wiki = new TestRemote(root, "a.wiki-src", home);
    wiki.commit("Home.md", "hi");
    const missingWiki = new TestRemote(root, "b", home);
    missingWiki.commit("b.txt", "1");
    const { backup } = setup([
      repoInfo("o/a", a, { hasWiki: true, wikiUrl: wiki.url }),
      repoInfo("o/b", missingWiki, {
        hasWiki: true,
        wikiUrl: `file://${path.join(root, "gone.wiki.git")}`,
      }),
      repoInfo("o/empty", a, { isEmpty: true }),
    ]);

    const { code, json } = await backup("--json");
    expect(code).toBe(0);
    const status = Object.fromEntries(json?.results.map((r) => [r.key, r.status]) ?? []);
    expect(status).toEqual({
      "test/o/a": "ok",
      "test/o/a.wiki": "ok",
      "test/o/b": "ok",
      "test/o/b.wiki": "skipped",
      "test/o/empty": "skipped",
    });
    expect(json?.results.find((r) => r.key === "test/o/b.wiki")?.reason).toBe("no wiki");
    expect(list("test/o/a.wiki")).toHaveLength(2);

    expect((await backup("--no-wiki", "--json")).json?.results.map((r) => r.key)).not.toContain(
      "test/o/a.wiki",
    );
  });

  it("exits 3 while another run holds the lock", async () => {
    const a = new TestRemote(root, "a", home);
    a.commit("a.txt", "1");
    const { backup, err } = setup([repoInfo("o/a", a)]);
    const cache = path.join(root, "cache");
    // The test process itself is alive, so its PID counts as a running backup.
    const { mkdirSync } = await import("node:fs");
    mkdirSync(cache, { recursive: true });
    writeFileSync(path.join(cache, ".lock"), `${process.pid}\n`);

    expect((await backup()).code).toBe(ExitCode.Locked);
    expect(err.join("\n")).toContain("another backup run is in progress");
    expect(existsSync(path.join(cache, ".lock"))).toBe(true);
    expect(list("test/o/a")).toEqual([]);
  });

  it("removes the lock and temporary files after a run", async () => {
    const a = new TestRemote(root, "a", home);
    a.commit("a.txt", "1");
    const { backup } = setup([repoInfo("o/a", a)]);
    await backup();
    expect(existsSync(path.join(root, "cache", ".lock"))).toBe(false);
    expect(existsSync(path.join(root, "cache", "tmp"))).toBe(false);
  });

  it("exits 130 and starts nothing when aborted", async () => {
    const a = new TestRemote(root, "a", home);
    a.commit("a.txt", "1");
    const controller = new AbortController();
    controller.abort();
    const { backup } = setup([repoInfo("o/a", a)], { signal: controller.signal });
    expect((await backup()).code).toBe(ExitCode.Interrupted);
    expect(list("test/o/a")).toEqual([]);
    expect(existsSync(path.join(root, "cache", ".lock"))).toBe(false);
  });

  it("exits 2 without targets", async () => {
    const { err } = setup([]);
    const code = await createProgram({
      exec: isolatedExec(home),
      env: {},
      stdout: () => {},
      stderr: (line) => err.push(line),
      homeDir: home,
      cwd: root,
      createSource: () => fakeSource([]),
    }).run(["backup", "--cache-dir", path.join(root, "cache")]);
    expect(code).toBe(ExitCode.Usage);
    expect(err.join("\n")).toContain("no targets configured; use --to <path>");
  });

  it("never touches the global git config", async () => {
    const a = new TestRemote(root, "a", home);
    a.commit("a.txt", "1");
    const { backup } = setup([repoInfo("o/a", a)]);
    await backup();
    expect(existsSync(path.join(home, ".gitconfig"))).toBe(false);
    expect(existsSync(path.join(home, ".config", "git", "config"))).toBe(false);
  });

  it("retries a failing step and succeeds once the remote appears", async () => {
    const a = new TestRemote(root, "a", home);
    a.commit("a.txt", "1");
    const waits: number[] = [];
    let attempts = 0;
    const real = isolatedExec(home);
    const { backup } = setup([repoInfo("o/a", a)], {
      sleep: async (ms) => void waits.push(ms),
      exec: async (cmd, args, opts) => {
        if (args.includes("fetch") && ++attempts < 3) throw new Error("network down");
        return real(cmd, args, opts);
      },
    });
    expect((await backup()).code).toBe(0);
    expect(waits).toEqual([1000, 5000]);
    expect(list("test/o/a")).toHaveLength(2);
  });
});

describe("renderSummary", () => {
  const summary = (extra: Partial<Summary> = {}): Summary => ({
    ok: 9,
    unchanged: 5,
    skipped: 1,
    failed: 0,
    bytes: 0,
    results: [],
    interrupted: false,
    ...extra,
  });

  it("shows the duration and counts, and the size written when there is one", () => {
    expect(renderSummary(summary(), [], 252_000)).toEqual([
      "Backup finished in 4m 12s: 9 backed up, 5 unchanged, 1 skipped, 0 failed",
    ]);
    const bytes = Math.round(1.2 * 1024 ** 3);
    expect(renderSummary(summary({ failed: 2, bytes }), [], 252_000)[0]).toBe(
      "Backup finished in 4m 12s: 9 backed up, 5 unchanged, 1 skipped, 2 failed, 1.2 GB written",
    );
  });

  it("paints the prefixes and leaves the messages alone", () => {
    const failed: Summary["results"][number] = {
      key: "github/acme/app",
      kind: "repo",
      status: "failed",
      error: "boom",
      targets: [],
    };
    const lines = renderSummary(
      summary({ failed: 1, results: [failed], interrupted: true }),
      [{ owner: "ghost", message: "not found" }],
      0,
      ansi,
    );
    expect(lines.slice(1)).toEqual([
      `  ${ansi("red", "failed: ")}github/acme/app: boom`,
      `  ${ansi("red", "not listed: ")}ghost: not found`,
      ansi("yellow", "Interrupted before all repositories were processed."),
    ]);
  });
});
