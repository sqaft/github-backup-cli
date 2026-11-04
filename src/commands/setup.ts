import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { formatZodError, resolveConfigPath, resolveOverrides } from "../config/load.js";
import { type TargetConfig, targetSchema } from "../config/schema.js";
import { createTarget, TARGET_SETUPS } from "../targets/index.js";
import type { TargetSetup } from "../targets/types.js";
import { CliError, ExitCode } from "../util/errors.js";
import { askChoice, askText, askYesNo, type Prompter } from "../util/prompt.js";
import type { CommandDeps, CommonOptions } from "./context.js";

/** Not used by the access check, which only needs a valid target. */
const CHECK_KEEP = 1;

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
      try {
        await create(parsed.data, { keep: CHECK_KEEP }).checkAccess?.();
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

function writeConfigFile(file: string, targets: TargetConfig[]): void {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  // `wx` refuses to replace a file that appeared while the questions were open.
  writeFileSync(file, `${JSON.stringify({ targets }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
}

/**
 * Creates the config file by asking at the terminal when it is missing and `backup` has no
 * target. Without a prompter (cron, launchd, pipes) nothing is asked.
 */
export async function setupMissingConfig(options: CommonOptions, deps: CommandDeps): Promise<void> {
  if (deps.createPrompter === undefined || options.local !== undefined) return;

  const input = { flags: options, env: deps.env, homeDir: deps.homeDir, cwd: deps.cwd };
  const overrides = resolveOverrides(input);
  const file = resolveConfigPath(input, overrides);
  if (existsSync(file)) return;

  const prompter = deps.createPrompter();
  try {
    prompter.say(`No config file at ${file}.`);
    prompter.say("Answer a few questions to create it (Ctrl-C to cancel).");
    const targets: TargetConfig[] = [];
    do {
      const setup = await askChoice(
        prompter,
        "Where should backups go",
        TARGET_SETUPS.map((value) => ({ label: value.label, value })),
      );
      const name = await askText(prompter, "Target name", {
        defaultValue: overrides.target?.[targets.length] ?? setup.defaultName,
        validate: (value) =>
          targets.some((t) => t.name === value) ? `"${value}" is already used.` : undefined,
      });
      targets.push(await promptTarget(prompter, setup, name, deps));
    } while (await askYesNo(prompter, "Add another target?", false));

    writeConfigFile(file, targets);
    prompter.say(`Saved ${file}. Other settings use their defaults; see the README.`);
  } finally {
    prompter.close();
  }
}
