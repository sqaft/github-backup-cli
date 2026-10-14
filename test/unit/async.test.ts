import { describe, expect, it } from "vitest";
import { runPool, withRetry } from "../../src/util/async.js";

describe("withRetry", () => {
  it("returns the first success without waiting", async () => {
    const waits: number[] = [];
    const result = await withRetry(async () => "ok", {
      delaysMs: [1000, 5000],
      sleep: async (ms) => void waits.push(ms),
    });
    expect(result).toBe("ok");
    expect(waits).toEqual([]);
  });

  it("retries twice with the configured delays, then succeeds", async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await withRetry(
      async () => {
        if (++calls < 3) throw new Error("boom");
        return calls;
      },
      { delaysMs: [1000, 5000], sleep: async (ms) => void waits.push(ms) },
    );
    expect(result).toBe(3);
    expect(waits).toEqual([1000, 5000]);
  });

  it("throws the last error after the retries are used up", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          throw new Error(`fail ${++calls}`);
        },
        { delaysMs: [1, 1], sleep: async () => {} },
      ),
    ).rejects.toThrow("fail 3");
  });

  it("does not retry once aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("x");
        },
        { delaysMs: [1, 1], sleep: async () => {}, signal: controller.signal },
      ),
    ).rejects.toThrow("x");
    expect(calls).toBe(1);
  });
});

describe("runPool", () => {
  it("never exceeds the limit and keeps input order", async () => {
    let active = 0;
    let peak = 0;
    const results = await runPool([5, 1, 4, 2, 3, 6], 3, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, n));
      active--;
      return n * 2;
    });
    expect(results).toEqual([10, 2, 8, 4, 6, 12]);
    expect(peak).toBe(3);
  });

  it("starts no new items after the signal aborts", async () => {
    const controller = new AbortController();
    const started: number[] = [];
    const results = await runPool(
      [1, 2, 3, 4],
      1,
      async (n) => {
        started.push(n);
        if (n === 2) controller.abort();
        return n;
      },
      controller.signal,
    );
    expect(started).toEqual([1, 2]);
    expect(results).toEqual([1, 2]);
  });

  it("handles an empty list", async () => {
    expect(await runPool([], 4, async (n: number) => n)).toEqual([]);
  });
});
