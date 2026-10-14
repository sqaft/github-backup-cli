import { z } from "zod";
import { PrerequisiteError } from "../util/errors.js";
import { type Exec, ExecError } from "../util/exec.js";
import type { ListFailure, ListReposResult, RepoInfo, Source } from "./types.js";

export const GITHUB_SOURCE_ID = "github";

const GH_ENV = { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" };

const REPO_FIELDS = "nameWithOwner,isArchived,isFork,hasWikiEnabled,isEmpty,url";

const ghRepoSchema = z.object({
  nameWithOwner: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  isArchived: z.boolean(),
  isFork: z.boolean(),
  hasWikiEnabled: z.boolean(),
  isEmpty: z.boolean(),
  url: z.url(),
});

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function parseRepoList(json: string): RepoInfo[] {
  const parsed = z.array(ghRepoSchema).parse(JSON.parse(json));
  return parsed.map((repo) => {
    const [owner = "", name = ""] = repo.nameWithOwner.split("/");
    return {
      source: GITHUB_SOURCE_ID,
      owner,
      name,
      fullName: repo.nameWithOwner,
      cloneUrl: `${repo.url}.git`,
      ...(repo.hasWikiEnabled ? { wikiUrl: `${repo.url}.wiki.git` } : {}),
      hasWiki: repo.hasWikiEnabled,
      isArchived: repo.isArchived,
      isFork: repo.isFork,
      isEmpty: repo.isEmpty,
    };
  });
}

/** GitHub names are case-insensitive, so duplicates are detected case-insensitively. */
export function dedupeRepos(repos: RepoInfo[]): RepoInfo[] {
  const seen = new Set<string>();
  return repos.filter((repo) => {
    const key = repo.fullName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createGithubSource(deps: { exec: Exec }): Source {
  const gh = (args: string[]) => deps.exec("gh", args, { env: GH_ENV });

  return {
    id: GITHUB_SOURCE_ID,

    async checkPrerequisites() {
      try {
        await gh(["--version"]);
      } catch (err) {
        if (err instanceof ExecError && err.code === "ENOENT") {
          throw new PrerequisiteError(
            "GitHub CLI (gh) was not found. Install it from https://cli.github.com and run: gh auth login",
          );
        }
        throw err;
      }
      try {
        await gh(["auth", "status"]);
      } catch (err) {
        if (err instanceof ExecError) {
          throw new PrerequisiteError(
            `GitHub CLI is not logged in. Run: gh auth login (scopes: repo, read:org)\n${err.stderr}`.trimEnd(),
          );
        }
        throw err;
      }
    },

    async listRepos(): Promise<ListReposResult> {
      const failures: ListFailure[] = [];
      const login = (await gh(["api", "user", "--jq", ".login"])).stdout.trim();
      if (!login) throw new PrerequisiteError("could not determine the logged-in GitHub user");

      const owners = [login];
      try {
        const orgs = await gh(["api", "user/orgs", "--paginate", "--jq", ".[].login"]);
        owners.push(...lines(orgs.stdout));
      } catch (err) {
        failures.push({ owner: "organizations", message: errorMessage(err) });
      }

      const repos: RepoInfo[] = [];
      for (const owner of [...new Set(owners)]) {
        try {
          const result = await gh([
            "repo",
            "list",
            owner,
            "--limit",
            "100000",
            "--json",
            REPO_FIELDS,
          ]);
          repos.push(...parseRepoList(result.stdout));
        } catch (err) {
          failures.push({ owner, message: errorMessage(err) });
        }
      }
      return { repos: dedupeRepos(repos), failures };
    },

    gitEnv() {
      return {
        GIT_CONFIG_COUNT: "2",
        GIT_CONFIG_KEY_0: "credential.https://github.com.helper",
        GIT_CONFIG_VALUE_0: "",
        GIT_CONFIG_KEY_1: "credential.https://github.com.helper",
        GIT_CONFIG_VALUE_1: "!gh auth git-credential",
        GIT_TERMINAL_PROMPT: "0",
      };
    },
  };
}
