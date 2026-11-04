import { Command, CommanderError, Option } from "commander";
import { type BackupOptions, runBackup } from "./commands/backup.js";
import type { CommandDeps, CommonOptions } from "./commands/context.js";
import { runList } from "./commands/list.js";
import { CliError, ExitCode } from "./util/errors.js";
import { exec } from "./util/exec.js";
import { createStderrProgress } from "./util/progress.js";
import { createTerminalPrompter } from "./util/prompt.js";
import { readToolInfo } from "./util/tool.js";

/** Flags whose negated form (`--no-x`) is the only one users can pass. */
const NEGATABLE = ["archived", "forks", "wiki", "lfs"] as const;

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function addCommonOptions(command: Command): Command {
  return command
    .option("--config <path>", "config file (default: ~/.config/github-backup-cli/config.json)")
    .option(
      "--include <glob>",
      "only repositories matching this owner/repo glob (repeatable; default */*)",
      collect,
    )
    .option(
      "--exclude <glob>",
      "skip repositories matching this owner/repo glob (repeatable)",
      collect,
    )
    .option("--no-archived", "skip archived repositories")
    .option("--no-forks", "skip forks")
    .option("--json", "machine-readable output on stdout")
    .addOption(new Option("--verbose", "log git commands and details").conflicts("quiet"))
    .addOption(new Option("--quiet", "log only errors and the summary").conflicts("verbose"));
}

/**
 * Commander gives negatable options a default of `true`. Keep only values the user
 * actually typed so they can override env and file settings, and nothing else can.
 */
function explicitOptions<T extends CommonOptions>(command: Command): T {
  const options: Record<string, unknown> = { ...command.opts() };
  for (const key of NEGATABLE) {
    if (command.getOptionValueSource(key) !== "cli") delete options[key];
  }
  return options as T;
}

export interface Program {
  /** Parses `argv` (without node and script) and returns the exit code. */
  run(argv: string[]): Promise<number>;
}

export function createProgram(deps: CommandDeps): Program {
  let exitCode: number = ExitCode.Success;

  const program = new Command("github-backup")
    .description("Back up GitHub repositories to local disk and S3-compatible storage")
    .version(readToolInfo().version)
    .exitOverride()
    .configureOutput({
      writeOut: (text) => deps.stdout(text),
      writeErr: (text) => deps.stderr(text.trimEnd()),
    });

  addCommonOptions(
    program.command("list").description("list the repositories that would be backed up"),
  ).action(async (_opts, command: Command) => {
    exitCode = await runList(explicitOptions<CommonOptions>(command), deps);
  });

  addCommonOptions(program.command("backup").description("back up repositories to the targets"))
    .option(
      "--cache-dir <dir>",
      "directory for mirrors and temporary files (default: ~/.cache/github-backup-cli)",
    )
    .option("--concurrency <n>", "repositories processed in parallel (default 4)")
    .option(
      "--keep <n>",
      "snapshots to keep per repository and target (default 7; a target's own keep wins)",
    )
    .option("--no-wiki", "skip wikis")
    .option("--no-lfs", "skip Git LFS objects")
    .option(
      "--target <name>",
      "run only the configured target with this name (repeatable)",
      collect,
    )
    .option("--local <path>", 'add a temporary local target named "local" at this directory')
    .action(async (_opts, command: Command) => {
      exitCode = await runBackup(explicitOptions<BackupOptions>(command), deps);
    });

  return {
    async run(argv) {
      exitCode = ExitCode.Success;
      try {
        await program.parseAsync(argv, { from: "user" });
        return exitCode;
      } catch (err) {
        if (err instanceof CommanderError) {
          const informational = ["commander.help", "commander.helpDisplayed", "commander.version"];
          return informational.includes(err.code) ? ExitCode.Success : ExitCode.Usage;
        }
        if (err instanceof CliError) {
          deps.stderr(`error: ${err.message}`);
          return err.exitCode;
        }
        deps.stderr(`error: ${err instanceof Error ? err.message : String(err)}`);
        return ExitCode.PartialFailure;
      }
    },
  };
}

export function defaultDeps(): CommandDeps {
  return {
    exec,
    env: process.env,
    stdout: (text) => process.stdout.write(text),
    stderr: (line) => process.stderr.write(`${line}\n`),
    createPrompter:
      process.stdin.isTTY && process.stderr.isTTY ? createTerminalPrompter : undefined,
    // A dumb terminal cannot move the cursor, so the block could not be redrawn.
    createProgress:
      process.stderr.isTTY && process.env.TERM !== "dumb" ? createStderrProgress : undefined,
  };
}
