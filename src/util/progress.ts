import type { UnitStatus } from "../core/run.js";

/** Receives the state of a backup run; every unit gets `unitStart` and one `unitDone`. */
export interface ProgressReporter {
  /** `total` counts repositories and wikis. */
  start(total: number): void;
  unitStart(key: string): void;
  /** The phase takes the unit from share `from` to share `to` of its work (0 to 1). */
  phase(key: string, label: string, from: number, to: number): void;
  /** How far the current phase is (0 to 100). Phases that cannot tell never call this. */
  percent(key: string, percent: number): void;
  unitDone(key: string, status: UnitStatus): void;
}

/** A progress block on a terminal. Other output must go through `log` while it is drawn. */
export interface ProgressDisplay extends ProgressReporter {
  /** Prints a line above the block. Without a drawn block it is a plain write. */
  log(line: string): void;
  /** Removes the block. Safe to call more than once. */
  stop(): void;
}

export interface TerminalSize {
  columns: number;
  rows: number;
}

export interface ProgressDisplayOptions {
  /** Raw terminal output; nothing is appended to the text. */
  write: (text: string) => void;
  size: () => TerminalSize;
}

export interface ActiveUnit {
  key: string;
  label: string;
  startedAt: number;
  /** Shares of the unit's work where the current phase starts and ends. */
  from: number;
  to: number;
  /** Percentage of the current phase, when it reports one. */
  percent?: number;
}

export interface ProgressState {
  total: number;
  counts: Record<UnitStatus, number>;
  active: ActiveUnit[];
}

const REDRAW_MS = 100;
const MAX_BAR_WIDTH = 30;
const MIN_BAR_WIDTH = 10;
/** Room the overall line needs next to the bar for its counts. */
const COUNTS_WIDTH = 50;
const LABEL_WIDTH = 20;
const UNIT_BAR_WIDTH = 12;
/** `[bar] 100%` */
const UNIT_METER_WIDTH = UNIT_BAR_WIDTH + 7;
const STATUS_ORDER: readonly UnitStatus[] = ["ok", "unchanged", "skipped", "failed"];

function renderBar(ratio: number, width: number): string {
  const filled = Math.round(ratio * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const unitShare = (unit: ActiveUnit): number =>
  unit.from + (unit.to - unit.from) * ((unit.percent ?? 0) / 100);

function renderUnitMeter(percent: number | undefined): string {
  if (percent === undefined) return " ".repeat(UNIT_METER_WIDTH);
  const meter = `${renderBar(percent / 100, UNIT_BAR_WIDTH)} ${percent}%`;
  return meter.padEnd(UNIT_METER_WIDTH);
}

function renderOverall(state: ProgressState, columns: number): string {
  const done = STATUS_ORDER.reduce((sum, status) => sum + state.counts[status], 0);
  const inFlight = state.active.reduce((sum, unit) => sum + unitShare(unit), 0);
  const ratio = state.total === 0 ? 0 : (done + inFlight) / state.total;
  const width = Math.max(MIN_BAR_WIDTH, Math.min(MAX_BAR_WIDTH, columns - COUNTS_WIDTH));
  const counts = STATUS_ORDER.filter((status) => state.counts[status] > 0)
    .map((status) => `${status} ${state.counts[status]}`)
    .join(" · ");
  const bar = `${renderBar(ratio, width)} ${done}/${state.total} ${Math.floor(ratio * 100)}%`;
  return counts ? `${bar}  ${counts}` : bar;
}

/**
 * The lines of the progress block: the overall bar, which also counts the finished share of
 * units in flight, then one line per such unit.
 * Lines fit the terminal width, because a wrapped line would break the redraw, and the
 * block stays shorter than the terminal, because lines scrolled away cannot be cleared.
 */
export function renderProgress(state: ProgressState, size: TerminalSize, now: number): string[] {
  const maxUnits = Math.max(size.rows - 2, 1);
  const overflow = state.active.length > maxUnits;
  const shown = overflow ? state.active.slice(0, maxUnits - 1) : state.active;
  const lines = [
    renderOverall(state, size.columns),
    ...shown.map(
      (unit) =>
        `  ${unit.label.padEnd(LABEL_WIDTH)} ${renderUnitMeter(unit.percent)} ${unit.key}  ` +
        formatDuration(now - unit.startedAt),
    ),
  ];
  if (overflow) lines.push(`  … and ${state.active.length - shown.length} more`);
  return lines.map((line) => line.slice(0, Math.max(size.columns - 1, 1)));
}

export function createProgressDisplay(options: ProgressDisplayOptions): ProgressDisplay {
  const state: ProgressState = {
    total: 0,
    counts: { ok: 0, unchanged: 0, skipped: 0, failed: 0 },
    active: [],
  };
  let timer: NodeJS.Timeout | undefined;
  let lastFrame = "";
  let drawnLines = 0;

  const findUnit = (key: string) => state.active.find((unit) => unit.key === key);

  /** Moves to the top of the drawn block and erases it. */
  const eraseBlock = (): string => (drawnLines > 0 ? `\x1b[${drawnLines}A\r\x1b[J` : "");

  const renderFrame = (): string =>
    renderProgress(state, options.size(), Date.now())
      .map((line) => `${line}\n`)
      .join("");

  /** Writes everything in one call so a redraw never shows a half-cleared block. */
  const draw = (above = ""): void => {
    const frame = renderFrame();
    if (above === "" && frame === lastFrame) return;
    options.write(`${eraseBlock()}${above}${frame}`);
    lastFrame = frame;
    drawnLines = frame.split("\n").length - 1;
  };

  return {
    start(total) {
      state.total = total;
      draw();
      timer = setInterval(draw, REDRAW_MS);
      timer.unref();
    },
    unitStart(key) {
      state.active.push({ key, label: "starting", startedAt: Date.now(), from: 0, to: 0 });
    },
    phase(key, label, from, to) {
      const unit = findUnit(key);
      if (!unit) return;
      unit.label = label;
      unit.from = from;
      unit.to = to;
      unit.percent = undefined;
    },
    percent(key, percent) {
      const unit = findUnit(key);
      if (unit) unit.percent = percent;
    },
    unitDone(key, status) {
      state.active = state.active.filter((unit) => unit.key !== key);
      state.counts[status]++;
    },
    log(line) {
      if (timer) draw(`${line}\n`);
      else options.write(`${line}\n`);
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
      if (drawnLines > 0) options.write(eraseBlock());
      drawnLines = 0;
    },
  };
}

/** Draws on stderr, leaving stdout free for `--json`. */
export function createStderrProgress(): ProgressDisplay {
  return createProgressDisplay({
    write: (text) => process.stderr.write(text),
    size: () => ({ columns: process.stderr.columns ?? 80, rows: process.stderr.rows ?? 24 }),
  });
}
