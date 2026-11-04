import { describe, expect, it } from "vitest";
import { ansi } from "../../src/util/color.js";
import { createLogger, type LogLevel } from "../../src/util/log.js";

function setup(level: LogLevel) {
  const lines: string[] = [];
  const logger = createLogger({
    level,
    write: (line) => lines.push(line),
    now: () => new Date(2026, 9, 14, 8, 5, 9),
  });
  return { lines, logger };
}

function emitAll(logger: ReturnType<typeof createLogger>) {
  logger.error("e");
  logger.warn("w");
  logger.info("i");
  logger.debug("d");
}

describe("logger", () => {
  it.each([
    ["quiet", ["ERROR e"]],
    ["normal", ["ERROR e", "WARN  w", "INFO  i"]],
    ["verbose", ["ERROR e", "WARN  w", "INFO  i", "DEBUG d"]],
  ] as const)("level %s", (level, expected) => {
    const { lines, logger } = setup(level);
    emitAll(logger);
    expect(lines).toEqual(expected.map((line) => `[08:05:09] ${line}`));
  });

  it("prefixes the scope", () => {
    const { lines, logger } = setup("normal");
    logger.info("fetched", "github/acme/app");
    expect(lines).toEqual(["[08:05:09] INFO  github/acme/app: fetched"]);
  });

  it("prints summary at every level", () => {
    const { lines, logger } = setup("quiet");
    logger.summary("done");
    expect(lines).toEqual(["done"]);
  });

  it("masks registered secrets", () => {
    const { lines, logger } = setup("normal");
    logger.addSecret("s3cr3t");
    logger.info("key=s3cr3t and again s3cr3t");
    logger.summary("s3cr3t");
    expect(lines).toEqual(["[08:05:09] INFO  key=*** and again ***", "***"]);
  });

  it("colors the time and the ERROR and WARN labels, keeping the padding", () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "verbose",
      write: (line) => lines.push(line),
      now: () => new Date(2026, 9, 14, 8, 5, 9),
      paint: ansi,
    });
    emitAll(logger);
    const time = ansi("dim", "[08:05:09]");
    expect(lines).toEqual([
      `${time} ${ansi("red", "ERROR")} e`,
      `${time} ${ansi("yellow", "WARN ")} w`,
      `${time} INFO  i`,
      `${time} DEBUG d`,
    ]);
  });

  it("masks secrets in painted lines", () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "normal",
      write: (line) => lines.push(line),
      paint: ansi,
    });
    logger.addSecret("s3cr3t");
    logger.error("key=s3cr3t", "github/acme/app");
    expect(lines[0]).toContain(`${ansi("red", "ERROR")} github/acme/app: key=***`);
    expect(lines[0]).not.toContain("s3cr3t");
  });
});
