import type { SourceConfig } from "../config/schema.js";
import type { Exec } from "../util/exec.js";
import { createGithubSource } from "./github.js";
import type { Source } from "./types.js";

export type { RepoInfo, Source } from "./types.js";

/** Registry: maps a configured source `type` to its implementation. */
export function createSource(config: SourceConfig, deps: { exec: Exec }): Source {
  switch (config.type) {
    case "github":
      return createGithubSource(deps);
  }
}
