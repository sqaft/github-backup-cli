import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandDeps } from "../../src/commands/context.js";
import { createProgram } from "../../src/program.js";
import type { Target } from "../../src/targets/types.js";
import { CliError, ExitCode } from "../../src/util/errors.js";
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
  return { run: (argv: string[]) => createProgram(deps).run(argv), err, fake, created };
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
  it("leaves --local without a config file alone", async () => {
    const { run, fake } = setup([]);
    expect(await run(["backup", "--local", path.join(home, "out")])).toBe(0);
    expect(fake?.asked).toEqual([]);
    expect(() => statSync(configFile)).toThrow();
  });

  it("leaves list alone", async () => {
    const { run, fake } = setup([]);
    expect(await run(["list"])).toBe(0);
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
