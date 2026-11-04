import type { UnitStatus } from "../core/run.js";
import { type Paint, plain, type Style } from "./color.js";

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
  /** Shows a spinner line naming the work under way, until `start`, `stop` or the next call. */
  activity(label: string): void;
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
  /** Colors the block. Without it the block is plain text. */
  paint?: Paint;
}

/** Work under way before the units start. */
export interface Activity {
  label: string;
  startedAt: number;
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
  /** `Date.now()` when the run started. */
  startedAt: number;
  counts: Record<UnitStatus, number>;
  active: ActiveUnit[];
}

const REDRAW_MS = 100;
const MAX_BAR_WIDTH = 30;
const MIN_BAR_WIDTH = 10;
/** Room the overall line needs besides its bar, at its widest, plus the unused last column. */
const OVERALL_RESERVED = "[] 999/999 100%  59m 59s  ~59m 59s left".length + 1;
const LABEL_WIDTH = 20;
const UNIT_BAR_WIDTH = 12;
/** `[bar] 100%` */
const UNIT_METER_WIDTH = UNIT_BAR_WIDTH + 7;
/** The estimate needs this much progress and time to be worth showing. */
const ETA_MIN_RATIO = 0.02;
const ETA_MIN_ELAPSED_MS = 5000;
/** The counts line is skipped on terminals this short. */
const COUNTS_MIN_ROWS = 5;
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const SPINNER_FRAME_MS = 100;
/** Quick steps do not flash a time. */
const ACTIVITY_MIN_ELAPSED_MS = 1000;
const STATUS_ORDER: readonly UnitStatus[] = ["ok", "unchanged", "skipped", "failed"];
const STATUS_LABEL: Record<UnitStatus, string> = {
  ok: "backed up",
  unchanged: "unchanged",
  skipped: "skipped",
  failed: "failed",
};
const STATUS_STYLE: Record<UnitStatus, Style> = {
  ok: "green",
  unchanged: "dim",
  skipped: "dim",
  failed: "red",
};

/** A piece of a line. Lines are cut to the terminal width as parts, before any style is applied. */
interface Part {
  text: string;
  style?: Style;
}

/** Cutting a string that holds escape codes would corrupt the terminal, so cut the parts. */
function cutParts(parts: Part[], width: number): Part[] {
  const fitted: Part[] = [];
  let left = width;
  for (const part of parts) {
    if (left <= 0) break;
    const text = part.text.slice(0, left);
    if (text === "") continue;
    fitted.push({ ...part, text });
    left -= text.length;
  }
  return fitted;
}

const paintParts = (parts: Part[], paint: Paint): string =>
  parts.map((part) => (part.style ? paint(part.style, part.text) : part.text)).join("");

