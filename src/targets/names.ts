import { isStamp } from "../util/time.js";

/** Splits `20260101T000000Z.bundle` into stamp and extension; null for other names. */
export function parseSnapshotName(file: string): { stamp: string; ext: string } | null {
  const dot = file.indexOf(".");
  if (dot < 0) return null;
  const stamp = file.slice(0, dot);
  return isStamp(stamp) ? { stamp, ext: file.slice(dot) } : null;
}
