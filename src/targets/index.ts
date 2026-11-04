import type { TargetConfig } from "../config/schema.js";
import { createLocalTarget, localTargetSetup } from "./local.js";
import { createS3Target, s3TargetSetup } from "./s3.js";
import type { Target, TargetSetup } from "./types.js";

export type { Manifest, SnapshotFiles, Target, TargetSetup } from "./types.js";

/** Target types offered when the config file is written; the first is the default. */
export const TARGET_SETUPS: readonly TargetSetup[] = [s3TargetSetup, localTargetSetup];

/** Registry: maps a configured target `type` to its implementation. */
export function createTarget(config: TargetConfig, options: { keep: number }): Target {
  switch (config.type) {
    case "local":
      return createLocalTarget({ name: config.name, path: config.path, keep: options.keep });
    case "s3":
      return createS3Target({
        name: config.name,
        bucket: config.bucket,
        prefix: config.prefix,
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        keep: options.keep,
      });
  }
}
