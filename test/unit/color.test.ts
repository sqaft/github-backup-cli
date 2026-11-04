import { describe, expect, it } from "vitest";
import { ansi, plain, selectPaint } from "../../src/util/color.js";

describe("selectPaint", () => {
  it.each([
    ["a terminal", true, {}, ansi],
    ["no terminal", false, {}, plain],
    ["a dumb terminal", true, { TERM: "dumb" }, plain],
    ["NO_COLOR", true, { NO_COLOR: "1" }, plain],
    ["an empty NO_COLOR", true, { NO_COLOR: "" }, ansi],
  ])("%s", (_name, isTerminal, env, expected) => {
    expect(selectPaint(isTerminal, env)).toBe(expected);
  });
});

describe("paint", () => {
  it("closes what it opens", () => {
    expect(ansi("red", "x")).toBe("\x1b[31mx\x1b[39m");
    expect(ansi("dim", "x")).toBe("\x1b[2mx\x1b[22m");
  });

  it("leaves text alone without color", () => {
    expect(plain("red", "x")).toBe("x");
  });
});
