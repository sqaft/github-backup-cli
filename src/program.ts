import { Command, CommanderError, Option } from "commander";
import { type BackupOptions, runBackup } from "./commands/backup.js";
import type { CommandDeps, CommonOptions } from "./commands/context.js";
import { type DoctorOptions, runDoctor } from "./commands/doctor.js";
import { runRepos } from "./commands/repos.js";
import { runSetup } from "./commands/setup.js";
import { runSnapshots, type SnapshotsOptions } from "./commands/snapshots.js";
import { plain, selectPaint } from "./util/color.js";
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

function addOutputOptions(command: Command): Command {
  return command
    .option("-c, --config <path>", "config file (default: ~/.config/github-backup-cli/config.json)")
    .option("--json", "machine-readable output on stdout")
    .addOption(new Option("-v, --verbose", "log git commands and details").conflicts("quiet"))
    .addOption(new Option("-q, --quiet", "log only errors and the summary").conflicts("verbose"));
}

function addRepoFilters(command: Command): Command {
  return command
    .option(
      "-i, --include <glob>",
      "only repositories matching this owner/repo glob (repeatable; default */*)",
      collect,
    )
    .option(
      "-e, --exclude <glob>",
      "skip repositories matching this owner/repo glob (repeatable)",
      collect,
    )
    .option("--no-archived", "skip archived repositories")
    .option("--no-forks", "skip forks");
}

function addTargetOption(command: Command): Command {
  return command.option(
    "-t, --target <name>",
    "use only the configured target with this name (repeatable)",
    collect,
  );
}

function addTemporaryTarget(command: Command): Command {
  return command.option(
    "--to <path>",
    'add a temporary local target named "local" at this directory',
  );
}

/** Commands are listed without `[options]`, which every command has. */
function commandTerm(command: Command): string {
  const args = command.registeredArguments.map((arg) =>
    arg.required ? `<${arg.name()}>` : `[${arg.name()}]`,
  );
  return [command.name(), ...args].join(" ");
}

function examples(lines: readonly string[]): string {
  return `\nExamples:\n${lines.map((line) => `  ${line}`).join("\n")}\n`;
}

const PROGRAM_HELP = `
Examples:
  github-backup setup                         choose where backups go
  github-backup backup                        back up to the configured targets
  github-backup backup --to ~/backups         back up to a directory, no config needed
  github-backup snapshots acme/app            see what is stored for a repository

Exit codes:
  0    success
  1    some repositories, wikis, targets or owners failed
  2    configuration, flag or prerequisite error
  3    another backup is running
  130  interrupted

Run github-backup <command> --help for the options of a command.
`;

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
  const paint = deps.paint ?? plain;
  const printError = (message: string) => deps.stderr(`${paint("red", "error:")} ${message}`);

  const program = new Command("github-backup")
    .description("Back up GitHub repositories to local disk and S3-compatible storage")
    .version(readToolInfo().version)
    .usage("<command> [options]")
    .exitOverride()
    .addHelpText("after", PROGRAM_HELP)
    .configureHelp({ subcommandTerm: commandTerm })
    .configureOutput({
      writeOut: (text) => deps.stdout(text),
      writeErr: (text) => deps.stderr(text.trimEnd()),
    });

  program.commandsGroup("Set up:");

  const setup = program.command("setup").description("create the config file or add a target");
  addTargetOption(setup)
    .option("-c, --config <path>", "config file (default: ~/.config/github-backup-cli/config.json)")
    .addHelpText("after", examples(["github-backup setup", "github-backup setup --target offsite"]))
    .action(async (_opts, command: Command) => {
      exitCode = await runSetup(explicitOptions<CommonOptions>(command), deps);
    });

  const doctor = program
    .command("doctor")
    .description("check tools, GitHub sign-in and target access");
  addTemporaryTarget(addTargetOption(addOutputOptions(doctor)))
    .option("--no-lfs", "skip the git-lfs check")
    .addHelpText("after", examples(["github-backup doctor", "github-backup doctor --target r2"]))
    .action(async (_opts, command: Command) => {
      exitCode = await runDoctor(explicitOptions<DoctorOptions>(command), deps);
    });

  program.commandsGroup("Back up:");

  addOutputOptions(
    addRepoFilters(
      program.command("repos").description("list the repositories that would be backed up"),
    ),
  )
    .addHelpText(
      "after",
      examples(["github-backup repos --include 'acme/*'", "github-backup repos --no-forks --json"]),
    )
    .action(async (_opts, command: Command) => {
      exitCode = await runRepos(explicitOptions<CommonOptions>(command), deps);
    });

  const backup = program.command("backup").description("back up repositories to the targets");
  addTemporaryTarget(addTargetOption(addOutputOptions(addRepoFilters(backup))))
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
    .addHelpText(
      "after",
      examples([
        "github-backup backup",
        "github-backup backup --to ~/backups",
        "github-backup backup --include 'acme/*' --exclude 'acme/legacy-*'",
        "github-backup backup --target r2 --quiet",
      ]),
    )
    .action(async (_opts, command: Command) => {
      exitCode = await runBackup(explicitOptions<BackupOptions>(command), deps);
    });

  program.commandsGroup("Inspect:");

  const snapshots = program
    .command("snapshots")
    .argument("<repo>", "owner/repo, or owner/repo.wiki for a wiki")
    .description("list a repository's snapshots on each target");
  addTemporaryTarget(addTargetOption(addOutputOptions(snapshots)))
    .addHelpText(
      "after",
      examples([
        "github-backup snapshots acme/app",
        "github-backup snapshots acme/app.wiki --target r2 --json",
        "github-backup snapshots acme/app --to ~/backups",
      ]),
    )
    .action(async (repo: string, _opts, command: Command) => {
      exitCode = await runSnapshots(repo, explicitOptions<SnapshotsOptions>(command), deps);
    });

  program.commandsGroup("Help:").helpCommand("help [command]", "display help for command");

  return {
    async run(argv) {
      exitCode = ExitCode.Success;
      if (argv.length === 0) {
        program.outputHelp({ error: true });
        return ExitCode.Usage;
      }
      try {
        await program.parseAsync(argv, { from: "user" });
        return exitCode;
      } catch (err) {
        if (err instanceof CommanderError) {
          const informational = ["commander.help", "commander.helpDisplayed", "commander.version"];
          return informational.includes(err.code) ? ExitCode.Success : ExitCode.Usage;
        }
        if (err instanceof CliError) {
          printError(err.message);
          return err.exitCode;
        }
        printError(err instanceof Error ? err.message : String(err));
        return ExitCode.PartialFailure;
      }
    },
  };
}

export function defaultDeps(): CommandDeps {
  const stderrIsTerminal = process.stderr.isTTY === true;
  const paint = selectPaint(stderrIsTerminal, process.env);
  return {
    exec,
    env: process.env,
    stdout: (text) => process.stdout.write(text),
    stderr: (line) => process.stderr.write(`${line}\n`),
    paint,
    createPrompter: process.stdin.isTTY && stderrIsTerminal ? createTerminalPrompter : undefined,
    // A dumb terminal cannot move the cursor, so the block could not be redrawn.
    createProgress:
      stderrIsTerminal && process.env.TERM !== "dumb"
        ? () => createStderrProgress(paint)
        : undefined,
  };
}
