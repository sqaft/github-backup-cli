/** Process exit codes shared by all commands. */
export const ExitCode = {
  Success: 0,
  PartialFailure: 1,
  Usage: 2,
  Locked: 3,
  Interrupted: 130,
} as const;

/** An error that ends the command with a specific exit code and a readable message. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Invalid configuration, flag or environment value. */
export class ConfigError extends CliError {
  constructor(message: string) {
    super(message, ExitCode.Usage);
  }
}

/** A required external tool or login is missing. */
export class PrerequisiteError extends CliError {
  constructor(message: string) {
    super(message, ExitCode.Usage);
  }
}
