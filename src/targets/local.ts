import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isStamp } from "../util/time.js";
import type { Manifest, SnapshotFiles, Target } from "./types.js";

export interface LocalTargetOptions {
  name: string;
  /** Root directory snapshots are written under. */
  path: string;
  keep: number;
}

const PARTIAL = ".partial";

/** Splits `20260101T000000Z.bundle` into stamp and extension; null for other names. */
function parseName(file: string): { stamp: string; ext: string } | null {
  const dot = file.indexOf(".");
  if (dot < 0) return null;
  const stamp = file.slice(0, dot);
  return isStamp(stamp) ? { stamp, ext: file.slice(dot) } : null;
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function store(from: string, to: string): Promise<void> {
  await copyFile(from, `${to}${PARTIAL}`);
  await rename(`${to}${PARTIAL}`, to);
}

export function createLocalTarget(options: LocalTargetOptions): Target {
  const root = path.resolve(options.path);

  const dirOf = (repoKey: string): string => {
    const dir = path.resolve(root, repoKey);
    if (!dir.startsWith(root + path.sep)) throw new Error(`invalid repository key "${repoKey}"`);
    return dir;
  };

  async function completeStamps(dir: string): Promise<string[]> {
    const stamps = (await listDir(dir))
      .map(parseName)
      .filter((p): p is { stamp: string; ext: string } => p?.ext === ".json")
      .map((p) => p.stamp);
    return stamps.sort();
  }

  return {
    name: options.name,
    type: "local",
    keep: options.keep,

    async latestManifest(repoKey) {
      const dir = dirOf(repoKey);
      const stamps = await completeStamps(dir);
      const latest = stamps.at(-1);
      if (latest === undefined) return null;
      try {
        return JSON.parse(await readFile(path.join(dir, `${latest}.json`), "utf8")) as Manifest;
      } catch {
        return null;
      }
    },

    async putSnapshot(repoKey, stamp, files: SnapshotFiles) {
      const dir = dirOf(repoKey);
      await mkdir(dir, { recursive: true });
      try {
        await store(files.bundle, path.join(dir, `${stamp}.bundle`));
        if (files.lfsTar) await store(files.lfsTar, path.join(dir, `${stamp}.lfs.tar`));
        const manifest = path.join(dir, `${stamp}.json`);
        await writeFile(`${manifest}${PARTIAL}`, `${JSON.stringify(files.manifest, null, 2)}\n`);
        await rename(`${manifest}${PARTIAL}`, manifest);
      } catch (err) {
        await rm(path.join(dir, `${stamp}.json${PARTIAL}`), { force: true });
        throw err;
      }
    },

    async listSnapshots(repoKey) {
      return completeStamps(dirOf(repoKey));
    },

    async deleteSnapshot(repoKey, stamp) {
      const dir = dirOf(repoKey);
      // The manifest goes first so a half-deleted snapshot never looks complete.
      await rm(path.join(dir, `${stamp}.json`), { force: true });
      for (const file of await listDir(dir)) {
        if (parseName(file)?.stamp === stamp) await rm(path.join(dir, file), { force: true });
      }
    },

    async cleanupIncomplete(repoKey) {
      const dir = dirOf(repoKey);
      const files = await listDir(dir);
      const complete = new Set(await completeStamps(dir));
      for (const file of files) {
        const parsed = parseName(file);
        const partial = file.endsWith(PARTIAL);
        if (partial || (parsed && !complete.has(parsed.stamp))) {
          await rm(path.join(dir, file), { force: true });
        }
      }
    },
  };
}
