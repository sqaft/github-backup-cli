import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandDeps, CommonOptions } from "../../src/commands/context.js";
import { runSetup } from "../../src/commands/setup.js";
import { createProgram } from "../../src/program.js";
import type { Target } from "../../src/targets/types.js";
import { CliError, ConfigError, ExitCode } from "../../src/util/errors.js";
import type { Prompter } from "../../src/util/prompt.js";

let home: string;
let configFile: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "ghb-setup-"));
  configFile = path.join(home, ".config", "github-backup-cli", "config.json");
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/** Answers questions in order and records them; running out of answers cancels. */
function fakePrompter(scripted: string[]) {
  const answers = [...scripted];
  const said: string[] = [];
  const asked: Array<{ question: string; hidden: boolean }> = [];
  let closed = false;
  const prompter: Prompter = {
    say: (line) => said.push(line),
    ask: async (question, options) => {
      asked.push({ question, hidden: options?.hidden === true });
      const answer = answers.shift();
      if (answer === undefined) throw new CliError("cancelled", ExitCode.Interrupted);
      return answer;
    },
    close: () => {
      closed = true;
    },
  };
  return { prompter, said, asked, isClosed: () => closed };
}

function setup(answers: string[] | undefined, options: { checkAccess?: () => Promise<void> } = {}) {
  const err: string[] = [];
  const fake = answers === undefined ? undefined : fakePrompter(answers);
  const created: unknown[] = [];
  const deps: CommandDeps = {
    exec: async () => ({ stdout: "", stderr: "" }),
    env: {},
    stdout: () => {},
    stderr: (line) => err.push(line),
    homeDir: home,
    cwd: home,
    createSource: () => ({
      id: "github",
      checkPrerequisites: async () => {},
      listRepos: async () => ({ repos: [], failures: [] }),
      gitEnv: () => ({}),
    }),
    createTarget: (config) => {
      created.push(config);
      return { name: config.name, checkAccess: options.checkAccess } as Target;
    },
    createPrompter: fake && (() => fake.prompter),
  };
  return {
    run: (argv: string[]) => createProgram(deps).run(argv),
    runSetup: (flags: CommonOptions = {}) => runSetup(flags, deps),
    err,
    fake,
    created,
  };
}

const readConfig = () => JSON.parse(readFileSync(configFile, "utf8")) as { targets: unknown[] };

const S3 = "1";
const LOCAL = "2";
const R2 = "1";
const AWS = "2";
const B2 = "3";
const OTHER = "4";
const USE_DEFAULT = "";
const NO_MORE_TARGETS = "n";

const R2_ANSWERS = [
  S3,
  USE_DEFAULT, // target name
  R2,
  "abc123",
  "my-bucket",
  USE_DEFAULT, // prefix
  "KEY",
  "SECRET",
  NO_MORE_TARGETS,
];