function barParts(ratio: number, width: number): Part[] {
  const filled = Math.round(ratio * width);
  return [
    { text: "[" },
    { text: "█".repeat(filled), style: "green" },
    { text: "░".repeat(width - filled), style: "dim" },
    { text: "]" },
  ];
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const unitShare = (unit: ActiveUnit): number =>
  unit.from + (unit.to - unit.from) * ((unit.percent ?? 0) / 100);

function unitMeterParts(percent: number | undefined): Part[] {
  if (percent === undefined) return [{ text: " ".repeat(UNIT_METER_WIDTH) }];
  const label = ` ${percent}%`;
  return [
    ...barParts(percent / 100, UNIT_BAR_WIDTH),
    { text: label.padEnd(UNIT_METER_WIDTH - UNIT_BAR_WIDTH - 2) },
  ];
}

function overallParts(state: ProgressState, columns: number, now: number): Part[] {
  const done = STATUS_ORDER.reduce((sum, status) => sum + state.counts[status], 0);
  const inFlight = state.active.reduce((sum, unit) => sum + unitShare(unit), 0);
  const ratio = state.total === 0 ? 0 : (done + inFlight) / state.total;
  const width = Math.max(MIN_BAR_WIDTH, Math.min(MAX_BAR_WIDTH, columns - OVERALL_RESERVED));
  const elapsed = Math.max(now - state.startedAt, 0);
  const parts: Part[] = [
    ...barParts(ratio, width),
    { text: ` ${done}/${state.total} ${Math.floor(ratio * 100)}%` },
    { text: `  ${formatDuration(elapsed)}` },
  ];
  if (ratio >= ETA_MIN_RATIO && ratio < 1 && elapsed >= ETA_MIN_ELAPSED_MS) {
    parts.push({ text: `  ~${formatDuration(elapsed / ratio - elapsed)} left`, style: "dim" });
  }
  return parts;
}

function countsParts(state: ProgressState): Part[] {
  const shown = STATUS_ORDER.filter((status) => state.counts[status] > 0);
  const parts: Part[] = [];
  for (const [index, status] of shown.entries()) {
    if (index > 0) parts.push({ text: " · ", style: "dim" });
    parts.push({
      text: `${STATUS_LABEL[status]} ${state.counts[status]}`,
      style: STATUS_STYLE[status],
    });
  }
  return parts.length > 0 ? [{ text: "  " }, ...parts] : [];
}

function unitParts(unit: ActiveUnit, now: number): Part[] {
  return [
    { text: `  ${unit.label.padEnd(LABEL_WIDTH)} ` },
    ...unitMeterParts(unit.percent),
    { text: ` ${unit.key}  ` },
    { text: formatDuration(now - unit.startedAt), style: "dim" },
  ];
}

/**
 * The lines of the progress block: the overall bar, which also counts the finished share of
 * units in flight, a line with the counts of finished units, then one line per unit in flight.
 * Lines are cut to the terminal width, because a wrapped line would break the redraw, and the
 * block stays shorter than the terminal, because lines scrolled away cannot be cleared.
 * The width is measured on the text before `paint` adds escape codes.
 */
export function renderProgress(
  state: ProgressState,
  size: TerminalSize,
  now: number,
  paint: Paint = plain,
): string[] {
  const counts = size.rows >= COUNTS_MIN_ROWS ? countsParts(state) : [];
  const maxUnits = Math.max(size.rows - 2, 1) - (counts.length > 0 ? 1 : 0);
  const overflow = state.active.length > maxUnits;
  const shown = overflow ? state.active.slice(0, maxUnits - 1) : state.active;
  const lines = [
    overallParts(state, size.columns, now),
    ...(counts.length > 0 ? [counts] : []),
    ...shown.map((unit) => unitParts(unit, now)),
  ];
  if (overflow) {
    const more = `  … and ${state.active.length - shown.length} more`;
    lines.push([{ text: more, style: "dim" }]);
  }
  const width = Math.max(size.columns - 1, 1);
  return lines.map((line) => paintParts(cutParts(line, width), paint));
}

/** The single line shown before the block has any units: spinner, label, running time. */
export function renderActivity(
  activity: Activity,
  size: TerminalSize,
  now: number,
  paint: Paint = plain,
): string {
  const elapsed = now - activity.startedAt;
  const spinner = SPINNER[Math.floor(now / SPINNER_FRAME_MS) % SPINNER.length] as string;
  const parts: Part[] = [{ text: spinner, style: "cyan" }, { text: ` ${activity.label}...` }];
  if (elapsed >= ACTIVITY_MIN_ELAPSED_MS) {
    parts.push({ text: `  ${formatDuration(elapsed)}`, style: "dim" });
  }
  return paintParts(cutParts(parts, Math.max(size.columns - 1, 1)), paint);
}

export function createProgressDisplay(options: ProgressDisplayOptions): ProgressDisplay {
  const state: ProgressState = {
    total: 0,
    startedAt: 0,
    counts: { ok: 0, unchanged: 0, skipped: 0, failed: 0 },
    active: [],
  };
  let activity: Activity | undefined;
  let timer: NodeJS.Timeout | undefined;
  let lastFrame = "";
  let drawnLines = 0;

  const findUnit = (key: string) => state.active.find((unit) => unit.key === key);

  /** Moves to the top of the drawn block and erases it. */
  const eraseBlock = (): string => (drawnLines > 0 ? `\x1b[${drawnLines}A\r\x1b[J` : "");

  const renderFrame = (): string => {
    const now = Date.now();
    const size = options.size();
    const lines = activity
      ? [renderActivity(activity, size, now, options.paint)]
      : renderProgress(state, size, now, options.paint);
    return lines.map((line) => `${line}\n`).join("");
  };

  /** Writes everything in one call so a redraw never shows a half-cleared block. */
  const draw = (above = ""): void => {
    const frame = renderFrame();
    if (above === "" && frame === lastFrame) return;
    options.write(`${eraseBlock()}${above}${frame}`);
    lastFrame = frame;
    drawnLines = frame.split("\n").length - 1;
  };

  /** Draws now, then keeps redrawing. */
  const drawContinuously = (): void => {
    draw();
    if (timer) return;
    timer = setInterval(draw, REDRAW_MS);
    timer.unref();
  };

  return {
    activity(label) {
      if (activity?.label !== label) activity = { label, startedAt: Date.now() };
      drawContinuously();
    },
    start(total) {
      activity = undefined;
      state.total = total;
      state.startedAt = Date.now();
      drawContinuously();
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
      activity = undefined;
      if (drawnLines > 0) options.write(eraseBlock());
      drawnLines = 0;
    },
  };
}

/** Draws on stderr, leaving stdout free for `--json`. */
export function createStderrProgress(paint: Paint = plain): ProgressDisplay {
  return createProgressDisplay({
    paint,
    write: (text) => process.stderr.write(text),
    size: () => ({ columns: process.stderr.columns ?? 80, rows: process.stderr.rows ?? 24 }),
  });
}
