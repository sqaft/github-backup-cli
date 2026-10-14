import { z } from "zod";

const positiveInt = z.number().int().positive();

export const githubSourceSchema = z.strictObject({
  type: z.literal("github"),
  include: z.array(z.string().min(1)).default(["*/*"]),
  exclude: z.array(z.string().min(1)).default([]),
  archived: z.boolean().default(true),
  forks: z.boolean().default(true),
});

export const sourceSchema = z.discriminatedUnion("type", [githubSourceSchema]);

export const localTargetSchema = z.strictObject({
  type: z.literal("local"),
  name: z.string().min(1),
  path: z.string().min(1),
  keep: positiveInt.optional(),
});

export const s3TargetSchema = z.strictObject({
  type: z.literal("s3"),
  name: z.string().min(1),
  bucket: z.string().min(1),
  prefix: z.string().default(""),
  endpoint: z.url().optional(),
  region: z.string().min(1).optional(),
  forcePathStyle: z.boolean().default(false),
  accessKeyId: z.string().min(1).optional(),
  secretAccessKey: z.string().min(1).optional(),
  keep: positiveInt.optional(),
});

export const targetSchema = z.discriminatedUnion("type", [localTargetSchema, s3TargetSchema]);

export const DEFAULT_CACHE_DIR = "~/.cache/github-backup-cli";

export const configSchema = z
  .strictObject({
    cacheDir: z.string().min(1).default(DEFAULT_CACHE_DIR),
    concurrency: positiveInt.max(64).default(4),
    wiki: z.boolean().default(true),
    lfs: z.boolean().default(true),
    keep: positiveInt.default(7),
    sources: z
      .array(sourceSchema)
      .min(1)
      .default(() => [githubSourceSchema.parse({ type: "github" })]),
    targets: z.array(targetSchema).default([]),
  })
  .check((ctx) => {
    const seen = new Set<string>();
    ctx.value.targets.forEach((target, index) => {
      if (seen.has(target.name)) {
        ctx.issues.push({
          code: "custom",
          message: `duplicate target name "${target.name}"`,
          path: ["targets", index, "name"],
          input: ctx.value,
        });
      }
      seen.add(target.name);
    });
  });

export type GithubSourceConfig = z.infer<typeof githubSourceSchema>;
export type SourceConfig = z.infer<typeof sourceSchema>;
export type LocalTargetConfig = z.infer<typeof localTargetSchema>;
export type S3TargetConfig = z.infer<typeof s3TargetSchema>;
export type TargetConfig = z.infer<typeof targetSchema>;
export type Config = z.infer<typeof configSchema>;
