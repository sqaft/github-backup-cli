export interface RefEntry {
  name: string;
  sha: string;
}

/** Written last for every snapshot; its presence marks the snapshot as complete (K-009). */
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

/** Storage a snapshot is written to. `repoKey` is `<source>/<owner>/<repo>[.wiki]`. */
export interface Target {
  readonly name: string;
  readonly type: string;
  /** Snapshots kept per repository. */
  readonly keep: number;
  /** Manifest of the newest complete snapshot, or null. */
  latestManifest(repoKey: string): Promise<Manifest | null>;
  /** Stores the files; the manifest is stored last. */
  putSnapshot(repoKey: string, stamp: string, files: SnapshotFiles): Promise<void>;
  /** Stamps of complete snapshots (those with a manifest), oldest first. */
  listSnapshots(repoKey: string): Promise<string[]>;
  /** Removes bundle, lfs.tar and manifest of one snapshot. */
  deleteSnapshot(repoKey: string, stamp: string): Promise<void>;
  /** Removes leftovers of interrupted uploads (files without a manifest). */
  cleanupIncomplete(repoKey: string): Promise<void>;
  /** Fails with a readable reason when the storage cannot be reached; run before a backup starts. */
  checkAccess?(): Promise<void>;
}
