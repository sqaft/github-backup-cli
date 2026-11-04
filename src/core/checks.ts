import type { Target } from "../targets/types.js";
import { PrerequisiteError } from "../util/errors.js";
import type { Exec } from "../util/exec.js";

export async function checkGit(exec: Exec): Promise<void> {
  try {
    await exec("git", ["--version"]);
  } catch {
    throw new PrerequisiteError("git is not installed or not in PATH; install git and try again");
  }
}

/** Fails when Git LFS is enabled but `git-lfs` is missing. */
export async function checkLfs(exec: Exec): Promise<void> {
  try {
    await exec("git", ["lfs", "version"]);
  } catch {
    throw new PrerequisiteError(
      "git-lfs is not installed; install it from https://git-lfs.com " +
        "or rerun with --no-lfs to skip LFS objects",
    );
  }
}

/** Fails when the target's storage is unreachable or rejects the credentials. */
export async function checkTarget(target: Target): Promise<void> {
  try {
    await target.checkAccess?.();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new PrerequisiteError(`target "${target.name}": ${reason}`);
  }
}
