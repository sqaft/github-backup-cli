import { createReadStream } from "node:fs";
import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { ConfigError } from "../util/errors.js";
import { askChoice, askText, askYesNo, type Prompter } from "../util/prompt.js";
import { parseSnapshotName } from "./names.js";
import type { Manifest, SnapshotFiles, Target, TargetSetup } from "./types.js";

export const DEFAULT_REGION = "us-east-1";
/** Part size of multipart uploads: 16 MiB allows objects up to 160 GB (10 000 parts). */
const PART_SIZE = 16 * 1024 * 1024;
/** `DeleteObjects` accepts at most 1000 keys per request. */
const DELETE_BATCH = 1000;

export interface S3TargetOptions {
  name: string;
  bucket: string;
  prefix?: string;
  endpoint?: string;
  region?: string;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  keep: number;
  /** Replaces the SDK client; used by tests. */
  client?: Pick<S3Client, "send">;
}

/** `/git/` and `git//backups/` become `git` and `git/backups`; blank becomes the bucket root. */
export function normalizePrefix(prefix: string | undefined): string {
  return (prefix ?? "").split("/").filter(Boolean).join("/");
}

/** Object key `<prefix>/<repoKey>/<name>`; `name` is empty for the repository's "directory" prefix. */
export function objectKey(prefix: string, repoKey: string, name = ""): string {
  const segments = repoKey.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    throw new Error(`invalid repository key "${repoKey}"`);
  }
  return [prefix, repoKey, name].filter((part) => part !== "").join("/") + (name === "" ? "/" : "");
}

/**
 * SDK client settings. Credentials come from the configuration (which already holds the
 * `GHBACKUP_S3_*` fallback); without any, the SDK's default chain applies.
 */