describe("backup without a config file at a terminal", () => {
  it("asks, saves the config with private permissions and runs the backup", async () => {
    const { run, err, fake, created } = setup(R2_ANSWERS);
    expect(await run(["backup"])).toBe(0);

    expect(readConfig()).toEqual({
      targets: [
        {
          type: "s3",
          name: "s3",
          bucket: "my-bucket",
          prefix: "git",
          forcePathStyle: false,
          endpoint: "https://abc123.r2.cloudflarestorage.com",
          region: "auto",
          accessKeyId: "KEY",
          secretAccessKey: "SECRET",
        },
      ],
    });
    expect(statSync(configFile).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(configFile)).mode & 0o777).toBe(0o700);
    expect(fake?.isClosed()).toBe(true);
    expect(err.join("\n")).toContain("Backup finished");
    expect(err.join("\n")).not.toContain("chmod 600");
    expect(created.length).toBe(2); // access check during setup, then the backup itself
  });

  it("hides only the secret access key", async () => {
    const { run, fake } = setup(R2_ANSWERS);
    await run(["backup"]);
    const hidden = fake?.asked.filter((q) => q.hidden).map((q) => q.question);
    expect(hidden).toEqual(["Secret access key: "]);
  });

  it("offers --target as the name so the same command continues", async () => {
    const { run, fake } = setup(R2_ANSWERS);
    expect(await run(["backup", "--target", "r2"])).toBe(0);
    expect(readConfig().targets[0]).toMatchObject({ name: "r2" });
    expect(fake?.asked[1]?.question).toBe("Target name [r2]: ");
  });

  it("creates the file named by --config", async () => {
    const custom = path.join(home, "nested", "custom.json");
    const { run } = setup(R2_ANSWERS);
    expect(await run(["backup", "--config", custom])).toBe(0);
    expect(statSync(custom).isFile()).toBe(true);
  });

  it.each([
    [
      "AWS S3",
      [AWS, "eu-central-1"],
      { region: "eu-central-1", forcePathStyle: false, endpoint: undefined },
    ],
    [
      "Backblaze B2",
      [B2, "us-west-004"],
      { region: "us-west-004", endpoint: "https://s3.us-west-004.backblazeb2.com" },
    ],
    [
      "another service",
      [OTHER, "http://minio:9000", USE_DEFAULT, USE_DEFAULT],
      { region: "us-east-1", endpoint: "http://minio:9000", forcePathStyle: true },
    ],
  ])("derives the connection settings for %s", async (_label, provider, expected) => {
    const { run } = setup([
      S3,
      USE_DEFAULT,
      ...provider,
      "b",
      USE_DEFAULT,
      "K",
      "S",
      NO_MORE_TARGETS,
    ]);
    expect(await run(["backup"])).toBe(0);
    const [target] = readConfig().targets;
    expect(target).toMatchObject(
      Object.fromEntries(Object.entries(expected).filter(([, value]) => value !== undefined)),
    );
    if (expected.endpoint === undefined) expect(target).not.toHaveProperty("endpoint");
  });

  it("repeats a question until the answer is usable", async () => {
    const { run, fake } = setup([
      S3,
      USE_DEFAULT,
      R2,
      "https://abc.r2.cloudflarestorage.com",
      "abc123",
      USE_DEFAULT, // the bucket has no default
      "b",
      USE_DEFAULT,
      "K",
      "S",
      NO_MORE_TARGETS,
    ]);
    expect(await run(["backup"])).toBe(0);
    expect(fake?.said).toContain("  Enter only letters, digits and hyphens.");
    expect(fake?.said).toContain("  A value is required.");
    expect(readConfig().targets[0]).toMatchObject({ endpoint: expect.stringContaining("abc123") });
  });

  it("rejects an endpoint that carries a path", async () => {
    const { run, fake } = setup([
      S3,
      USE_DEFAULT,
      OTHER,
      "https://s3.example.com/my-bucket",
      "https://s3.example.com",
      USE_DEFAULT,
      "n",
      "b",
      USE_DEFAULT,
      "K",
      "S",
      NO_MORE_TARGETS,
    ]);
    expect(await run(["backup"])).toBe(0);
    expect(fake?.said).toContain("  Enter the URL without a bucket or other path.");
  });

  it("saves several targets and refuses a repeated name", async () => {
    const { run, fake } = setup([
      LOCAL,
      "main",
      "~/backups",
      "y",
      LOCAL,
      "main",
      "second",
      "/mnt/backups",
      NO_MORE_TARGETS,
    ]);
    expect(await run(["backup"])).toBe(0);
    expect(readConfig().targets).toEqual([
      { type: "local", name: "main", path: "~/backups" },
      { type: "local", name: "second", path: "/mnt/backups" },
    ]);
    expect(fake?.said).toContain('  "main" is already used.');
  });

  it("asks again when the storage rejects the settings, and saves what works", async () => {
    let attempts = 0;
    const { run, fake } = setup(
      [
        S3,
        USE_DEFAULT,
        R2,
        "abc123",
        "wrong-bucket",
        USE_DEFAULT,
        "K",
        "S",
        "y",
        R2,
        "abc123",
        "right-bucket",
        USE_DEFAULT,
        "K",
        "S",
        NO_MORE_TARGETS,
      ],
      {
        checkAccess: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error('cannot access bucket "wrong-bucket"');
        },
      },
    );
    expect(await run(["backup"])).toBe(0);
    expect(fake?.said.join("\n")).toContain('cannot access bucket "wrong-bucket"');
    expect(readConfig().targets[0]).toMatchObject({ bucket: "right-bucket" });
  });

  it("writes nothing when the person gives up on a failing target", async () => {
    const { run, err } = setup([...R2_ANSWERS.slice(0, -1), "n"], {
      checkAccess: async () => {
        throw new Error("denied");
      },
    });
    expect(await run(["backup"])).toBe(ExitCode.Interrupted);
    expect(err.join("\n")).toContain("setup cancelled");
    expect(() => statSync(configFile)).toThrow();
  });

  it("writes nothing when the person cancels and closes the prompter", async () => {
    const { run, fake } = setup([S3, USE_DEFAULT]);
    expect(await run(["backup"])).toBe(ExitCode.Interrupted);
    expect(fake?.isClosed()).toBe(true);
    expect(() => statSync(configFile)).toThrow();
  });
});

