export type Style = "green" | "red" | "yellow" | "cyan" | "dim" | "bold";

/** Wraps text in a style. `plain` is used wherever color is not available. */
export type Paint = (style: Style, text: string) => string;

const CODES: Record<Style, readonly [number, number]> = {
  green: [32, 39],
  red: [31, 39],
  yellow: [33, 39],
  cyan: [36, 39],
  dim: [2, 22],
  bold: [1, 22],
};

export const plain: Paint = (_style, text) => text;

export const ansi: Paint = (style, text) => {
  const [open, close] = CODES[style];
  return `\x1b[${open}m${text}\x1b[${close}m`;
};

/** Color only on a terminal that can show it. An empty `NO_COLOR` does not disable it. */
export function selectPaint(isTerminal: boolean, env: Record<string, string | undefined>): Paint {
  if (!isTerminal || env.TERM === "dumb" || env.NO_COLOR) return plain;
  return ansi;
}
