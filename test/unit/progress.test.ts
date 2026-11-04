import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ActiveUnit,
  createProgressDisplay,
  formatDuration,
  type ProgressState,
  renderProgress,
} from "../../src/util/progress.js";

const SIZE = { columns: 100, rows: 24 };

const unit = (key: string, label = "fetching", startedAt = 0): ActiveUnit => ({
  key,
  label,
  startedAt,
  from: 0,
  to: 0,
});

const state = (extra: Partial<ProgressState> = {}): ProgressState => ({
  total: 4,
  counts: { ok: 0, unchanged: 0, skipped: 0, failed: 0 },
  active: [],
  ...extra,
});

describe("formatDuration", () => {
  it.each([
    [0, "0s"],
    [59_999, "59s"],
    [60_000, "1m 0s"],
    [125_000, "2m 5s"],
  ])("%d ms", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe("renderProgress", () => {
  it("shows the finished share and only the counts that are not zero", () => {
    const counts = { ok: 1, unchanged: 0, skipped: 0, failed: 1 };
    const [overall] = renderProgress(state({ counts }), SIZE, 0);
    expect(overall).toBe(`[${"█".repeat(15)}${"░".repeat(15)}] 2/4 50%  ok 1 · failed 1`);
  });

  it("counts the finished share of units in flight in the overall bar", () => {
    const counts = { ok: 1, unchanged: 0, skipped: 0, failed: 0 };
    const active = [{ ...unit("a"), from: 0, to: 0.4, percent: 50 }];
    const [overall] = renderProgress(state({ total: 2, counts, active }), SIZE, 0);
    expect(overall).toContain("1/2 60%");
  });

  it("uses the start of a phase that reports no percentage", () => {
    const active = [{ ...unit("a"), from: 0.5, to: 0.8 }];
    expect(renderProgress(state({ total: 1, active }), SIZE, 0)[0]).toContain("0/1 50%");
  });

  it("does not divide by zero without units", () => {
    expect(renderProgress(state({ total: 0 }), SIZE, 0)[0]).toContain("0/0 0%");
  });

  it("lists units in flight with their phase and running time", () => {
    const active = [unit("github/acme/app", "bundling", 1000)];
    expect(renderProgress(state({ active }), SIZE, 3000)[1]).toBe(
      `  ${"bundling".padEnd(20)} ${" ".repeat(19)} github/acme/app  2s`,
    );
  });

  it("draws a bar for a unit whose phase reports a percentage", () => {
    const active = [{ ...unit("github/acme/app"), percent: 50 }];
    expect(renderProgress(state({ active }), SIZE, 0)[1]).toBe(
      `  ${"fetching".padEnd(20)} [${"█".repeat(6)}${"░".repeat(6)}] 50%  github/acme/app  0s`,
    );
  });

  it("keeps the key in the same column at every percentage", () => {
    const column = (percent: number) =>
      renderProgress(state({ active: [{ ...unit("key"), percent }] }), SIZE, 0)[1]?.indexOf("key");
    expect(column(5)).toBe(column(100));
  });

  it("keeps every line shorter than the terminal is wide", () => {
    const active = [unit(`github/acme/${"x".repeat(200)}`)];
    const counts = { ok: 100, unchanged: 200, skipped: 300, failed: 400 };
    const lines = renderProgress(
      state({ total: 1000, counts, active }),
      { ...SIZE, columns: 40 },
      0,
    );
    expect(lines.map((line) => line.length <= 39)).toEqual([true, true]);
  });

  it("keeps the block shorter than the terminal is high", () => {
    const active = ["a", "b", "c", "d", "e"].map((key) => unit(key));
    const lines = renderProgress(state({ active }), { ...SIZE, rows: 5 }, 0);
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe("  … and 3 more");
  });

  it("shows every unit when they fit exactly", () => {
    const active = ["a", "b", "c"].map((key) => unit(key));
    const lines = renderProgress(state({ active }), { ...SIZE, rows: 5 }, 0);
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain("c");
  });
});

describe("createProgressDisplay", () => {
  const ERASE_2 = "\x1b[2A\r\x1b[J";
  let writes: string[];
  const display = () =>
    createProgressDisplay({ write: (text) => writes.push(text), size: () => SIZE });

  beforeEach(() => {
    writes = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes plain lines before it starts and after it stops", () => {
    const progress = display();
    progress.log("before");
    expect(writes).toEqual(["before\n"]);

    progress.start(1);
    progress.stop();
    writes.length = 0;
    progress.log("after");
    expect(writes).toEqual(["after\n"]);
  });

  it("prints log lines above the block in a single write", () => {
    const progress = display();
    progress.start(2);
    progress.unitStart("github/acme/app");
    vi.advanceTimersByTime(100);
    writes.length = 0;

    progress.log("INFO hello");

    expect(writes).toHaveLength(1);
    const write = writes[0] as string;
    expect(write.startsWith(`${ERASE_2}INFO hello\n[`)).toBe(true);
    expect(write).toContain("github/acme/app");
  });

  it("redraws only when the block changed", () => {
    const progress = display();
    progress.start(2);
    writes.length = 0;

    vi.advanceTimersByTime(500);
    expect(writes).toEqual([]);

    progress.unitStart("github/acme/app");
    vi.advanceTimersByTime(100);
    expect(writes).toHaveLength(1);
    progress.stop();
  });

  it("removes finished units and counts them", () => {
    const progress = display();
    progress.start(2);
    progress.unitStart("github/acme/app");
    progress.phase("github/acme/app", "bundling", 0, 1);
    vi.advanceTimersByTime(100);
    expect(writes.at(-1)).toContain("bundling");

    progress.unitDone("github/acme/app", "ok");
    vi.advanceTimersByTime(100);

    expect(writes.at(-1)).toContain("1/2 50%  ok 1");
    expect(writes.at(-1)).not.toContain("github/acme/app");
    progress.stop();
  });

  it("moves the bars with the percentage and clears it when the phase changes", () => {
    const progress = display();
    progress.start(1);
    progress.unitStart("github/acme/app");
    progress.phase("github/acme/app", "fetching", 0, 0.5);
    progress.percent("github/acme/app", 40);
    vi.advanceTimersByTime(100);
    expect(writes.at(-1)).toContain("0/1 20%");
    expect(writes.at(-1)).toContain("] 40%");

    progress.phase("github/acme/app", "checking targets", 0.5, 0.5);
    vi.advanceTimersByTime(100);
    expect(writes.at(-1)).toContain("0/1 50%");
    expect(writes.at(-1)).not.toContain("] 40%");
    progress.stop();
  });

  it("erases the block once and stops redrawing", () => {
    const progress = display();
    progress.start(2);
    progress.unitStart("github/acme/app");
    vi.advanceTimersByTime(100);
    writes.length = 0;

    progress.stop();
    progress.stop();
    progress.unitDone("github/acme/app", "ok");
    vi.advanceTimersByTime(1000);

    expect(writes.join("")).toBe(ERASE_2);
  });
});