describe("cases that must not ask", () => {
  it("leaves --to without a config file alone", async () => {
    const { run, fake } = setup([]);
    expect(await run(["backup", "--to", path.join(home, "out")])).toBe(0);
    expect(fake?.asked).toEqual([]);
    expect(() => statSync(configFile)).toThrow();
  });

  it("leaves repos alone", async () => {
    const { run, fake } = setup([]);
    expect(await run(["repos"])).toBe(0);
    expect(fake?.asked).toEqual([]);
  });

  it("leaves an existing config file alone, even without targets", async () => {
    mkdirSync(path.dirname(configFile), { recursive: true });
    writeFileSync(configFile, "{}\n");
    const { run, err, fake } = setup([]);
    expect(await run(["backup"])).toBe(2);
    expect(fake?.asked).toEqual([]);
    expect(err.join("\n")).toContain("no targets configured");
    expect(err.join("\n")).not.toContain("no config file at");
  });
});

describe("without a terminal", () => {
  it("exits 2 and names the missing config file", async () => {
    const { run, err } = setup(undefined);
    expect(await run(["backup"])).toBe(2);
    expect(err.join("\n")).toContain(`no config file at ${configFile}`);
  });

  it("explains an unknown --target the same way", async () => {
    const { run, err } = setup(undefined);
    expect(await run(["backup", "--target", "r2"])).toBe(2);
    const text = err.join("\n");
    expect(text).toContain('unknown target "r2" (available: none configured)');
    expect(text).toContain(`no config file at ${configFile}`);
  });
});

