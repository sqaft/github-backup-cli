import { CliError, ExitCode } from "../util/errors.js";
import type { CommandDeps, CommonOptions } from "./context.js";

export interface BackupOptions extends CommonOptions {}

/** `github-backup backup`. Mirroring and snapshots arrive in a later phase. */
export async function runBackup(_options: BackupOptions, _deps: CommandDeps): Promise<number> {
  throw new CliError("backup is not implemented yet", ExitCode.Usage);
}
