import { describe, expect, it } from "vitest";
import { resolveKeep, selectExpired } from "../../src/core/retention.js";

describe("resolveKeep", () => {
  it.each([
    [undefined, 7, 7],
    [14, 7, 14],
    [1, 7, 1],
  ])("target %s, global %s -> %s", (target, global, expected) => {
    expect(resolveKeep(target, global)).toBe(expected);
  });
});

describe("selectExpired", () => {
  const stamps = ["20260103T000000Z", "20260101T000000Z", "20260102T000000Z", "20260104T000000Z"];
  it.each([
    [2, ["20260101T000000Z", "20260102T000000Z"]],
    [3, ["20260101T000000Z"]],
    [4, []],
    [10, []],
    [1, ["20260101T000000Z", "20260102T000000Z", "20260103T000000Z"]],
  ])("keep %s", (keep, expected) => {
    expect(selectExpired(stamps, keep)).toEqual(expected);
  });

  it("handles an empty list", () => {
    expect(selectExpired([], 3)).toEqual([]);
  });
});
