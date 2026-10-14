import type { TargetConfig } from "../config/schema.js";
import { createLocalTarget } from "./local.js";
import { createS3Target } from "./s3.js";
import type { Target } from "./types.js";

export type { Manifest, SnapshotFiles, Target } from "./types.js";

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
