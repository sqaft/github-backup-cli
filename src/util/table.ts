/** Aligned columns, two spaces apart, without trailing spaces. */
export function formatTable(headers: readonly string[], rows: readonly string[][]): string {
  const widths = headers.map((header, col) =>
    Math.max(header.length, ...rows.map((row) => (row[col] ?? "").length)),
  );
  const format = (cells: readonly string[]) =>
    cells
      .map((cell, col) => cell.padEnd(widths[col] ?? 0))
      .join("  ")
      .trimEnd();
  return [format(headers), ...rows.map(format)].join("\n");
}
