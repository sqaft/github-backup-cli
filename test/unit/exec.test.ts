import { describe, expect, it } from "vitest";
import { ExecError, exec, redactUrls } from "../../src/util/exec.js";

describe("redactUrls", () => {
  it.each([
    ["clone https://user:secret@github.com/a/b.git", "clone https://github.com/a/b.git"],
    ["https://x-access-token@github.com/a/b", "https://github.com/a/b"],
    ["no urls here a@b", "no urls here a@b"],
  ])("%s", (input, expected) => {
    expect(redactUrls(input)).toBe(expected);
  });
});

describe("exec", () => {
  it("reports stderr lines as they arrive, split at carriage returns", async () => {
    const lines: string[] = [];
    await exec(
      "node",
      [
        "-e",
        "process.stderr.write('a 1%\\ra 2'); setTimeout(() => process.stderr.write('%\\nb\\n'), 20)",
      ],
      { onStderrLine: (line) => lines.push(line) },
    );
    expect(lines).toEqual(["a 1%", "a 2%", "b"]);
  });

  it("keeps only the last state of overwritten lines in errors", async () => {
    const script = "process.stderr.write('a 1%\\ra 2%\\rdone\\nfatal: boom\\n'); process.exit(1)";
    const err = (await exec("node", ["-e", script]).catch((e: unknown) => e)) as ExecError;
    expect(err.stderr).toBe("done\nfatal: boom");
  });

  it("captures stdout and merges env", async () => {
    const result = await exec("node", ["-e", "process.stdout.write(process.env.FOO ?? '')"], {
      env: { FOO: "bar" },
    });
    expect(result.stdout).toBe("bar");
  });

  it("rejects with command and stderr on non-zero exit", async () => {
    const err = await exec("node", ["-e", "console.error('boom'); process.exit(3)"]).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ExecError);
    const execError = err as ExecError;
    expect(execError.code).toBe(3);
    expect(execError.stderr).toBe("boom");
    expect(execError.message).toContain("node");
    expect(execError.message).toContain("boom");
  });

  it("reports a missing binary as ENOENT", async () => {
    const err = (await exec("definitely-not-a-real-binary", []).catch(
      (e: unknown) => e,
    )) as ExecError;
    expect(err.code).toBe("ENOENT");
  });

  it("kills the process on timeout", async () => {
    const err = (await exec("node", ["-e", "setTimeout(() => {}, 10000)"], {
      timeoutMs: 100,
    }).catch((e: unknown) => e)) as ExecError;
    expect(err.code).toBe("ETIMEDOUT");
  });
});