export function s3ClientConfig(
  options: Pick<
    S3TargetOptions,
    "name" | "endpoint" | "region" | "forcePathStyle" | "accessKeyId" | "secretAccessKey"
  >,
): S3ClientConfig {
  const { accessKeyId, secretAccessKey } = options;
  if ((accessKeyId === undefined) !== (secretAccessKey === undefined)) {
    throw new ConfigError(
      `target "${options.name}": accessKeyId and secretAccessKey must be set together ` +
        "(in the config or as GHBACKUP_S3_ACCESS_KEY_ID and GHBACKUP_S3_SECRET_ACCESS_KEY)",
    );
  }
  const config: S3ClientConfig = {
    region: options.region ?? DEFAULT_REGION,
    forcePathStyle: options.forcePathStyle ?? false,
    // Since SDK 3.729 requests carry CRC32 checksums by default, which several S3-compatible
    // services reject; only send them where the API requires them.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  };
  if (options.endpoint !== undefined) config.endpoint = options.endpoint;
  if (accessKeyId !== undefined && secretAccessKey !== undefined) {
    config.credentials = { accessKeyId, secretAccessKey };
  }
  return config;
}

/** Rejects anything that cannot be one part of a host name, such as a pasted URL. */
function validateHostPart(value: string): string | undefined {
  return /^[a-zA-Z0-9-]+$/.test(value) ? undefined : "Enter only letters, digits and hyphens.";
}

function validateEndpoint(value: string): string | undefined {
  if (!URL.canParse(value)) return "Enter a full URL such as https://s3.example.com.";
  if (new URL(value).pathname !== "/") return "Enter the URL without a bucket or other path.";
  return undefined;
}

type S3Connection = Pick<S3TargetOptions, "endpoint" | "region" | "forcePathStyle">;

const S3_PROVIDERS: ReadonlyArray<{
  label: string;
  value: (prompter: Prompter) => Promise<S3Connection>;
}> = [
  {
    label: "Cloudflare R2",
    value: async (prompter) => {
      const account = await askText(prompter, "Cloudflare account ID", {
        validate: validateHostPart,
      });
      return { endpoint: `https://${account}.r2.cloudflarestorage.com`, region: "auto" };
    },
  },
  {
    label: "AWS S3",
    value: async (prompter) => ({
      region: await askText(prompter, "Bucket region", { defaultValue: DEFAULT_REGION }),
    }),
  },
  {
    label: "Backblaze B2",
    value: async (prompter) => {
      const region = await askText(prompter, "Bucket region (e.g. us-west-004)", {
        validate: validateHostPart,
      });
      return { endpoint: `https://s3.${region}.backblazeb2.com`, region };
    },
  },
  {
    label: "Other (MinIO or another S3-compatible service)",
    value: async (prompter) => ({
      endpoint: await askText(prompter, "Endpoint URL", { validate: validateEndpoint }),
      region: await askText(prompter, "Region", { defaultValue: DEFAULT_REGION }),
      forcePathStyle: await askYesNo(prompter, "Use path-style URLs (MinIO needs this)?", true),
    }),
  },
];

export const s3TargetSetup: TargetSetup = {
  label: "S3-compatible bucket",
  defaultName: "s3",
  async prompt(prompter, name) {
    const askConnection = await askChoice(prompter, "Storage provider", S3_PROVIDERS);
    const connection = await askConnection(prompter);
    return {
      type: "s3",
      name,
      bucket: await askText(prompter, "Bucket name"),
      prefix: await askText(prompter, "Key prefix", { defaultValue: "git" }),
      ...connection,
      accessKeyId: await askText(prompter, "Access key ID"),
      secretAccessKey: await askText(prompter, "Secret access key", { hidden: true }),
    };
  },
};

export function maskSecrets(text: string, secrets: readonly (string | undefined)[]): string {
  let out = text;
  for (const secret of secrets) if (secret) out = out.split(secret).join("***");
  return out;
}

/** One-line description of an SDK or network error with credentials masked. */
export function describeS3Error(err: unknown, secrets: readonly (string | undefined)[]): string {
  if (!(err instanceof Error)) return maskSecrets(String(err), secrets);
  const meta = err as Error & { $metadata?: { httpStatusCode?: number }; Code?: string };
  const name = meta.Code ?? (err.name !== "Error" ? err.name : undefined);
  const message = err.message && err.message !== "UnknownError" ? err.message : undefined;
  const parts = [name, message].filter((part): part is string => Boolean(part));
  let text = parts.length > 0 ? parts.join(": ") : "unknown error";
  const status = meta.$metadata?.httpStatusCode;
  if (status !== undefined) text += ` (HTTP ${status})`;
  return maskSecrets(text, secrets);
}

function isMissingObject(err: unknown): boolean {
  const meta = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return meta.name === "NoSuchKey" || meta.$metadata?.httpStatusCode === 404;
}

interface ListedObject {
  key: string;
  name: string;
}

export function createS3Target(options: S3TargetOptions): Target {
  const prefix = normalizePrefix(options.prefix);
  const secrets = [options.accessKeyId, options.secretAccessKey];
  const client: Pick<S3Client, "send"> =
    options.client ?? new S3Client(s3ClientConfig({ ...options, name: options.name }));
  const { bucket } = options;

  /** Runs one operation and turns SDK errors into readable, credential-free ones. */
  async function guard<T>(what: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      throw new Error(`${what}: ${describeS3Error(err, secrets)}`);
    }
  }

  /** Objects directly under the repository's prefix (all pages). */
  async function listRepo(repoKey: string): Promise<ListedObject[]> {
    const dir = objectKey(prefix, repoKey);
    const found: ListedObject[] = [];
    let token: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: dir, ContinuationToken: token }),
      );
      for (const object of page.Contents ?? []) {
        if (object.Key === undefined) continue;
        const name = object.Key.slice(dir.length);
        if (name !== "" && !name.includes("/")) found.push({ key: object.Key, name });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token !== undefined);
    return found;
  }

  const completeStamps = (objects: ListedObject[]): string[] =>
    objects
      .map((o) => parseSnapshotName(o.name))
      .filter((p): p is { stamp: string; ext: string } => p?.ext === ".json")
      .map((p) => p.stamp)
      .sort();

  async function upload(
    key: string,
    file: string,
    onBytes?: (loaded: number) => void,
  ): Promise<void> {
    const body = createReadStream(file);
    try {
      const transfer = new Upload({
        client: client as S3Client,
        params: { Bucket: bucket, Key: key, Body: body },
        partSize: PART_SIZE,
        queueSize: 4,
      });
      transfer.on("httpUploadProgress", ({ loaded }) => onBytes?.(loaded ?? 0));
      await transfer.done();
    } finally {
      body.destroy();
    }
  }

  async function deleteKeys(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.slice(i, i + DELETE_BATCH).map((Key) => ({ Key })), Quiet: true },
        }),
      );
      const failed = result.Errors?.[0];
      if (failed) {
        throw new Error(
          `${failed.Key ?? "object"}: ${failed.Code ?? "error"} ${failed.Message ?? ""}`.trim(),
        );
      }
    }
  }

  /** Aborts unfinished multipart uploads under the repository prefix; best effort. */
  async function abortMultipartUploads(repoKey: string): Promise<void> {
    const dir = objectKey(prefix, repoKey);
    try {
      let keyMarker: string | undefined;
      let uploadIdMarker: string | undefined;
      do {
        const page = await client.send(
          new ListMultipartUploadsCommand({
            Bucket: bucket,
            Prefix: dir,
            KeyMarker: keyMarker,
            UploadIdMarker: uploadIdMarker,
          }),
        );
        for (const u of page.Uploads ?? []) {
          if (u.Key === undefined || u.UploadId === undefined) continue;
          await client.send(
            new AbortMultipartUploadCommand({ Bucket: bucket, Key: u.Key, UploadId: u.UploadId }),
          );
        }
        keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
        uploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined;
      } while (keyMarker !== undefined || uploadIdMarker !== undefined);
    } catch {
      // Not every S3-compatible service supports listing multipart uploads, and a policy may
      // withhold it. Orphaned parts only cost storage and the snapshot itself is already safe.
    }
  }

  async function readManifest(repoKey: string, stamp: string): Promise<Manifest | null> {
    return guard(`${repoKey}: cannot read manifest ${stamp}`, async () => {
      let text: string;
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: objectKey(prefix, repoKey, `${stamp}.json`),
          }),
        );
        text = (await response.Body?.transformToString()) ?? "";
      } catch (err) {
        if (isMissingObject(err)) return null;
        throw err;
      }
      try {
        return JSON.parse(text) as Manifest;
      } catch {
        return null;
      }
    });
  }

  return {
    name: options.name,
    type: "s3",
    keep: options.keep,

    async checkAccess() {
      await guard(`cannot access bucket "${bucket}"`, () =>
        client.send(new HeadBucketCommand({ Bucket: bucket })),
      );
    },

    latestManifest: async (repoKey) => {
      const latest = await guard(`${repoKey}: cannot read latest manifest`, async () =>
        completeStamps(await listRepo(repoKey)).at(-1),
      );
      return latest === undefined ? null : readManifest(repoKey, latest);
    },

    readManifest,

    async putSnapshot(repoKey, stamp, files: SnapshotFiles, onPercent) {
      const { bundleBytes, lfsTarBytes = 0 } = files.manifest;
      const total = bundleBytes + lfsTarBytes;
      const reportFrom = (offset: number) => (loaded: number) => {
        if (total > 0) onPercent?.(Math.floor(((offset + loaded) / total) * 100));
      };
      await guard(`${repoKey}: cannot upload snapshot ${stamp}`, async () => {
        await upload(objectKey(prefix, repoKey, `${stamp}.bundle`), files.bundle, reportFrom(0));
        if (files.lfsTar)
          await upload(
            objectKey(prefix, repoKey, `${stamp}.lfs.tar`),
            files.lfsTar,
            reportFrom(bundleBytes),
          );
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: objectKey(prefix, repoKey, `${stamp}.json`),
            Body: `${JSON.stringify(files.manifest, null, 2)}\n`,
            ContentType: "application/json",
          }),
        );
      });
    },

    async listSnapshots(repoKey) {
      return guard(`${repoKey}: cannot list snapshots`, async () =>
        completeStamps(await listRepo(repoKey)),
      );
    },

    async deleteSnapshot(repoKey, stamp) {
      await guard(`${repoKey}: cannot delete snapshot ${stamp}`, async () => {
        // The manifest goes first so a half-deleted snapshot never looks complete.
        await client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: objectKey(prefix, repoKey, `${stamp}.json`),
          }),
        );
        const rest = (await listRepo(repoKey))
          .filter((o) => parseSnapshotName(o.name)?.stamp === stamp)
          .map((o) => o.key);
        await deleteKeys(rest);
      });
    },

    async cleanupIncomplete(repoKey) {
      await guard(`${repoKey}: cannot clean up incomplete uploads`, async () => {
        const objects = await listRepo(repoKey);
        const complete = new Set(completeStamps(objects));
        const orphans = objects
          .filter((o) => {
            const parsed = parseSnapshotName(o.name);
            return parsed !== null && !complete.has(parsed.stamp);
          })
          .map((o) => o.key);
        await deleteKeys(orphans);
        await abortMultipartUploads(repoKey);
      });
    },
  };
}
