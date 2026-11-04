import { describe, expect, it } from "vitest";
import { createGit, parseTransferPercent } from "../../src/core/git.js";
import type { Exec } from "../../src/util/exec.js";

describe("parseTransferPercent", () => {
  it.each([
    ["Receiving objects:  45% (450/1000), 1.20 MiB | 2.00 MiB/s", 45],
    ["Unpacking objects: 100% (3/3), 210 bytes | 210.00 KiB/s, done.", 100],
    ["Writing objects:   7% (7/100)", 7],
    ["remote: Counting objects:  50% (1/2)", undefined],
    ["Resolving deltas:  50% (1/2)", undefined],
    ["Compressing objects:  50% (1/2)", undefined],
    ["fatal: repository not found", undefined],
  ])("%s", (line, expected) => {
    expect(parseTransferPercent(line)).toBe(expected);
  });
});

describe("createGit", () => {
  it("forces English output and forwards percentages when asked for them", async () => {
    const percents: number[] = [];
    const seen: Array<Parameters<Exec>[2]> = [];
    const exec: Exec = async (_cmd, _args, opts) => {
      seen.push(opts);
      opts?.onStderrLine?.("Receiving objects:  45% (450/1000)");
      opts?.onStderrLine?.("remote: Counting objects:  50% (1/2)");
      return { stdout: "", stderr: "" };
    };
    const git = createGit({ exec, env: { A: "1" } });

    await git(["fetch"], { onPercent: (percent) => percents.push(percent) });
    await git(["status"]);

    expect(percents).toEqual([45]);
    expect(seen[0]?.env).toEqual({ A: "1", LC_ALL: "C" });
    expect(seen[1]?.env).toEqual({ A: "1" });
    expect(seen[1]?.onStderrLine).toBeUndefined();
  });
});
