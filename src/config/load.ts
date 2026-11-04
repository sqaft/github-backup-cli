import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { ZodError } from "zod";
import { ConfigError } from "../util/errors.js";
import { type Config, configSchema, type TargetConfig } from "./schema.js";

/** Values from CLI flags. Numbers may arrive as strings from commander. */
export interface ConfigFlags {
  config?: string;
  cacheDir?: string;
  concurrency?: number | string;
  keep?: number | string;
  wiki?: boolean;
  lfs?: boolean;
  include?: string[];
  exclude?: string[];
  archived?: boolean;
  forks?: boolean;
  /** Names of the targets to run. */
  target?: string[];
  /** Adds a temporary `local` target at this path. */
  local?: string;
}

export interface LoadInput {
  flags: ConfigFlags;
  env: Record<string, string | undefined>;
  homeDir?: string;
  cwd?: string;
}

export interface LoadedConfig {
  config: Config;
  /** Absolute path of the config file that was read, if any. */
  configPath?: string;
  /** Absolute path that was looked at when no config file exists there. */
  missingConfigPath?: string;
  warnings: string[];
  /** Credential values that must be masked in logs. */
  secrets: string[];
}

/** Settings that can come from a flag or an environment variable. */
export interface Overrides {
  config?: string;
  cacheDir?: string;
  concurrency?: number;
  keep?: number;
  wiki?: boolean;
  lfs?: boolean;
  include?: string[];
  exclude?: string[];
  archived?: boolean;
  forks?: boolean;
  target?: string[];
  local?: string;
}

export function parseBoolean(name: string, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new ConfigError(`${name}: expected true, false, 1 or 0, got "${value}"`);
}

export function parseInteger(name: string, value: string | number): number {
  const n = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isInteger(n)) throw new ConfigError(`${name}: expected an integer, got "${value}"`);
  return n;
}

export function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function overridesFromEnv(env: LoadInput["env"]): Overrides {
  const out: Overrides = {};
  const get = (key: string) => {
    const value = env[key];
    return value === undefined || value === "" ? undefined : value;
  };
  const config = get("GHBACKUP_CONFIG");
  if (config !== undefined) out.config = config;
  const cacheDir = get("GHBACKUP_CACHE_DIR");
  if (cacheDir !== undefined) out.cacheDir = cacheDir;
  const concurrency = get("GHBACKUP_CONCURRENCY");
  if (concurrency !== undefined)
    out.concurrency = parseInteger("GHBACKUP_CONCURRENCY", concurrency);
  const keep = get("GHBACKUP_KEEP");
  if (keep !== undefined) out.keep = parseInteger("GHBACKUP_KEEP", keep);
  const wiki = get("GHBACKUP_WIKI");
  if (wiki !== undefined) out.wiki = parseBoolean("GHBACKUP_WIKI", wiki);
  const lfs = get("GHBACKUP_LFS");
  if (lfs !== undefined) out.lfs = parseBoolean("GHBACKUP_LFS", lfs);
  const include = get("GHBACKUP_INCLUDE");
  if (include !== undefined) out.include = parseList(include);
  const exclude = get("GHBACKUP_EXCLUDE");
  if (exclude !== undefined) out.exclude = parseList(exclude);
  const target = get("GHBACKUP_TARGETS");
  if (target !== undefined) out.target = parseList(target);
  return out;
}

export function overridesFromFlags(flags: ConfigFlags): Overrides {
  const out: Overrides = {};
  if (flags.config !== undefined) out.config = flags.config;
  if (flags.cacheDir !== undefined) out.cacheDir = flags.cacheDir;
  if (flags.concurrency !== undefined) {
    out.concurrency = parseInteger("--concurrency", flags.concurrency);
  }
  if (flags.keep !== undefined) out.keep = parseInteger("--keep", flags.keep);
  if (flags.wiki !== undefined) out.wiki = flags.wiki;
  if (flags.lfs !== undefined) out.lfs = flags.lfs;
  if (flags.include?.length) out.include = flags.include;
  if (flags.exclude?.length) out.exclude = flags.exclude;
  if (flags.archived !== undefined) out.archived = flags.archived;
  if (flags.forks !== undefined) out.forks = flags.forks;
  if (flags.target?.length) out.target = flags.target;
  if (flags.local !== undefined) out.local = flags.local;
  return out;
}

/** Flag beats environment variable. */
export function mergeOverrides(env: Overrides, flags: Overrides): Overrides {
  return { ...env, ...flags };
}

/** Overrides from the environment and flags together. */
export function resolveOverrides(input: LoadInput): Overrides {
  return mergeOverrides(overridesFromEnv(input.env), overridesFromFlags(input.flags));
}

export function defaultConfigPath(env: LoadInput["env"], home: string): string {
  const xdg = env.XDG_CONFIG_HOME;
  const base = xdg ? xdg : path.join(home, ".config");
  return path.join(base, "github-backup-cli", "config.json");
}

/** Expands `~`, `$VAR` and `${VAR}`, then resolves the result against `cwd`. */
export function expandPath(
  value: string,
  env: LoadInput["env"],
  home: string,
  cwd: string,
): string {
  const withVars = value.replace(
    /\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g,
    (_m, a, b) => {
      const name = (a ?? b) as string;
      const resolved = env[name];
      if (resolved === undefined) {
        throw new ConfigError(`environment variable ${name} is not set (used in "${value}")`);
      }
      return resolved;
    },
  );
  const withHome =
    withVars === "~" || withVars.startsWith("~/") ? home + withVars.slice(1) : withVars;
  return path.resolve(cwd, withHome);
}

