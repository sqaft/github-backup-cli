import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import type { Manifest, RefEntry } from "../targets/types.js";
import type { ToolInfo } from "../util/tool.js";
import type { Git } from "./git.js";

/** Branches and tags of a mirror, sorted by ref name. */
export async function listRefs(git: Git, mirrorDir: string): Promise<RefEntry[]> {
  const { stdout } = await git(["for-each-ref", "--format=%(objectname) %(refname)"], {
    cwd: mirrorDir,
  });
  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [sha = "", name = ""] = line.split(" ");
      return { name, sha };
    });
}

/** sha256 over the sorted `sha refname` lines; equal digests mean unchanged refs. */
export function hashRefs(refs: RefEntry[]): string {
  const sorted = [...refs].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const text = sorted.map((ref) => `${ref.sha} ${ref.name}\n`).join("");
  return createHash("sha256").update(text).digest("hex");
}

export async function createBundle(git: Git, mirrorDir: string, file: string): Promise<number> {
  await git(["bundle", "create", file, "--all"], { cwd: mirrorDir });
  return (await stat(file)).size;
}

export interface ManifestInput {
  source: string;
  fullName: string;
  stamp: string;
  refs: RefEntry[];
  bundleBytes: number;
  lfsTarBytes?: number;
  tool: ToolInfo;
}

export function buildManifest(input: ManifestInput): Manifest {
  return {
    version: 1,
    source: input.source,
    fullName: input.fullName,
    stamp: input.stamp,
    refsHash: hashRefs(input.refs),
    refs: input.refs,
    bundleBytes: input.bundleBytes,
    ...(input.lfsTarBytes === undefined ? {} : { lfsTarBytes: input.lfsTarBytes }),
    tool: input.tool,
  };
}
