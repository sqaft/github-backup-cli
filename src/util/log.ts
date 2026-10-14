export type LogLevel = "quiet" | "normal" | "verbose";

type Severity = "error" | "warn" | "info" | "debug";

export interface Logger {
  error(message: string, scope?: string): void;
  warn(message: string, scope?: string): void;
  info(message: string, scope?: string): void;
  /** Printed only with `--verbose` (git commands and other detail). */
  debug(message: string, scope?: string): void;
  /** Printed at every level, including quiet (end-of-run summary). */
  summary(message: string): void;
  /** Values (tokens, keys) replaced with `***` in every later message. */
  addSecret(value: string | undefined): void;
}

export interface LoggerOptions {
  level: LogLevel;
  write?: (line: string) => void;
  now?: () => Date;
}

const SHOWN: Record<LogLevel, readonly Severity[]> = {
  quiet: ["error"],
  normal: ["error", "warn", "info"],
  verbose: ["error", "warn", "info", "debug"],
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function createLogger(options: LoggerOptions): Logger {
  const write = options.write ?? ((line: string) => process.stderr.write(`${line}\n`));
  const now = options.now ?? (() => new Date());
  const secrets = new Set<string>();

  const mask = (text: string): string => {
    let out = text;
    for (const secret of secrets) out = out.split(secret).join("***");
    return out;
  };

  const emit = (severity: Severity, message: string, scope?: string): void => {
    if (!SHOWN[options.level].includes(severity)) return;
    const label = severity.toUpperCase().padEnd(5);
    const prefix = scope ? `${scope}: ` : "";
    write(mask(`[${formatTime(now())}] ${label} ${prefix}${message}`));
  };

  return {
    error: (message, scope) => emit("error", message, scope),
    warn: (message, scope) => emit("warn", message, scope),
    info: (message, scope) => emit("info", message, scope),
    debug: (message, scope) => emit("debug", message, scope),
    summary: (message) => write(mask(message)),
    addSecret(value) {
      if (value) secrets.add(value);
    },
  };
}
