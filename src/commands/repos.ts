import { type DiscoveryResult, discoverRepos } from "../core/discover.js";
import type { RepoInfo } from "../sources/types.js";
import { ExitCode } from "../util/errors.js";
import { formatTable } from "../util/table.js";
import { type CommandDeps, type CommonOptions, prepareWithProgress } from "./context.js";

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
  const total = `${repos.length} ${repos.length === 1 ? "repository" : "repositories"}`;
  return `${formatTable(HEADERS, rows)}\n\n${total}`;
}

export function renderJson(repos: RepoInfo[]): string {
  return JSON.stringify(repos, null, 2);
}

/** `github-backup repos`. Returns the process exit code. */
export async function runRepos(options: CommonOptions, deps: CommandDeps): Promise<number> {
  const { loaded, log, progress } = prepareWithProgress(options, deps);
  let discovery: DiscoveryResult;
  try {
    progress?.activity("Listing repositories");
    discovery = await discoverRepos(loaded.config.sources, {
      exec: deps.exec,
      log,
      createSource: deps.createSource,
    });
  } finally {
    progress?.stop();
  }
  const { repos, failures } = discovery;
  deps.stdout(`${options.json ? renderJson(repos) : renderTable(repos)}\n`);
  return failures.length > 0 ? ExitCode.PartialFailure : ExitCode.Success;
}
