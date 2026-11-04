const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Rounds to one decimal below 100 and to a whole number from there. */
const round = (value: number): number =>
  value < 100 ? Math.round(value * 10) / 10 : Math.round(value);

/** A byte count for people: `512 B`, `1.5 KB`, `184 MB`. Base 1024; a unit never shows `1024`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (unit < UNITS.length - 1 && round(value) >= 1024) {
    value /= 1024;
    unit++;
  }
  if (unit === 0) return `${Math.round(value)} B`;
  const rounded = round(value);
  return `${rounded.toFixed(rounded < 100 ? 1 : 0)} ${UNITS[unit]}`;
}
