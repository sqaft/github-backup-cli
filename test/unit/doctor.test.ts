import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandDeps } from "../../src/commands/context.js";
import { type CheckResult, renderChecks, runDoctor } from "../../src/commands/doctor.js";
import type { Source } from "../../src/sources/types.js";
import type { Target } from "../../src/targets/types.js";
import { ConfigError, PrerequisiteError } from "../../src/util/errors.js";
import type { Exec } from "../../src/util/exec.js";

let home: string;
let configFile: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "ghb-doctor-"));
  configFile = path.join(home, "config.json");
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const writeConfig = (config: unknown) => writeFileSync(configFile, JSON.stringify(config));

const LOCAL = (name: string) => ({ type: "local", name, path: path.join(home, name) });

interface SetupOptions {
  exec?: Exec;
  sourceCheck?: () => Promise<void>;
  targetChecks?: Record<string, () => Promise<void>>;
}

function setup(options: SetupOptions = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const calls = { listRepos: 0 };
  const source: Source = {
    id: "github",
    checkPrerequisites: options.sourceCheck ?? (async () => {}),
    listRepos: async () => {
      calls.listRepos += 1;
      return { repos: [], failures: [] };
    },
    gitEnv: () => ({}),
  };
  const deps: CommandDeps = {
    exec: options.exec ?? (async () => ({ stdout: "", stderr: "" })),
    env: {},
    stdout: (text) => out.push(text),
    stderr: (line) => err.push(line),
    homeDir: home,
    cwd: home,
    createSource: () => source,
    createTarget: (config) =>
      ({ name: config.name, checkAccess: options.targetChecks?.[config.name] }) as Target,
  };
  return {
    run: (flags: Record<string, unknown> = {}) => runDoctor({ config: configFile, ...flags }, deps),
    out: () => out.join(""),
    calls,
  };
}

describe("doctor", () => {
  it("reports every check as ok and exits 0", async () => {
    writeConfig({ targets: [LOCAL("disk")] });
    const { run, out, calls } = setup();
    expect(await run()).toBe(0);
    expect(out()).toBe(
      [`✓ config: ${configFile}`, "✓ git", "✓ git-lfs", "✓ github", "✓ target disk", ""].join("\n"),
    );
    expect(calls.listRepos).toBe(0);
  });

  it("keeps going after failures and exits 2", async () => {
    writeConfig({ targets: [LOCAL("a"), LOCAL("b"), LOCAL("c")] });
    const { run, out } = setup({
      exec: async () => {
        throw new Error("not found");
      },
      sourceCheck: async () => {
        throw new PrerequisiteError("gh is not logged in");
      },
      targetChecks: {
        a: async () => {
          throw new Error("denied");
        },
        c: async () => {
          throw new Error("unreachable");
        },
      },
    });
    expect(await run()).toBe(2);
    expect(out().trimEnd().split("\n")).toEqual([
      `✓ config: ${configFile}`,
      "✗ git: git is not installed or not in PATH; install git and try again",
      expect.stringMatching(/^✗ git-lfs: git-lfs is not installed/),
      "✗ github: gh is not logged in",
      "✗ target a: denied",
      "✓ target b",
      "✗ target c: unreachable",
    ]);
  });

  it("skips git-lfs when LFS is disabled", async () => {
    writeConfig({ lfs: false, targets: [LOCAL("disk")] });
    const { run, out } = setup({
      exec: async (_cmd, args) => {
        if (args[0] === "lfs") throw new Error("must not be called");
        return { stdout: "", stderr: "" };
      },
    });
    expect(await run()).toBe(0);
    expect(out()).toContain("- git-lfs: disabled\n");
  });

  it("fails when no target is configured, and skips the missing config", async () => {
    const { run, out } = setup();
    expect(await run({ config: undefined })).toBe(2);
    const missing = path.join(home, ".config", "github-backup-cli", "config.json");
    expect(out()).toContain(`- config: none at ${missing}`);
    expect(out()).toContain("✗ targets: none configured; run github-backup setup\n");
  });

  it("keeps only the first line of a multi-line detail", async () => {
    writeConfig({ targets: [LOCAL("disk")] });
    const { run, out } = setup({
      sourceCheck: async () => {
        throw new PrerequisiteError("\n  gh: not logged in\nTry: gh auth login\n");
      },
    });
    expect(await run()).toBe(2);
    expect(out()).toContain("✗ github: gh: not logged in\n");
    expect(out()).not.toContain("gh auth login");
  });

  it("strips the target prefix of the check error only once", async () => {
    writeConfig({ targets: [LOCAL("disk")] });
    const { run, out } = setup({
      targetChecks: {
        disk: async () => {
          throw new Error("cannot access bucket");
        },
      },
    });
    await run();
    expect(out()).toContain("✗ target disk: cannot access bucket\n");
  });

  it("prints json with ok and the checks", async () => {
    writeConfig({ lfs: false, targets: [LOCAL("disk")] });
    const { run, out } = setup({
      targetChecks: {
        disk: async () => {
          throw new Error("denied");
        },
      },
    });
    expect(await run({ json: true })).toBe(2);
    expect(JSON.parse(out())).toEqual({
      ok: false,
      checks: [
        { name: "config", status: "ok", detail: configFile },
        { name: "git", status: "ok" },
        { name: "git-lfs", status: "skipped", detail: "disabled" },
        { name: "github", status: "ok" },
        { name: "target disk", status: "failed", detail: "denied" },
      ],
    });
  });

  it("still throws for an invalid config file", async () => {
    writeFileSync(configFile, JSON.stringify({ nope: true }));
    await expect(setup().run()).rejects.toBeInstanceOf(ConfigError);
  });
});

describe("renderChecks", () => {
  it("marks each status and appends the detail", () => {
    const checks: CheckResult[] = [
      { name: "git", status: "ok" },
      { name: "config", status: "ok", detail: "/c.json" },
      { name: "target r2", status: "failed", detail: "denied" },
      { name: "git-lfs", status: "skipped", detail: "disabled" },
    ];
    expect(renderChecks(checks)).toBe(
      ["✓ git", "✓ config: /c.json", "✗ target r2: denied", "- git-lfs: disabled"].join("\n"),
    );
  });
});
