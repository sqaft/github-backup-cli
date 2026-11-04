import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { CliError, ExitCode } from "../../src/util/errors.js";
import { createTerminalPrompter } from "../../src/util/prompt.js";

const CTRL_C = "\x03";

describe("createTerminalPrompter", () => {
  it("cancels a pending question on Ctrl-C", async () => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const input = new PassThrough();
    const prompter = createTerminalPrompter(input);
    const answer = prompter.ask("Name: ");
    input.write(CTRL_C);
    await expect(answer).rejects.toMatchObject({ exitCode: ExitCode.Interrupted });
    vi.restoreAllMocks();
  });

  it("cancels the next question after Ctrl-C between questions", async () => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const input = new PassThrough();
    const prompter = createTerminalPrompter(input);
    input.write(CTRL_C);
    await new Promise((resolve) => setImmediate(resolve));
    const failure = await prompter.ask("Name: ").catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(CliError);
    expect(failure).toMatchObject({ exitCode: ExitCode.Interrupted });
    vi.restoreAllMocks();
  });
});
