import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RepoInfo, Source } from "../../src/sources/types.js";
import { type Exec, exec } from "../../src/util/exec.js";

/** Environment that keeps git away from the real global config and makes commits possible. */
export function gitTestEnv(home: string): Record<string, string> {
  return {
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  };
}

/** `Exec` that always runs with `gitTestEnv(home)`. */
export function isolatedExec(home: string): Exec {
  return (cmd, args, opts) =>
    exec(cmd, args, { ...opts, env: { ...gitTestEnv(home), ...opts?.env } });
}

export function makeTempDir(prefix = "ghb-"): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

/** A bare repository acting as the "remote", plus a work tree to create history in it. */
export class TestRemote {
  readonly bare: string;
  readonly work: string;
  private readonly env: Record<string, string>;

  constructor(root: string, name: string, home: string) {
    this.env = gitTestEnv(home);
    this.bare = path.join(root, `${name}.git`);
    this.work = path.join(root, `${name}-work`);
    mkdirSync(this.work, { recursive: true });
    this.git(["init", "--bare", "--initial-branch=main", this.bare], root);
    this.git(["init", "--initial-branch=main"], this.work);
    this.git(["remote", "add", "origin", this.bare], this.work);
  }

  get url(): string {
    return `file://${this.bare}`;
  }

  git(args: string[], cwd = this.work): string {
    return execFileSync("git", args, {
      cwd,
      env: { ...process.env, ...this.env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  /** Commits a file on `branch` (created from the current HEAD when new) and pushes it. */
  commit(file: string, content: string, branch = "main"): void {
    const current = this.git(["branch", "--show-current"]).trim();
    if (current !== branch) {
      const exists = this.git(["branch", "--list", branch]).trim() !== "";
      this.git(exists ? ["checkout", branch] : ["checkout", "-b", branch]);
    }
    writeFileSync(path.join(this.work, file), content);
    this.git(["add", file]);
    this.git(["commit", "-m", `update ${file}`]);
    this.git(["push", "origin", branch]);
  }

  tag(name: string): void {
    this.git(["tag", "-a", name, "-m", name]);
    this.git(["push", "origin", name]);
  }

  deleteBranch(name: string): void {
    this.git(["push", "origin", "--delete", name]);
  }

  /** Creates a ref such as `refs/pull/1/head` that GitHub exposes but backups must skip. */
  pushRef(ref: string): void {
    this.git(["push", "origin", `HEAD:${ref}`]);
  }

  /** `git for-each-ref` output limited to branches and tags. */
  refs(): string {
    return this.git(["for-each-ref", "refs/heads", "refs/tags"], this.bare);
  }
}

export function repoInfo(
  fullName: string,
  remote: Pick<TestRemote, "url">,
  extra: Partial<RepoInfo> = {},
): RepoInfo {
  const [owner = "", name = ""] = fullName.split("/");
  return {
    source: "test",
    owner,
    name,
    fullName,
    cloneUrl: remote.url,
    hasWiki: false,
    isArchived: false,
    isFork: false,
    isEmpty: false,
    ...extra,
  };
}

export function fakeSource(repos: RepoInfo[] = [], env: Record<string, string> = {}): Source {
  return {
    id: "test",
    checkPrerequisites: async () => {},
    listRepos: async () => ({ repos, failures: [] }),
    gitEnv: () => env,
  };
}

/** True when `git-lfs` is installed, so LFS tests can be skipped on machines without it. */
export function hasGitLfs(): boolean {
  try {
    execFileSync("git", ["lfs", "version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Turns a test remote into an LFS repository whose LFS objects live in a local bare repository
 * (git-lfs' built-in standalone file transfer, so no LFS server is needed). Returns the git
 * environment a mirror needs to fetch those objects.
 */
export function enableLfs(
  remote: TestRemote,
  storeDir: string,
  pattern = "*.bin",
): Record<string, string> {
  const config = {
    "lfs.url": `file://${storeDir}`,
    "lfs.standalonetransferagent": "lfs-standalone-file",
  };
  remote.git(["init", "--bare", storeDir], path.dirname(storeDir));
  remote.git(["lfs", "install", "--local"]);
  remote.git(["lfs", "track", pattern]);
  for (const [key, value] of Object.entries(config)) remote.git(["config", key, value]);
  remote.git(["add", ".gitattributes"]);
  const env: Record<string, string> = { GIT_CONFIG_COUNT: String(Object.keys(config).length) };
  Object.entries(config).forEach(([key, value], index) => {
    env[`GIT_CONFIG_KEY_${index}`] = key;
    env[`GIT_CONFIG_VALUE_${index}`] = value;
  });
  return env;
}
