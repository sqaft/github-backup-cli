import type { TargetConfig } from "../config/schema.js";
import { ConfigError } from "../util/errors.js";
import { createLocalTarget } from "./local.js";
import type { Target } from "./types.js";

export type { Manifest, SnapshotFiles, Target } from "./types.js";

/** Registry: maps a configured target `type` to its implementation. */
export function createTarget(config: TargetConfig, options: { keep: number }): Target {
  switch (config.type) {
    case "local":
      return createLocalTarget({ name: config.name, path: config.path, keep: options.keep });
    case "s3":
      throw new ConfigError(`target "${config.name}": s3 targets are not available yet`);
  }
}
