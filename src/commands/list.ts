import { discoverRepos } from "../core/discover.js";
import type { RepoInfo } from "../sources/types.js";
import { ExitCode } from "../util/errors.js";
import { type CommandDeps, type CommonOptions, prepare } from "./context.js";

const HEADERS = ["REPO", "ARCHIVED", "FORK", "WIKI", "EMPTY"] as const;

const yesNo = (value: boolean) => (value ? "yes" : "-");

/** Renders repositories as an aligned table followed by a total line. */
export function renderTable(repos: RepoInfo[]): string {
  const rows = repos.map((r) => [
    r.fullName,
    yesNo(r.isArchived),
    yesNo(r.isFork),
    yesNo(r.hasWiki),
    yesNo(r.isEmpty),
  ]);
  const widths = HEADERS.map((header, col) =>
    Math.max(header.length, ...rows.map((row) => (row[col] as string).length)),
  );
  const format = (cells: readonly string[]) =>
    cells
      .map((cell, col) => cell.padEnd(widths[col] as number))
      .join("  ")
      .trimEnd();
  const total = `${repos.length} ${repos.length === 1 ? "repository" : "repositories"}`;
  return [format(HEADERS), ...rows.map(format), "", total].join("\n");
}

export function renderJson(repos: RepoInfo[]): string {
  return JSON.stringify(repos, null, 2);
}

/** `github-backup list`. Returns the process exit code. */
export async function runList(options: CommonOptions, deps: CommandDeps): Promise<number> {
  const { loaded, log } = prepare(options, deps);
  const { repos, failures } = await discoverRepos(loaded.config.sources, {
    exec: deps.exec,
    log,
    createSource: deps.createSource,
  });
  deps.stdout(`${options.json ? renderJson(repos) : renderTable(repos)}\n`);
  return failures.length > 0 ? ExitCode.PartialFailure : ExitCode.Success;
}
