import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ConfigFlags,
  defaultConfigPath,
  expandPath,
  loadConfig,
  parseBoolean,
  parseInteger,
  parseList,
} from "../../src/config/load.js";
import { ConfigError, ExitCode } from "../../src/util/errors.js";

let home: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "ghb-config-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function writeConfig(content: unknown, mode = 0o600, file = "config.json"): string {
  const target = path.join(home, file);
  writeFileSync(target, typeof content === "string" ? content : JSON.stringify(content), { mode });
  chmodSync(target, mode);
  return target;
}

function load(flags: ConfigFlags = {}, env: Record<string, string> = {}) {
  return loadConfig({ flags, env, homeDir: home, cwd: home });
}

describe("parsers", () => {
  it.each([
    ["true", true],
    ["TRUE", true],
    ["1", true],
    ["false", false],
    ["0", false],
    [" False ", false],
  ])("parseBoolean(%s)", (input, expected) => {
    expect(parseBoolean("X", input)).toBe(expected);
  });

  it.each(["yes", "2", ""])("parseBoolean rejects %j", (input) => {
    expect(() => parseBoolean("X", input)).toThrow(ConfigError);
  });

  it("parseInteger", () => {
    expect(parseInteger("X", "8")).toBe(8);
    expect(parseInteger("X", 3)).toBe(3);
    expect(() => parseInteger("X", "abc")).toThrow(/X: expected an integer/);
    expect(() => parseInteger("X", "1.5")).toThrow(ConfigError);
  });

  it("parseList trims and drops empty items", () => {
    expect(parseList(" a/*, ,b/c ,")).toEqual(["a/*", "b/c"]);
  });
});

describe("expandPath", () => {
  const env = { FOO: "/srv/foo", EMPTY: "" };
  it.each([
    ["~", "/home/u"],
    ["~/x", "/home/u/x"],
    ["$FOO/y", "/srv/foo/y"],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal config syntax under test
    ["${FOO}/y", "/srv/foo/y"],
    ["rel/dir", "/work/rel/dir"],
    ["/abs/dir", "/abs/dir"],
    ["~other/x", "/work/~other/x"],
  ])("%s", (input, expected) => {
    expect(expandPath(input, env, "/home/u", "/work")).toBe(expected);
  });

  it("rejects an unset variable", () => {
    expect(() => expandPath("$NOPE/x", env, "/home/u", "/work")).toThrow(/NOPE is not set/);
  });
});

describe("defaultConfigPath", () => {
  it("uses XDG_CONFIG_HOME when set", () => {
    expect(defaultConfigPath({ XDG_CONFIG_HOME: "/xdg" }, "/home/u")).toBe(
      "/xdg/github-backup-cli/config.json",
    );
  });
  it("falls back to ~/.config", () => {
    expect(defaultConfigPath({}, "/home/u")).toBe("/home/u/.config/github-backup-cli/config.json");
  });
});

describe("loadConfig defaults and files", () => {
  it("returns defaults when the default file does not exist", () => {
    const { config, configPath, warnings } = load();
    expect(configPath).toBeUndefined();
    expect(warnings).toEqual([]);
    expect(config).toMatchObject({
      concurrency: 4,
      wiki: true,
      lfs: true,
      keep: 7,
      cacheDir: path.join(home, ".cache/github-backup-cli"),
      targets: [],
      sources: [{ type: "github", include: ["*/*"], exclude: [], archived: true, forks: true }],
    });
  });

  it("reads the default file from XDG_CONFIG_HOME", () => {
    const dir = path.join(home, "xdg", "github-backup-cli");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "config.json"), JSON.stringify({ keep: 3 }));
    const { config, configPath } = load({}, { XDG_CONFIG_HOME: path.join(home, "xdg") });
    expect(config.keep).toBe(3);
    expect(configPath).toBe(path.join(dir, "config.json"));
  });

  it("fails when an explicit --config file is missing", () => {
    expect(() => load({ config: "missing.json" })).toThrow(/config file not found/);
  });

  it("fails when GHBACKUP_CONFIG points to a missing file", () => {
    expect(() => load({}, { GHBACKUP_CONFIG: path.join(home, "nope.json") })).toThrow(
      /config file not found/,
    );
  });

  it("reports invalid JSON", () => {
    writeConfig("{ nope");
    expect(() => load({ config: "config.json" })).toThrow(/invalid JSON/);
  });

  it("requires a JSON object", () => {
    writeConfig("[]");
    expect(() => load({ config: "config.json" })).toThrow(/top level must be a JSON object/);
  });

  it("expands ~ and variables in cacheDir and local target paths", () => {
    writeConfig({
      cacheDir: "~/cache",
      targets: [{ type: "local", name: "disk", path: "$BACKUP_ROOT/git" }],
    });
    const { config } = load({ config: "config.json" }, { BACKUP_ROOT: "/mnt/backup" });
    expect(config.cacheDir).toBe(path.join(home, "cache"));
    expect(config.targets[0]).toMatchObject({ path: "/mnt/backup/git" });
  });
});

