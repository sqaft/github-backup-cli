export interface RepoInfo {
  /** Id of the source that produced the repo (`github`). First segment of the repo key. */
  source: string;
  owner: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  wikiUrl?: string;
  hasWiki: boolean;
  isArchived: boolean;
  isFork: boolean;
  isEmpty: boolean;
}

/** An owner (user or organization) whose repositories could not be listed. */
export interface ListFailure {
  owner: string;
  message: string;
}

export interface ListReposResult {
  repos: RepoInfo[];
  failures: ListFailure[];
}

/** A git service the backup reads repositories from. */
export interface Source {
  readonly id: string;
  /** Throws `PrerequisiteError` when a required tool or login is missing. */
  checkPrerequisites(): Promise<void>;
  listRepos(): Promise<ListReposResult>;
  /** Environment for git child processes so they authenticate against this source. */
  gitEnv(): Record<string, string>;
}
