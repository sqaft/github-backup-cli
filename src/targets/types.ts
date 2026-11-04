import type { Prompter } from "../util/prompt.js";

export interface RefEntry {
  name: string;
  sha: string;
}

/** Written last for every snapshot; its presence marks the snapshot as complete. */
export interface Manifest {
  version: 1;
  source: string;
  fullName: string;
  stamp: string;
  refsHash: string;
  refs: RefEntry[];
  bundleBytes: number;
  lfsTarBytes?: number;
  tool: { name: string; version: string };
}

export interface SnapshotFiles {
  /** Local path of the bundle to store. */
  bundle: string;
  /** Local path of the LFS object archive, when the repository has LFS objects. */
  lfsTar?: string;
  manifest: Manifest;
}

/** Questions that create a configured target when setup writes the config file. */
export interface TargetSetup {
  /** Shown in the target menu. */
  readonly label: string;
  readonly defaultName: string;
  /** Returns the raw target; the caller validates it against the schema. */
  prompt(prompter: Prompter, name: string): Promise<unknown>;
}

/** Storage a snapshot is written to. `repoKey` is `<source>/<owner>/<repo>[.wiki]`. */
export interface Target {
  readonly name: string;
  readonly type: string;
  /** Snapshots kept per repository. */
  readonly keep: number;
  /** Manifest of the newest complete snapshot, or null. */
  latestManifest(repoKey: string): Promise<Manifest | null>;
  /** Manifest of one snapshot; null when it is missing or cannot be parsed. */
  readManifest(repoKey: string, stamp: string): Promise<Manifest | null>;
  /**
   * Stores the files; the manifest is stored last. `onPercent`, when the storage can tell,
   * receives the share of the snapshot's bytes stored so far.
   */
  putSnapshot(
    repoKey: string,
    stamp: string,
    files: SnapshotFiles,
    onPercent?: (percent: number) => void,
  ): Promise<void>;
  /** Stamps of complete snapshots (those with a manifest), oldest first. */
  listSnapshots(repoKey: string): Promise<string[]>;
  /** Removes bundle, lfs.tar and manifest of one snapshot. */
  deleteSnapshot(repoKey: string, stamp: string): Promise<void>;
  /** Removes leftovers of interrupted uploads (files without a manifest). */
  cleanupIncomplete(repoKey: string): Promise<void>;
  /**
   * Fails with a readable reason when the storage cannot be reached; run before a backup starts.
   * It must not create or change anything.
   */
  checkAccess?(): Promise<void>;
}