describe("setup", () => {
  const LOCAL_ANSWERS = (name: string, dir: string) => [LOCAL, name, dir, NO_MORE_TARGETS];

  const writeExisting = (config: unknown, file = configFile) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o644 });
  };
  const readText = () => readFileSync(configFile, "utf8");
  const existingDisk = { type: "local", name: "disk", path: "/mnt/old" };

  it("creates a missing file, checks the target and points to doctor", async () => {
    const { runSetup, fake } = setup(R2_ANSWERS);
    expect(await runSetup()).toBe(ExitCode.Success);
    expect(readConfig().targets).toHaveLength(1);
    expect(statSync(configFile).mode & 0o777).toBe(0o600);
    expect(fake?.said).toEqual(
      expect.arrayContaining([
        `No config file at ${configFile}.`,
        'Checking "s3"...',
        'Target "s3" works.',
        `Saved ${configFile}.`,
        "Next: run github-backup doctor, then github-backup backup.",
      ]),
    );
    expect(fake?.isClosed()).toBe(true);
  });

  it("does not point to doctor when backup creates the file and continues", async () => {
    const { run, fake } = setup(R2_ANSWERS);
    await run(["backup"]);
    expect(fake?.said.some((line) => line.startsWith(`Saved ${configFile}. Other settings`))).toBe(
      true,
    );
    expect(fake?.said.join("\n")).not.toContain("Next:");
  });

  it("adds targets to an existing file and keeps every other field and the key order", async () => {
    writeExisting({
      concurrency: 2,
      targets: [existingDisk],
      wiki: false,
      sources: [{ type: "github", include: ["me/*"] }],
    });
    const { runSetup, fake } = setup(LOCAL_ANSWERS("backup2", "/mnt/new"));
    expect(await runSetup()).toBe(ExitCode.Success);

    const written = JSON.parse(readText());
    expect(Object.keys(written)).toEqual(["concurrency", "targets", "wiki", "sources"]);
    expect(written).toEqual({
      concurrency: 2,
      targets: [existingDisk, { type: "local", name: "backup2", path: "/mnt/new" }],
      wiki: false,
      sources: [{ type: "github", include: ["me/*"] }],
    });
    expect(readText().endsWith("}\n")).toBe(true);
    expect(readText()).toBe(`${JSON.stringify(written, null, 2)}\n`);
    expect(statSync(configFile).mode & 0o777).toBe(0o600);
    expect(readdirSync(path.dirname(configFile))).toEqual(["config.json"]);
    expect(fake?.said).toEqual(
      expect.arrayContaining([
        `Adding targets to ${configFile}.`,
        'Checking "backup2"...',
        'Target "backup2" works.',
        `Saved ${configFile}.`,
        "Next: run github-backup doctor, then github-backup backup.",
      ]),
    );
  });

  it("appends a targets list when the file has none", async () => {
    writeExisting({ keep: 3 });
    const { runSetup } = setup(LOCAL_ANSWERS("disk", "/mnt/new"));
    await runSetup();
    const written = JSON.parse(readText());
    expect(Object.keys(written)).toEqual(["keep", "targets"]);
  });

  it("replaces a symlinked config file through the link", async () => {
    const real = path.join(home, "dotfiles", "config.json");
    writeExisting({ targets: [existingDisk], keep: 5 }, real);
    mkdirSync(path.dirname(configFile), { recursive: true });
    symlinkSync(real, configFile);

    const { runSetup } = setup(LOCAL_ANSWERS("second", "/mnt/new"));
    await runSetup();

    expect(lstatSync(configFile).isSymbolicLink()).toBe(true);
    const written = JSON.parse(readFileSync(real, "utf8"));
    expect(written.keep).toBe(5);
    expect(written.targets.map((t: { name: string }) => t.name)).toEqual(["disk", "second"]);
    expect(readdirSync(path.dirname(real))).toEqual(["config.json"]);
  });

  it("refuses names that are already in the file", async () => {
    writeExisting({ targets: [existingDisk] });
    const { runSetup, fake } = setup([LOCAL, "disk", "disk-b", "/mnt/new", NO_MORE_TARGETS]);
    await runSetup();
    expect(fake?.said).toContain('  "disk" is already used.');
    expect(readConfig().targets).toHaveLength(2);
    expect(readConfig().targets[1]).toMatchObject({ name: "disk-b" });
  });

  it("does not offer a default name that is already taken", async () => {
    writeExisting({
      targets: [
        existingDisk,
        { type: "local", name: "disk-2", path: "/mnt/b" },
        { type: "s3", name: "s3", bucket: "b" },
      ],
    });
    const { runSetup, fake } = setup([
      LOCAL,
      USE_DEFAULT,
      "/mnt/c",
      "y",
      S3,
      USE_DEFAULT,
      R2,
      "abc",
      "bkt",
      USE_DEFAULT,
      "K",
      "S",
      NO_MORE_TARGETS,
    ]);
    await runSetup();
    const questions = fake?.asked.map((q) => q.question) ?? [];
    expect(questions).toContain("Target name [disk-3]: ");
    expect(questions).toContain("Target name [s3-2]: ");
    expect(readConfig().targets.map((t) => (t as { name: string }).name)).toEqual([
      "disk",
      "disk-2",
      "s3",
      "disk-3",
      "s3-2",
    ]);
  });

  it("does not offer a --target name that the file already uses", async () => {
    writeExisting({ targets: [existingDisk] });
    const { runSetup, fake } = setup(LOCAL_ANSWERS("x", "/mnt/new"));
    await runSetup({ target: ["disk"] });
    expect(fake?.asked[1]?.question).toBe("Target name [disk-2]: ");
  });

  it("rejects an invalid existing file without asking or changing it", async () => {
    writeExisting({ targets: [existingDisk], nope: true });
    const before = readText();
    const { runSetup, fake } = setup([]);
    const error = await runSetup().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toContain(`invalid configuration (${configFile})`);
    expect((error as Error).message).toContain('"nope"');
    expect(fake?.asked).toEqual([]);
    expect(readText()).toBe(before);
  });

  it("rejects a file that is not valid JSON", async () => {
    mkdirSync(path.dirname(configFile), { recursive: true });
    writeFileSync(configFile, "{ nope");
    const { runSetup } = setup([]);
    await expect(runSetup()).rejects.toThrow(/invalid JSON/);
  });

  it("needs a terminal", async () => {
    const { runSetup } = setup(undefined);
    const error = await runSetup().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toBe(
      `setup needs a terminal; edit ${configFile} by hand (see config.example.json)`,
    );
    expect((error as ConfigError).exitCode).toBe(2);
  });

  it("saves nothing when the person cancels", async () => {
    writeExisting({ targets: [existingDisk] });
    const before = readText();
    const { runSetup, fake } = setup([LOCAL, "second"]);
    await expect(runSetup()).rejects.toMatchObject({ exitCode: ExitCode.Interrupted });
    expect(readText()).toBe(before);
    expect(fake?.isClosed()).toBe(true);
  });

  it("merges into what the file holds when it is written, not what it held at the start", async () => {
    writeExisting({ targets: [existingDisk] });
    const { runSetup } = setup(LOCAL_ANSWERS("second", "/mnt/new"), {
      checkAccess: async () => {
        writeExisting({ targets: [existingDisk], keep: 9 });
      },
    });
    await runSetup();
    const written = JSON.parse(readText());
    expect(written.keep).toBe(9);
    expect(written.targets).toHaveLength(2);
  });

  it("fails and saves nothing when the merged file would be invalid", async () => {
    writeExisting({ targets: [existingDisk] });
    const { runSetup } = setup(LOCAL_ANSWERS("second", "/mnt/new"), {
      checkAccess: async () => {
        writeExisting({ targets: [existingDisk, { type: "local", name: "second", path: "/x" }] });
      },
    });
    const error = await runSetup().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toContain('duplicate target name "second"');
    expect(JSON.parse(readText()).targets).toHaveLength(2);
    expect(readdirSync(path.dirname(configFile))).toEqual(["config.json"]);
  });

  it.skipIf(process.getuid?.() === 0)(
    "leaves the file untouched when the directory is read-only",
    async () => {
      writeExisting({ targets: [existingDisk] });
      const before = readText();
      chmodSync(path.dirname(configFile), 0o500);
      try {
        const { runSetup } = setup(LOCAL_ANSWERS("second", "/mnt/new"));
        await expect(runSetup()).rejects.toThrow();
      } finally {
        chmodSync(path.dirname(configFile), 0o700);
      }
      expect(readText()).toBe(before);
    },
  );
});
