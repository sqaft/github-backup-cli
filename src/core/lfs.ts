import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { create } from "tar";
import type { Git } from "./git.js";

/** Directory of a bare mirror that holds the LFS objects, relative to the mirror. */
const LFS_OBJECTS = "lfs/objects";

/** Fetches the LFS objects of every ref into `<mirror>/lfs/objects`. A repo without LFS is a no-op. */
export async function fetchLfs(git: Git, mirrorDir: string): Promise<void> {
  await git(["lfs", "fetch", "--all", "origin"], { cwd: mirrorDir });
}

async function containsFile(dir: string): Promise<boolean> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
  for (const entry of entries) {
    if (entry.isFile()) return true;
    if (entry.isDirectory() && (await containsFile(path.join(dir, entry.name)))) return true;
  }
  return false;
}

/** True when the mirror holds at least one LFS object (an empty `lfs/objects` does not count). */
export function hasLfsObjects(mirrorDir: string): Promise<boolean> {
  return containsFile(path.join(mirrorDir, ...LFS_OBJECTS.split("/")));
}

/** Writes `lfs/objects/...` of the mirror to a tar and returns its size in bytes. */
export async function createLfsTar(mirrorDir: string, file: string): Promise<number> {
  await create({ cwd: mirrorDir, file, portable: true }, [LFS_OBJECTS]);
  return (await stat(file)).size;
}
