import type { SourceConfig } from "../config/schema.js";
import { createSource } from "../sources/index.js";
import type { ListFailure, RepoInfo, Source } from "../sources/types.js";
import type { Exec } from "../util/exec.js";
import { filterRepos } from "../util/filter.js";
import type { Logger } from "../util/log.js";

export interface DiscoverDeps {
  exec: Exec;
  log: Logger;
  /** Overridable in tests. */
  createSource?: (config: SourceConfig, deps: { exec: Exec }) => Source;
}

export interface DiscoveryResult {
  repos: RepoInfo[];
  failures: ListFailure[];
  /** Sources by id, kept so later steps can ask for `gitEnv()`. */
  sources: Map<string, Source>;
}

function repoKey(repo: RepoInfo): string {
  return `${repo.source}/${repo.fullName.toLowerCase()}`;
}

/** Lists and filters the repositories of every configured source. */
export async function discoverRepos(
  sourceConfigs: SourceConfig[],
  deps: DiscoverDeps,
): Promise<DiscoveryResult> {
  const make = deps.createSource ?? createSource;
  const sources = new Map<string, Source>();
  const failures: ListFailure[] = [];
  const byKey = new Map<string, RepoInfo>();

  for (const config of sourceConfigs) {
    const source = make(config, { exec: deps.exec });
    await source.checkPrerequisites();
    sources.set(source.id, source);

    const listed = await source.listRepos();
    for (const failure of listed.failures) {
      deps.log.warn(
        `could not list repositories of ${failure.owner}: ${failure.message}`,
        source.id,
      );
      failures.push(failure);
    }
    for (const repo of filterRepos(listed.repos, config)) {
      const key = repoKey(repo);
      if (!byKey.has(key)) byKey.set(key, repo);
    }
  }

  const repos = [...byKey.values()].sort((a, b) => repoKey(a).localeCompare(repoKey(b), "en"));
  return { repos, failures, sources };
}
