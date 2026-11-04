import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  formatZodError,
  type Overrides,
  readRawConfig,
  resolveConfigPath,
  resolveOverrides,
} from "../config/load.js";
import { configSchema, type TargetConfig, targetSchema } from "../config/schema.js";
import { createTarget, TARGET_SETUPS } from "../targets/index.js";
import type { TargetSetup } from "../targets/types.js";
import { CliError, ConfigError, ExitCode } from "../util/errors.js";
import { askChoice, askText, askYesNo, type Prompter } from "../util/prompt.js";
import type { CommandDeps, CommonOptions } from "./context.js";

/** Not used by the access check, which only needs a valid target. */
const CHECK_KEEP = 1;

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** `base`, or `base-2`, `base-3`, ... when the name is taken. */
function freeName(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
  }
}

/** Asks for one target until it validates and its storage answers. */
async function promptTarget(
  prompter: Prompter,
  setup: TargetSetup,
  name: string,
  deps: CommandDeps,
): Promise<TargetConfig> {
  const create = deps.createTarget ?? createTarget;
  for (;;) {
    const parsed = targetSchema.safeParse(await setup.prompt(prompter, name));
    let problem: string;
    if (parsed.success) {
      prompter.say(`Checking "${name}"...`);
      try {
        await create(parsed.data, { keep: CHECK_KEEP }).checkAccess?.();
        prompter.say(`Target "${name}" works.`);
        return parsed.data;
      } catch (err) {
        problem = describeError(err);
      }
    } else {
      problem = formatZodError(parsed.error);
    }
    prompter.say(`Target "${name}" does not work: ${problem}`);
    if (!(await askYesNo(prompter, "Enter its settings again?", true))) {
      throw new CliError("setup cancelled; nothing was saved", ExitCode.Interrupted);
    }
  }
}

/**
 * Asks for targets until the person has no more. `existingNames` are refused as names and
 * never offered as defaults; `--target` names are offered first, in order.
 */
async function askTargets(
  prompter: Prompter,
  deps: CommandDeps,
  existingNames: readonly string[],
  overrides: Overrides,
): Promise<TargetConfig[]> {
  const added: TargetConfig[] = [];
  const taken = () => [...existingNames, ...added.map((t) => t.name)];
  do {
    const setup = await askChoice(
      prompter,
      "Where should backups go",
      TARGET_SETUPS.map((value) => ({ label: value.label, value })),
    );
    const preferred = overrides.target?.[added.length];
    const name = await askText(prompter, "Target name", {
      defaultValue: freeName(
        preferred !== undefined && !taken().includes(preferred) ? preferred : setup.defaultName,
        taken(),
      ),
      validate: (value) => (taken().includes(value) ? `"${value}" is already used.` : undefined),
    });
    added.push(await promptTarget(prompter, setup, name, deps));
  } while (await askYesNo(prompter, "Add another target?", false));
  return added;
}

/** Creates the file. `wx` refuses to replace a file that appeared while the questions were open. */
function writeNewConfig(file: string, targets: TargetConfig[]): void {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify({ targets }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
}

/**
 * Appends targets to an existing file, keeping every other field and the key order. The file is
 * read again here because it may have changed while the questions were open. It is replaced
 * atomically, through the symlink target when the file is a link.
 */
function appendTargets(file: string, added: TargetConfig[]): void {
  const raw = readRawConfig(file);
  if (raw.targets !== undefined && !Array.isArray(raw.targets)) {
    throw new ConfigError(`${file}: "targets" must be an array; nothing was saved`);
  }
  const merged = { ...raw, targets: [...(raw.targets ?? []), ...added] };
  const check = configSchema.safeParse(merged);
  if (!check.success) {
    throw new ConfigError(
      `${file} would become invalid; nothing was saved:\n${formatZodError(check.error)}`,
    );
  }

  const real = realpathSync(file);
  const temp = path.join(
    path.dirname(real),
    `.${path.basename(real)}.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    writeFileSync(temp, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    renameSync(temp, real);
  } catch (err) {
    rmSync(temp, { force: true });
    throw err;
  }
}

function configInput(options: CommonOptions, deps: CommandDeps) {
  const input = { flags: options, env: deps.env, homeDir: deps.homeDir, cwd: deps.cwd };
  const overrides = resolveOverrides(input);
  return { overrides, file: resolveConfigPath(input, overrides) };
}

/**
 * Creates the config file by asking at the terminal when it is missing and `backup` has no
 * target. Without a prompter (cron, launchd, pipes) nothing is asked.
 */
export async function setupMissingConfig(options: CommonOptions, deps: CommandDeps): Promise<void> {
  if (deps.createPrompter === undefined || options.to !== undefined) return;

  const { overrides, file } = configInput(options, deps);
  if (existsSync(file)) return;

  const prompter = deps.createPrompter();
  try {
    prompter.say(`No config file at ${file}.`);
    prompter.say("Answer a few questions to create it (Ctrl-C to cancel).");
    writeNewConfig(file, await askTargets(prompter, deps, [], overrides));
    prompter.say(`Saved ${file}. Other settings use their defaults; see the README.`);
  } finally {
    prompter.close();
  }
}

/**
 * `github-backup setup`: creates the config file, or adds targets to the existing one. Needs a
 * terminal.
 */
export async function runSetup(options: CommonOptions, deps: CommandDeps): Promise<number> {
  const { overrides, file } = configInput(options, deps);
  if (deps.createPrompter === undefined) {
    throw new ConfigError(`setup needs a terminal; edit ${file} by hand (see config.example.json)`);
  }

  let existingNames: string[] | undefined;
  if (existsSync(file)) {
    const parsed = configSchema.safeParse(readRawConfig(file));
    if (!parsed.success) {
      throw new ConfigError(`invalid configuration (${file}):\n${formatZodError(parsed.error)}`);
    }
    existingNames = parsed.data.targets.map((t) => t.name);
  }

  const prompter = deps.createPrompter();
  try {
    if (existingNames === undefined) {
      prompter.say(`No config file at ${file}.`);
      prompter.say("Answer a few questions to create it (Ctrl-C to cancel).");
    } else {
      prompter.say(`Adding targets to ${file}.`);
      prompter.say("Answer a few questions (Ctrl-C to cancel).");
    }
    const added = await askTargets(prompter, deps, existingNames ?? [], overrides);
    if (existingNames === undefined) writeNewConfig(file, added);
    else appendTargets(file, added);
    prompter.say(`Saved ${file}.`);
    prompter.say("Next: run github-backup doctor, then github-backup backup.");
  } finally {
    prompter.close();
  }
  return ExitCode.Success;
}
