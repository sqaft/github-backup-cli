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
