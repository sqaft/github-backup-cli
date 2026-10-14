import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandDeps } from "../../src/commands/context.js";
import { renderTable } from "../../src/commands/list.js";
import { createProgram } from "../../src/program.js";
import type { RepoInfo, Source } from "../../src/sources/types.js";
import { type Exec, ExecError } from "../../src/util/exec.js";

const repo = (fullName: string, extra: Partial<RepoInfo> = {}): RepoInfo => {
  const [owner = "", name = ""] = fullName.split("/");
  return {
    source: "github",
    owner,
    name,
    fullName,
    cloneUrl: `https://github.com/${fullName}.git`,
    hasWiki: false,
    isArchived: false,
    isFork: false,
    isEmpty: false,
    ...extra,
  };
};

const REPOS = [
  repo("me/app", { hasWiki: true }),
  repo("me/old", { isArchived: true }),
  repo("org/secret"),
  repo("org/fork", { isFork: true, isEmpty: true }),
];

let home: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "ghb-cmd-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function setup(
  options: {
    failures?: Array<{ owner: string; message: string }>;
    exec?: Exec;
    env?: Record<string, string>;
  } = {},
) {
  const out: string[] = [];
  const err: string[] = [];
  const source: Source = {
    id: "github",
    checkPrerequisites: async () => {},
    listRepos: async () => ({ repos: REPOS, failures: options.failures ?? [] }),
    gitEnv: () => ({}),
  };
  const deps: CommandDeps = {
    exec: options.exec ?? (async () => ({ stdout: "", stderr: "" })),
    env: options.env ?? {},
    stdout: (text) => out.push(text),
    stderr: (line) => err.push(line),
    homeDir: home,
    cwd: home,
    createSource: () => source,
  };
  return { run: (argv: string[]) => createProgram(deps).run(argv), out, err };
}

describe("list", () => {
  it("prints a table and exits 0", async () => {
    const { run, out } = setup();
    expect(await run(["list"])).toBe(0);
    const text = out.join("");
    expect(text.split("\n")[0]).toMatch(/^REPO\s+ARCHIVED\s+FORK\s+WIKI\s+EMPTY$/);
    expect(text).toContain("me/app");
    expect(text).toContain("4 repositories");
  });

  it("--json --exclude 'org/*' prints filtered JSON", async () => {
    const { run, out } = setup();
    expect(await run(["list", "--json", "--exclude", "org/*"])).toBe(0);
    const parsed = JSON.parse(out.join("")) as RepoInfo[];
    expect(parsed.map((r) => r.fullName)).toEqual(["me/app", "me/old"]);
    expect(parsed[0]).toMatchObject({ source: "github", hasWiki: true });
  });

  it("--include is repeatable", async () => {
    const { run, out } = setup();
    await run(["list", "--json", "--include", "me/app", "--include", "org/fork"]);
    expect((JSON.parse(out.join("")) as RepoInfo[]).map((r) => r.fullName)).toEqual([
      "me/app",
      "org/fork",
    ]);
  });

  it("--no-archived and --no-forks filter", async () => {
    const { run, out } = setup();
    await run(["list", "--json", "--no-archived", "--no-forks"]);
    expect((JSON.parse(out.join("")) as RepoInfo[]).map((r) => r.fullName)).toEqual([
      "me/app",
      "org/secret",
    ]);
  });

  it("env filters apply and a flag overrides them", async () => {
    const env = { GHBACKUP_EXCLUDE: "me/*" };
    const fromEnv = setup({ env });
    await fromEnv.run(["list", "--json"]);
    expect((JSON.parse(fromEnv.out.join("")) as RepoInfo[]).map((r) => r.owner)).toEqual([
      "org",
      "org",
    ]);

    const fromFlag = setup({ env });
    await fromFlag.run(["list", "--json", "--exclude", "org/*"]);
    expect((JSON.parse(fromFlag.out.join("")) as RepoInfo[]).map((r) => r.owner)).toEqual([
      "me",
      "me",
    ]);
  });

  it("exits 1 and warns when an owner could not be listed", async () => {
    const { run, err } = setup({ failures: [{ owner: "acme", message: "SAML" }] });
    expect(await run(["list"])).toBe(1);
    expect(err.join("\n")).toContain("could not list repositories of acme");
  });

  it("--quiet hides warnings but keeps the exit code", async () => {
    const { run, err } = setup({ failures: [{ owner: "acme", message: "SAML" }] });
    expect(await run(["list", "--quiet"])).toBe(1);
    expect(err).toEqual([]);
  });

  it("rejects --verbose together with --quiet with exit 2", async () => {
    const { run } = setup();
    expect(await run(["list", "--verbose", "--quiet"])).toBe(2);
  });

  it("exits 2 with a config error message for a bad env value", async () => {
    const { run, err } = setup({ env: { GHBACKUP_WIKI: "maybe" } });
    expect(await run(["list"])).toBe(2);
    expect(err.join("\n")).toContain("GHBACKUP_WIKI");
  });

  it("exits 2 for a missing --config file", async () => {
    const { run, err } = setup();
    expect(await run(["list", "--config", "nope.json"])).toBe(2);
    expect(err.join("\n")).toContain("config file not found");
  });
});

