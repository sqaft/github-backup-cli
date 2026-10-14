import { describe, expect, it } from "vitest";
import { discoverRepos } from "../../src/core/discover.js";
import type { RepoInfo, Source } from "../../src/sources/types.js";
import { PrerequisiteError } from "../../src/util/errors.js";
import { createLogger } from "../../src/util/log.js";

const repo = (fullName: string, extra: Partial<RepoInfo> = {}): RepoInfo => {
  const [owner = "", name = ""] = fullName.split("/");
  return {
    source: "github",
    owner,
    name,
    fullName,
    cloneUrl: `https://github.com/${fullName}.git`,
    hasWiki: false,
    isArchived: false,
    isFork: false,
    isEmpty: false,
    ...extra,
  };
};

const sourceConfig = (extra: object = {}) => ({
  type: "github" as const,
  include: ["*/*"],
  exclude: [] as string[],
  archived: true,
  forks: true,
  ...extra,
});

function fakeSource(repos: RepoInfo[], failures: Array<{ owner: string; message: string }> = []) {
  const source: Source = {
    id: "github",
    checkPrerequisites: async () => {},
    listRepos: async () => ({ repos, failures }),
    gitEnv: () => ({}),
  };
  return () => source;
}

function setup() {
  const lines: string[] = [];
  const log = createLogger({ level: "normal", write: (l) => lines.push(l) });
  return { lines, log };
}

describe("discoverRepos", () => {
  const repos = [
    repo("me/zeta"),
    repo("acme/old", { isArchived: true }),
    repo("acme/fork", { isFork: true }),
    repo("org/secret"),
  ];

  it("filters and sorts the repositories", async () => {
    const { log } = setup();
    const result = await discoverRepos([sourceConfig({ exclude: ["org/*"], forks: false })], {
      exec: async () => ({ stdout: "", stderr: "" }),
      log,
      createSource: fakeSource(repos),
    });
    expect(result.repos.map((r) => r.fullName)).toEqual(["acme/old", "me/zeta"]);
  });

  it("applies each source's own filters and removes duplicates across sources", async () => {
    const { log } = setup();
    const result = await discoverRepos(
      [sourceConfig({ include: ["acme/*"] }), sourceConfig({ include: ["ACME/old", "me/*"] })],
      { exec: async () => ({ stdout: "", stderr: "" }), log, createSource: fakeSource(repos) },
    );
    expect(result.repos.map((r) => r.fullName)).toEqual(["acme/fork", "acme/old", "me/zeta"]);
  });

  it("warns about and returns list failures", async () => {
    const { log, lines } = setup();
    const result = await discoverRepos([sourceConfig()], {
      exec: async () => ({ stdout: "", stderr: "" }),
      log,
      createSource: fakeSource([repo("me/a")], [{ owner: "acme", message: "SAML" }]),
    });
    expect(result.failures).toEqual([{ owner: "acme", message: "SAML" }]);
    expect(lines.join("\n")).toContain("could not list repositories of acme: SAML");
    expect(result.repos).toHaveLength(1);
  });

  it("propagates prerequisite errors", async () => {
    const { log } = setup();
    const failing = () =>
      ({
        id: "github",
        checkPrerequisites: async () => {
          throw new PrerequisiteError("gh missing");
        },
        listRepos: async () => ({ repos: [], failures: [] }),
        gitEnv: () => ({}),
      }) satisfies Source;
    await expect(
      discoverRepos([sourceConfig()], {
        exec: async () => ({ stdout: "", stderr: "" }),
        log,
        createSource: failing,
      }),
    ).rejects.toBeInstanceOf(PrerequisiteError);
  });
});
