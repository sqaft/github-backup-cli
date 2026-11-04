import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ansi } from "../../src/util/color.js";
import {
  type ActiveUnit,
  createProgressDisplay,
  formatDuration,
  type ProgressState,
  renderActivity,
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
  startedAt: 0,
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
    [3_599_000, "59m 59s"],
    [3_600_000, "1h 0m"],
    [3_660_000, "1h 1m"],
    [3_719_000, "1h 1m"],
    [90_000_000, "25h 0m"],
  ])("%d ms", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe("renderProgress", () => {
  it("shows the finished share and the elapsed time", () => {
    const counts = { ok: 1, unchanged: 0, skipped: 0, failed: 1 };
    const [overall] = renderProgress(state({ counts }), SIZE, 2000);
    expect(overall).toBe(`[${"█".repeat(15)}${"░".repeat(15)}] 2/4 50%  2s`);
  });

  it("shows the remaining time once there is enough progress and time", () => {
    const counts = { ok: 1, unchanged: 0, skipped: 0, failed: 0 };
    const [overall] = renderProgress(state({ counts }), SIZE, 60_000);
    expect(overall).toContain("1/4 25%  1m 0s  ~3m 0s left");
  });

  it.each([
    ["too little time has passed", 4999, 1],
    ["the progress is below 2%", 60_000, 0],
    ["everything is done", 60_000, 4],
  ])("shows no estimate when %s", (_name, now, ok) => {
    const counts = { ok, unchanged: 0, skipped: 0, failed: 0 };
    const [overall] = renderProgress(state({ counts }), SIZE, now);
    expect(overall).not.toContain("left");
  });

  it("shows the estimate from the start time of the run", () => {
    const counts = { ok: 2, unchanged: 0, skipped: 0, failed: 0 };
    const [overall] = renderProgress(state({ counts, startedAt: 100_000 }), SIZE, 110_000);
    expect(overall).toContain("2/4 50%  10s  ~10s left");
  });

  it("puts the counts on a second line, in order, leaving out zeros", () => {
    const counts = { ok: 9, unchanged: 5, skipped: 0, failed: 2 };
    const lines = renderProgress(state({ total: 40, counts }), SIZE, 0);
    expect(lines).toEqual([
      expect.stringContaining("16/40 40%"),
      "  backed up 9 · unchanged 5 · failed 2",
    ]);
  });

  it("shows no counts line without counts", () => {
    expect(renderProgress(state(), SIZE, 0)).toHaveLength(1);
  });

  it("drops the counts line on a terminal under 5 rows and keeps the unit area", () => {
    const counts = { ok: 1, unchanged: 0, skipped: 0, failed: 0 };
    const active = ["a", "b", "c", "d"].map((key) => unit(key));
    const tight = renderProgress(state({ counts, active }), { ...SIZE, rows: 4 }, 0);
    expect(tight).toHaveLength(3);
    expect(tight.some((line) => line.includes("backed up"))).toBe(false);
    expect(tight[2]).toBe("  … and 3 more");
  });

  it("makes room for the counts line and stays shorter than the terminal", () => {
    const counts = { ok: 1, unchanged: 0, skipped: 0, failed: 0 };
    const active = ["a", "b", "c", "d", "e"].map((key) => unit(key));
    const lines = renderProgress(state({ counts, active }), { ...SIZE, rows: 5 }, 0);
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe("  backed up 1");
    expect(lines[3]).toBe("  … and 4 more");
  });

  it("sizes the bar to the terminal", () => {
    const barWidth = (columns: number) =>
      (renderProgress(state(), { ...SIZE, columns }, 0)[0] as string).indexOf("]") - 1;
    expect(barWidth(200)).toBe(30);
    expect(barWidth(60)).toBe(20);
    expect(barWidth(20)).toBe(10);
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
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => line.length <= 39)).toEqual([true, true, true]);
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

const ESC = String.fromCharCode(27);
const escapes = (codes: string): RegExp => new RegExp(`${ESC}\\[(?:${codes})m`, "g");
const strip = (text: string): string => text.replace(escapes("\\d+"), "");

describe("renderProgress with color", () => {
  const counts = { ok: 9, unchanged: 5, skipped: 1, failed: 2 };
  const active = [
    { ...unit(`github/acme/${"x".repeat(20)}`, "bundling", 0), percent: 50 },
    unit("b"),
    unit("c"),
    unit("d"),
  ];
  const painted = (columns: number, rows = 24) =>
    renderProgress(state({ total: 40, counts, active }), { columns, rows }, 130_000, ansi);

  it("colors the parts and leaves the text as it is", () => {
    const lines = painted(120);
    const plainLines = renderProgress(
      state({ total: 40, counts, active }),
      { columns: 120, rows: 24 },
      130_000,
    );
    expect(lines.map(strip)).toEqual(plainLines);
    expect(lines[0]).toContain(ansi("green", "█".repeat(13)));
    expect(lines[0]).toContain(ansi("dim", "░".repeat(17)));
    expect(lines[0]).toContain(ansi("dim", "  ~2m 55s left"));
    expect(lines[1]).toContain(ansi("green", "backed up 9"));
    expect(lines[1]).toContain(ansi("dim", "unchanged 5"));
    expect(lines[1]).toContain(ansi("dim", "skipped 1"));
    expect(lines[1]).toContain(ansi("red", "failed 2"));
    expect(lines[2]).toContain(ansi("dim", "2m 10s"));
  });

  it("colors the bar of a unit and the overflow line", () => {
    const lines = painted(120, 6);
    expect(lines[2]).toContain(ansi("green", "█".repeat(6)));
    expect(lines[2]).toContain(ansi("dim", "░".repeat(6)));
    expect(lines.at(-1)).toBe(ansi("dim", "  … and 2 more"));
  });

  it("never exceeds the width once the escape codes are removed", () => {
    for (let columns = 1; columns <= 160; columns++) {
      for (const line of painted(columns)) {
        expect(strip(line).length).toBeLessThanOrEqual(Math.max(columns - 1, 1));
      }
    }
  });

  it("keeps every escape code closed, wherever a line is cut", () => {
    for (let columns = 1; columns <= 160; columns++) {
      for (const line of painted(columns)) {
        const opens = (line.match(escapes("2|32|31")) ?? []).length;
        const closes = (line.match(escapes("22|39")) ?? []).length;
        expect(opens).toBe(closes);
      }
    }
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

    expect(writes.at(-1)).toContain("1/2 50%");
    expect(writes.at(-1)).toContain("backed up 1");
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

  it("paints the block and erases the extra counts line", () => {
    const progress = createProgressDisplay({
      write: (text) => writes.push(text),
      size: () => SIZE,
      paint: ansi,
    });
    progress.start(2);
    progress.unitStart("github/acme/app");
    progress.unitStart("github/acme/lib");
    progress.unitDone("github/acme/lib", "ok");
    vi.advanceTimersByTime(100);
    expect(writes.at(-1)).toContain(ansi("green", "backed up 1"));

    writes.length = 0;
    progress.stop();
    expect(writes.join("")).toBe("\x1b[3A\r\x1b[J");
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

describe("renderActivity", () => {
  const activity = { label: "Listing repositories", startedAt: 0 };

  it("shows a spinner and the label, without a time at first", () => {
    expect(renderActivity(activity, SIZE, 0)).toBe("⠋ Listing repositories...");
  });

  it("adds the running time after a second", () => {
    expect(renderActivity(activity, SIZE, 12_000)).toBe("⠋ Listing repositories...  12s");
  });

  it("turns the spinner with time", () => {
    expect(renderActivity(activity, SIZE, 100)).toMatch(/^⠙ /);
  });

  it("fits the terminal width before it paints", () => {
    const line = renderActivity(activity, { ...SIZE, columns: 10 }, 0, ansi);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strips the escape codes under test
    expect(line.replace(/\x1b\[\d+m/g, "")).toHaveLength(9);
  });
});

describe("activity line", () => {
  let writes: string[];
  const display = () =>
    createProgressDisplay({ write: (text) => writes.push(text), size: () => SIZE });

  beforeEach(() => {
    writes = [];
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("draws at once and keeps turning", () => {
    const progress = display();
    progress.activity("Checking tools");
    expect(writes).toEqual(["⠋ Checking tools...\n"]);

    vi.advanceTimersByTime(100);
    expect(writes.at(-1)).toContain("⠙ Checking tools...");
    progress.stop();
  });

  it("restarts the time when the label changes, not when it repeats", () => {
    const progress = display();
    progress.activity("Listing repositories");
    vi.advanceTimersByTime(3000);
    progress.activity("Listing repositories");
    expect(writes.at(-1)).toContain("3s");

    progress.activity("Preparing");
    expect(writes.at(-1)).toContain("Preparing...\n");
    expect(writes.at(-1)).not.toContain("3s");
    progress.stop();
  });

  it("prints log lines above the line", () => {
    const progress = display();
    progress.activity("Listing repositories");
    writes.length = 0;
    progress.log("WARN careful");
    expect(writes[0]).toBe("\x1b[1A\r\x1b[JWARN careful\n⠋ Listing repositories...\n");
    progress.stop();
  });

  it("gives way to the block on start, with a single timer", () => {
    const progress = display();
    progress.activity("Preparing");
    progress.start(2);
    expect(writes.at(-1)).toContain("0/2 0%");
    expect(writes.at(-1)).not.toContain("Preparing");
    expect(vi.getTimerCount()).toBe(1);
    progress.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("erases the line on stop", () => {
    const progress = display();
    progress.activity("Preparing");
    progress.stop();
    expect(writes.at(-1)).toBe("\x1b[1A\r\x1b[J");
  });
});