describe("list prerequisites (real github source, fake exec)", () => {
  function realSource(exec: Exec) {
    const out: string[] = [];
    const err: string[] = [];
    const deps: CommandDeps = {
      exec,
      env: {},
      stdout: (t) => out.push(t),
      stderr: (l) => err.push(l),
      homeDir: home,
      cwd: home,
    };
    return { run: (argv: string[]) => createProgram(deps).run(argv), out, err };
  }

  it("exits 2 with an install hint when gh is missing", async () => {
    const { run, err, out } = realSource(async () => {
      throw new ExecError("spawn gh ENOENT", "gh", "ENOENT", "");
    });
    expect(await run(["list"])).toBe(2);
    expect(err.join("\n")).toContain("https://cli.github.com");
    expect(out).toEqual([]);
  });

  it("exits 2 with login instructions when gh is logged out", async () => {
    const { run, err } = realSource(async (_cmd, args) => {
      if (args[0] === "auth") throw new ExecError("not logged in", "gh", 1, "not logged in");
      return { stdout: "gh version", stderr: "" };
    });
    expect(await run(["list"])).toBe(2);
    expect(err.join("\n")).toContain("gh auth login");
  });
});

describe("backup", () => {
  it("is not implemented yet and exits 2", async () => {
    const { run, err } = setup();
    expect(await run(["backup"])).toBe(2);
    expect(err.join("\n")).toContain("not implemented");
  });

  it("accepts every documented flag", async () => {
    const { run, err } = setup();
    const code = await run([
      "backup",
      "--config",
      "c.json",
      "--include",
      "a/*",
      "--exclude",
      "b/*",
      "--no-archived",
      "--no-forks",
      "--json",
      "--verbose",
      "--cache-dir",
      "/tmp/c",
      "--concurrency",
      "2",
      "--keep",
      "3",
      "--no-wiki",
      "--no-lfs",
      "--target",
      "disk",
      "--local",
      "/tmp/out",
    ]);
    // Flags parse; the command itself is the stub.
    expect(code).toBe(2);
    expect(err.join("\n")).toContain("not implemented");
  });

  it("rejects unknown flags with exit 2", async () => {
    const { run } = setup();
    expect(await run(["backup", "--bogus"])).toBe(2);
  });
});

describe("program", () => {
  it("prints help with exit 0", async () => {
    const { run, out } = setup();
    expect(await run(["--help"])).toBe(0);
    expect(out.join("")).toContain("list");
    expect(out.join("")).toContain("backup");
  });

  it("rejects an unknown command with exit 2", async () => {
    const { run } = setup();
    expect(await run(["frobnicate"])).toBe(2);
  });
});

describe("renderTable", () => {
  it("aligns columns and pluralizes the total", () => {
    expect(renderTable([repo("a/b", { isFork: true })])).toBe(
      [
        "REPO  ARCHIVED  FORK  WIKI  EMPTY",
        "a/b   -         yes   -     -",
        "",
        "1 repository",
      ].join("\n"),
    );
    expect(renderTable([])).toBe("REPO  ARCHIVED  FORK  WIKI  EMPTY\n\n0 repositories");
  });
});