describe("loadConfig precedence: flag > env > file > default", () => {
  const cases: Array<{
    label: string;
    file?: number;
    env?: string;
    flag?: number;
    expected: number;
  }> = [
    { label: "default", expected: 4 },
    { label: "file", file: 2, expected: 2 },
    { label: "env over file", file: 2, env: "3", expected: 3 },
    { label: "flag over env and file", file: 2, env: "3", flag: 5, expected: 5 },
    { label: "flag over default", flag: 6, expected: 6 },
  ];

  it.each(cases)("concurrency: $label", ({ file, env, flag, expected }) => {
    if (file !== undefined) writeConfig({ concurrency: file });
    const result = load(
      { config: file !== undefined ? "config.json" : undefined, concurrency: flag },
      env !== undefined ? { GHBACKUP_CONCURRENCY: env } : {},
    );
    expect(result.config.concurrency).toBe(expected);
  });

  it("flag strings from the command line are parsed as numbers", () => {
    expect(load({ concurrency: "7", keep: "9" }).config).toMatchObject({ concurrency: 7, keep: 9 });
  });

  it("booleans: env over file, flag over env", () => {
    writeConfig({ wiki: true, lfs: true });
    const env = { GHBACKUP_WIKI: "0", GHBACKUP_LFS: "false" };
    expect(load({ config: "config.json" }, env).config).toMatchObject({ wiki: false, lfs: false });
    expect(load({ config: "config.json", lfs: true }, env).config).toMatchObject({
      wiki: false,
      lfs: true,
    });
  });

  it("include/exclude: flag over env over file, applied to every github source", () => {
    writeConfig({ sources: [{ type: "github", include: ["file/*"], exclude: ["file/x"] }] });
    const env = { GHBACKUP_INCLUDE: "env/*,env2/*", GHBACKUP_EXCLUDE: "env/skip" };
    const fromEnv = load({ config: "config.json" }, env).config.sources[0];
    expect(fromEnv).toMatchObject({ include: ["env/*", "env2/*"], exclude: ["env/skip"] });
    const fromFlag = load({ config: "config.json", include: ["flag/*"] }, env).config.sources[0];
    expect(fromFlag).toMatchObject({ include: ["flag/*"], exclude: ["env/skip"] });
  });

  it("--no-archived / --no-forks override the file", () => {
    writeConfig({ sources: [{ type: "github", archived: true, forks: true }] });
    const source = load({ config: "config.json", archived: false, forks: false }).config.sources[0];
    expect(source).toMatchObject({ archived: false, forks: false });
  });

  it("creates the default github source when only filters are overridden", () => {
    expect(load({ exclude: ["org/*"] }).config.sources).toEqual([
      { type: "github", include: ["*/*"], exclude: ["org/*"], archived: true, forks: true },
    ]);
  });

  it("rejects a malformed env value", () => {
    expect(() => load({}, { GHBACKUP_CONCURRENCY: "many" })).toThrow(/GHBACKUP_CONCURRENCY/);
    expect(() => load({}, { GHBACKUP_WIKI: "maybe" })).toThrow(/GHBACKUP_WIKI/);
  });

  it("ignores empty env values", () => {
    expect(load({}, { GHBACKUP_CONCURRENCY: "" }).config.concurrency).toBe(4);
  });
});

