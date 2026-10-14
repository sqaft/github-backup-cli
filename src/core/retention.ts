import type { Target } from "../targets/types.js";

/** Hedef `keep` > genel `keep` (K-009). */
export function resolveKeep(targetKeep: number | undefined, globalKeep: number): number {
  return targetKeep ?? globalKeep;
}

/** Stamps older than the newest `keep` ones. Stamps sort chronologically as plain strings. */
export function selectExpired(stamps: readonly string[], keep: number): string[] {
  const newestFirst = [...stamps].sort().reverse();
  return newestFirst.slice(Math.max(keep, 0)).reverse();
}

/** Deletes snapshots beyond `keep` and files of interrupted uploads for one repository. */
export async function applyRetention(target: Target, repoKey: string): Promise<void> {
  const stamps = await target.listSnapshots(repoKey);
  for (const stamp of selectExpired(stamps, target.keep)) {
    await target.deleteSnapshot(repoKey, stamp);
  }
  await target.cleanupIncomplete(repoKey);
}
