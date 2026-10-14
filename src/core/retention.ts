/** Hedef `keep` > genel `keep` (K-009). */
export function resolveKeep(targetKeep: number | undefined, globalKeep: number): number {
  return targetKeep ?? globalKeep;
}

/** Stamps older than the newest `keep` ones. Stamps sort chronologically as plain strings. */
export function selectExpired(stamps: readonly string[], keep: number): string[] {
  const newestFirst = [...stamps].sort().reverse();
  return newestFirst.slice(Math.max(keep, 0)).reverse();
}
