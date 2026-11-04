import { describe, expect, it } from "vitest";
import { formatBytes } from "../../src/util/format.js";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [-5, "0 B"],
    [Number.NaN, "0 B"],
    [1, "1 B"],
    [512, "512 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [102_300, "99.9 KB"],
    [102_400, "100 KB"],
    [1_048_063, "1023 KB"],
    [1_048_064, "1.0 MB"],
    [1_048_576, "1.0 MB"],
    [184 * 1024 * 1024, "184 MB"],
    [1.2 * 1024 ** 3, "1.2 GB"],
    [1024 ** 3 - 1, "1.0 GB"],
    [3.4 * 1024 ** 4, "3.4 TB"],
    [5000 * 1024 ** 4, "5000 TB"],
  ])("%d bytes", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
