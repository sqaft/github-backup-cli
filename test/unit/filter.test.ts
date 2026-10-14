import { describe, expect, it } from "vitest";
import { filterRepos, globToRegExp, matchesAny } from "../../src/util/filter.js";

const repo = (fullName: string, isArchived = false, isFork = false) => ({
  fullName,
  isArchived,
  isFork,
});

describe("globToRegExp", () => {
  it.each([
    ["*/*", "acme/app", true],
    ["*/*", "acme", false],
    ["acme/*", "acme/app", true],
    ["acme/*", "other/app", false],
    ["acme/*", "acme/a/b", false],
    ["acme/**", "acme/a/b", true],
    ["ACME/App", "acme/app", true],
    ["acme/app-?", "acme/app-1", true],
    ["acme/app-?", "acme/app-12", false],
    ["acme/a.b", "acme/axb", false],
    ["acme/a.b", "acme/a.b", true],
    ["*/*-infra", "acme/core-infra", true],
  ])("%s vs %s -> %s", (glob, name, expected) => {
    expect(globToRegExp(glob).test(name)).toBe(expected);
  });
});

describe("matchesAny", () => {
  it("is false for an empty list", () => {
    expect(matchesAny("a/b", [])).toBe(false);
  });
});

describe("filterRepos", () => {
  const repos = [
    repo("me/one"),
    repo("me/two", true),
    repo("acme/three", false, true),
    repo("acme/four"),
    repo("Acme/Five"),
  ];
  const base = { include: ["*/*"], exclude: [], archived: true, forks: true };
  const names = (r: ReturnType<typeof repo>[]) => r.map((x) => x.fullName);

  it.each([
    ["everything by default", base, ["me/one", "me/two", "acme/three", "acme/four", "Acme/Five"]],
    [
      "empty include means all",
      { ...base, include: [] },
      ["me/one", "me/two", "acme/three", "acme/four", "Acme/Five"],
    ],
    [
      "no archived",
      { ...base, archived: false },
      ["me/one", "acme/three", "acme/four", "Acme/Five"],
    ],
    ["no forks", { ...base, forks: false }, ["me/one", "me/two", "acme/four", "Acme/Five"]],
    ["include narrows", { ...base, include: ["acme/*"] }, ["acme/three", "acme/four", "Acme/Five"]],
    [
      "exclude after include",
      { ...base, include: ["acme/*"], exclude: ["acme/f*"] },
      ["acme/three"],
    ],
    ["exclude only", { ...base, exclude: ["acme/*"] }, ["me/one", "me/two"]],
  ])("%s", (_label, filter, expected) => {
    expect(names(filterRepos(repos, filter))).toEqual(expected);
  });
});
