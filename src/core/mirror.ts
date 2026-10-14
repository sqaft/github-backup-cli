import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { ExecError } from "../util/exec.js";
import type { Git } from "./git.js";

export type MirrorResult = { status: "ok" } | { status: "skipped"; reason: string };

export interface MirrorInput {
  /** Bare repository directory inside the cache. */
  mirrorDir: string;
  url: string;
  /** A missing wiki repository is expected (wiki enabled, no pages yet), not an error. */
  kind: "repo" | "wiki";
}

const FETCH_REFSPECS = ["+refs/heads/*:refs/heads/*", "+refs/tags/*:refs/tags/*"];
const NOT_FOUND = /repository .*not found|does not appear to be a git repository/i;

async function initMirror(git: Git, input: MirrorInput): Promise<void> {
  await mkdir(input.mirrorDir, { recursive: true });
  await git(["init", "--bare", input.mirrorDir]);
  const inRepo = { cwd: input.mirrorDir };
  await git(["remote", "add", "origin", input.url], inRepo);
  // Only branches and tags: refs/pull/* is never fetched, and nothing is pruned (K-008, K-028).
  await git(
    ["config", "--replace-all", "remote.origin.fetch", FETCH_REFSPECS[0] as string],
    inRepo,
  );
  await git(["config", "--add", "remote.origin.fetch", FETCH_REFSPECS[1] as string], inRepo);
}

/** Points the mirror's HEAD at the remote's default branch so bundles clone with a checkout. */
async function syncHead(git: Git, mirrorDir: string): Promise<void> {
  try {
    const { stdout } = await git(["ls-remote", "--symref", "origin", "HEAD"], { cwd: mirrorDir });
    const branch = /^ref:\s+(refs\/heads\/\S+)\s+HEAD$/m.exec(stdout)?.[1];
    if (branch) await git(["symbolic-ref", "HEAD", branch], { cwd: mirrorDir });
  } catch (err) {
    if (err instanceof ExecError && err.code === "ABORT_ERR") throw err;
    // The default branch is cosmetic; the refs themselves are already fetched.
  }
}

/** Creates the bare mirror when missing and fetches new refs into it (no pruning). */
export async function syncMirror(git: Git, input: MirrorInput): Promise<MirrorResult> {
  const created = !existsSync(`${input.mirrorDir}/HEAD`);
  if (created) await initMirror(git, input);
  const inRepo = { cwd: input.mirrorDir };
  try {
    await git(["config", "remote.origin.url", input.url], inRepo);
    await git(["fetch", "--no-tags", "--no-prune", "origin"], inRepo);
  } catch (err) {
    if (created) await rm(input.mirrorDir, { recursive: true, force: true });
    if (input.kind === "wiki" && err instanceof ExecError && NOT_FOUND.test(err.stderr)) {
      return { status: "skipped", reason: "no wiki" };
    }
    throw err;
  }
  await syncHead(git, input.mirrorDir);
  return { status: "ok" };
}
