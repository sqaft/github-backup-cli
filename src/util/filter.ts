export interface FilterableRepo {
  fullName: string;
  isArchived: boolean;
  isFork: boolean;
}

export interface RepoFilter {
  include: string[];
  exclude: string[];
  archived: boolean;
  forks: boolean;
}

/**
 * Compiles an `owner/repo` glob to a case-insensitive regex.
 * `*` and `?` stay within one path segment; `**` crosses `/`.
 */
export function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob.charAt(i);
    if (ch === "*") {
      if (glob.charAt(i + 1) === "*") {
        source += ".*";
        i++;
      } else {
        source += "[^/]*";
      }
    } else if (ch === "?") {
      source += "[^/]";
    } else {
      source += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`, "i");
}

export function matchesAny(fullName: string, globs: string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(fullName));
}

/** Applies archived/fork flags, then include globs (empty = all), then exclude globs. */
export function filterRepos<T extends FilterableRepo>(repos: T[], filter: RepoFilter): T[] {
  return repos.filter((repo) => {
    if (!filter.archived && repo.isArchived) return false;
    if (!filter.forks && repo.isFork) return false;
    if (filter.include.length > 0 && !matchesAny(repo.fullName, filter.include)) return false;
    return !matchesAny(repo.fullName, filter.exclude);
  });
}