/** Absolute path of the config file, whether it exists or not. */
export function resolveConfigPath(input: LoadInput, overrides: Overrides): string {
  const home = input.homeDir ?? homedir();
  const cwd = input.cwd ?? process.cwd();
  return overrides.config === undefined
    ? defaultConfigPath(input.env, home)
    : expandPath(overrides.config, input.env, home, cwd);
}

/** Tells the reader of a target error why no targets exist. */
export function missingConfigHint(file: string | undefined): string {
  if (file === undefined) return "";
  return `; no config file at ${file} (run backup in a terminal to create it)`;
}

type RawConfig = Record<string, unknown>;

/** Applies flag/env overrides onto the raw file contents (pure). */
export function applyOverrides(raw: RawConfig, o: Overrides): RawConfig {
  const out: RawConfig = { ...raw };
  if (o.cacheDir !== undefined) out.cacheDir = o.cacheDir;
  if (o.concurrency !== undefined) out.concurrency = o.concurrency;
  if (o.keep !== undefined) out.keep = o.keep;
  if (o.wiki !== undefined) out.wiki = o.wiki;
  if (o.lfs !== undefined) out.lfs = o.lfs;

  const filterOverrides: RawConfig = {};
  if (o.include !== undefined) filterOverrides.include = o.include;
  if (o.exclude !== undefined) filterOverrides.exclude = o.exclude;
  if (o.archived !== undefined) filterOverrides.archived = o.archived;
  if (o.forks !== undefined) filterOverrides.forks = o.forks;
  if (Object.keys(filterOverrides).length > 0) {
    const sources = Array.isArray(out.sources) ? out.sources : [{ type: "github" }];
    out.sources = sources.map((source: unknown) =>
      isRecord(source) && source.type === "github" ? { ...source, ...filterOverrides } : source,
    );
  }
  return out;
}

function isRecord(value: unknown): value is RawConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const where = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      const keys =
        issue.code === "unrecognized_keys" ? ` ${issue.keys.map((k) => `"${k}"`).join(", ")}` : "";
      return `  - ${where}: ${issue.message}${keys}`;
    })
    .join("\n");
}

function readConfigFile(file: string, explicit: boolean): RawConfig | undefined {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      if (explicit) throw new ConfigError(`config file not found: ${file}`);
      return undefined;
    }
    throw new ConfigError(`cannot read config file ${file}: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ConfigError(`invalid JSON in ${file}: ${(err as Error).message}`);
  }
  if (!isRecord(parsed)) throw new ConfigError(`${file}: the top level must be a JSON object`);
  return parsed;
}

function fileHasS3Keys(raw: RawConfig): boolean {
  const targets = Array.isArray(raw.targets) ? raw.targets : [];
  return targets.some(
    (t) =>
      isRecord(t) &&
      t.type === "s3" &&
      (t.accessKeyId !== undefined || t.secretAccessKey !== undefined),
  );
}

export function loadConfig(input: LoadInput): LoadedConfig {
  const home = input.homeDir ?? homedir();
  const cwd = input.cwd ?? process.cwd();
  const env = input.env;
  const warnings: string[] = [];

  const overrides = resolveOverrides(input);

  const configPath = resolveConfigPath(input, overrides);
  const raw = readConfigFile(configPath, overrides.config !== undefined);
  const missingConfigPath = raw ? undefined : configPath;

  if (raw && fileHasS3Keys(raw)) {
    try {
      if (statSync(configPath).mode & 0o077) {
        warnings.push(
          `${configPath} contains S3 credentials and is readable by other users; run: chmod 600 ${configPath}`,
        );
      }
    } catch {
      // The permission check is best-effort.
    }
  }

  const parsed = configSchema.safeParse(applyOverrides(raw ?? {}, overrides));
  if (!parsed.success) {
    const origin = raw ? configPath : "flags and environment";
    throw new ConfigError(`invalid configuration (${origin}):\n${formatZodError(parsed.error)}`);
  }
  const config = parsed.data;

  config.cacheDir = expandPath(config.cacheDir, env, home, cwd);
  config.targets = config.targets.map((target) => resolveTarget(target, env, home, cwd));

  if (overrides.local !== undefined) {
    if (config.targets.some((t) => t.name === "local")) {
      throw new ConfigError('--local conflicts with a configured target named "local"');
    }
    config.targets.push({
      type: "local",
      name: "local",
      path: expandPath(overrides.local, env, home, cwd),
    });
  }

  if (overrides.target !== undefined) {
    const known = new Set(config.targets.map((t) => t.name));
    const unknown = overrides.target.filter((name) => !known.has(name));
    if (unknown.length > 0) {
      const available = [...known].join(", ") || "none configured";
      throw new ConfigError(
        `unknown target ${unknown.map((n) => `"${n}"`).join(", ")} (available: ${available})` +
          missingConfigHint(missingConfigPath),
      );
    }
    config.targets = config.targets.filter((t) => overrides.target?.includes(t.name));
  }

  const secrets: string[] = [];
  for (const target of config.targets) {
    if (target.type !== "s3") continue;
    target.accessKeyId ??= env.GHBACKUP_S3_ACCESS_KEY_ID || undefined;
    target.secretAccessKey ??= env.GHBACKUP_S3_SECRET_ACCESS_KEY || undefined;
    if (target.accessKeyId) secrets.push(target.accessKeyId);
    if (target.secretAccessKey) secrets.push(target.secretAccessKey);
  }

  return {
    config,
    configPath: raw ? configPath : undefined,
    missingConfigPath,
    warnings,
    secrets,
  };
}

function resolveTarget(
  target: TargetConfig,
  env: LoadInput["env"],
  home: string,
  cwd: string,
): TargetConfig {
  if (target.type === "local") return { ...target, path: expandPath(target.path, env, home, cwd) };
  return target;
}
