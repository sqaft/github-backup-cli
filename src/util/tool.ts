import { readFileSync } from "node:fs";

export interface ToolInfo {
  name: string;
  version: string;
}

/** Name and version from package.json (same relative path from `src/` and `dist/`). */
export function readToolInfo(): ToolInfo {
  const pkg = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as ToolInfo;
  return { name: pkg.name, version: pkg.version };
}