describe("loadConfig validation errors", () => {
  it.each([
    ["wrong type", { concurrency: "four" }, "concurrency:"],
    ["out of range", { keep: 0 }, "keep:"],
    ["unknown top-level key", { concurency: 3 }, '"concurency"'],
    ["unknown source type", { sources: [{ type: "gitlab" }] }, "sources.0.type"],
    ["missing s3 bucket", { targets: [{ type: "s3", name: "r2" }] }, "targets.0.bucket"],
    [
      "bad endpoint",
      { targets: [{ type: "s3", name: "r2", bucket: "b", endpoint: "nope" }] },
      "targets.0.endpoint",
    ],
    [
      "duplicate target names",
      {
        targets: [
          { type: "local", name: "a", path: "/x" },
          { type: "local", name: "a", path: "/y" },
        ],
      },
      'duplicate target name "a"',
    ],
  ])("%s", (_label, content, fragment) => {
    writeConfig(content);
    let error: unknown;
    try {
      load({ config: "config.json" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).exitCode).toBe(ExitCode.Usage);
    expect((error as ConfigError).message).toContain(fragment);
    expect((error as ConfigError).message).toContain("invalid configuration");
  });
});

describe("loadConfig targets", () => {
  const targets = [
    { type: "local", name: "disk", path: "/backups" },
    { type: "s3", name: "r2", bucket: "b", keep: 14 },
  ];

  it("--target / GHBACKUP_TARGETS select targets by name", () => {
    writeConfig({ targets });
    expect(
      load({ config: "config.json", target: ["r2"] }).config.targets.map((t) => t.name),
    ).toEqual(["r2"]);
    expect(
      load({ config: "config.json" }, { GHBACKUP_TARGETS: "disk" }).config.targets.map(
        (t) => t.name,
      ),
    ).toEqual(["disk"]);
  });

  it("rejects an unknown target name and lists the available ones", () => {
    writeConfig({ targets });
    expect(() => load({ config: "config.json", target: ["nas"] })).toThrow(
      /unknown target "nas" \(available: disk, r2\)/,
    );
  });

  it("--local adds a temporary local target", () => {
    writeConfig({ targets });
    const result = load({ config: "config.json", local: "out" });
    expect(result.config.targets.map((t) => t.name)).toEqual(["disk", "r2", "local"]);
    expect(result.config.targets[2]).toMatchObject({ type: "local", path: path.join(home, "out") });
  });

  it("--local can be combined with --target", () => {
    writeConfig({ targets });
    const names = load({
      config: "config.json",
      local: "out",
      target: ["local"],
    }).config.targets.map((t) => t.name);
    expect(names).toEqual(["local"]);
  });

  it('--local conflicts with a target named "local"', () => {
    writeConfig({ targets: [{ type: "local", name: "local", path: "/x" }] });
    expect(() => load({ config: "config.json", local: "out" })).toThrow(/conflicts/);
  });
});

describe("loadConfig S3 credentials and file permissions", () => {
  const s3 = (extra: object = {}) => ({
    targets: [{ type: "s3", name: "r2", bucket: "b", ...extra }],
  });

  it("falls back to env credentials; file values win", () => {
    writeConfig(s3({ accessKeyId: "FILEKEY" }));
    const { config, secrets } = load(
      { config: "config.json" },
      { GHBACKUP_S3_ACCESS_KEY_ID: "ENVKEY", GHBACKUP_S3_SECRET_ACCESS_KEY: "ENVSECRET" },
    );
    expect(config.targets[0]).toMatchObject({
      accessKeyId: "FILEKEY",
      secretAccessKey: "ENVSECRET",
    });
    expect(secrets).toEqual(["FILEKEY", "ENVSECRET"]);
  });

  it("leaves credentials unset for the SDK default chain", () => {
    writeConfig(s3());
    const { config, secrets } = load({ config: "config.json" });
    expect(config.targets[0]).not.toHaveProperty("accessKeyId", expect.anything());
    expect(secrets).toEqual([]);
  });

  it.each([
    ["world-readable with keys", 0o644, s3({ secretAccessKey: "x" }), true],
    ["group-readable with keys", 0o640, s3({ accessKeyId: "x" }), true],
    ["private with keys", 0o600, s3({ secretAccessKey: "x" }), false],
    ["world-readable without keys", 0o644, s3(), false],
  ])("permission warning: %s", (_label, mode, content, warns) => {
    writeConfig(content, mode);
    const { warnings } = load({ config: "config.json" });
    expect(warnings.length > 0).toBe(warns);
    if (warns) expect(warnings[0]).toContain("chmod 600");
  });
});

describe("config.example.json", () => {
  it("is a valid configuration", () => {
    const example = path.resolve(import.meta.dirname, "../../config.example.json");
    const { config } = loadConfig({
      flags: { config: example },
      env: {},
      homeDir: home,
      cwd: home,
    });
    expect(config.targets.map((t) => t.name)).toEqual(["disk", "r2"]);
    expect(config.sources[0]).toMatchObject({ type: "github" });
  });
});
