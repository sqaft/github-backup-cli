import { constants } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { askText } from "../util/prompt.js";
import { parseSnapshotName as parseName } from "./names.js";
import type { Manifest, SnapshotFiles, Target, TargetSetup } from "./types.js";

export interface LocalTargetOptions {
  name: string;
  /** Root directory snapshots are written under. */
  path: string;
  keep: number;
}

const PARTIAL = ".partial";

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

export const localTargetSetup: TargetSetup = {
  label: "Local directory",
  defaultName: "disk",
  async prompt(prompter, name) {
    return { type: "local", name, path: await askText(prompter, "Directory") };
  },
};

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

  async function readManifest(repoKey: string, stamp: string): Promise<Manifest | null> {
    const file = path.join(dirOf(repoKey), `${stamp}.json`);
    try {
      return JSON.parse(await readFile(file, "utf8")) as Manifest;
    } catch {
      return null;
    }
  }

  return {
    name: options.name,
    type: "local",
    keep: options.keep,

    async checkAccess() {
      // The target directory is created when a snapshot is written, so only the nearest
      // existing ancestor has to be a directory that accepts new entries.
      let existing = root;
      for (;;) {
        try {
          if (!(await stat(existing)).isDirectory())
            throw new Error(`${existing} is not a directory`);
          break;
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          const parent = path.dirname(existing);
          if ((code !== "ENOENT" && code !== "ENOTDIR") || parent === existing) throw err;
          existing = parent;
        }
      }
      try {
        await access(existing, constants.W_OK);
      } catch {
        throw new Error(`${existing} is not writable`);
      }
    },

    latestManifest: async (repoKey) => {
      const latest = (await completeStamps(dirOf(repoKey))).at(-1);
      return latest === undefined ? null : readManifest(repoKey, latest);
    },

    readManifest,

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
