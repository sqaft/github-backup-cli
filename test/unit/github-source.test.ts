import { describe, expect, it } from "vitest";
import { createGithubSource, dedupeRepos, parseRepoList } from "../../src/sources/github.js";
import { PrerequisiteError } from "../../src/util/errors.js";
import { type Exec, ExecError } from "../../src/util/exec.js";

type Handler = (args: string[]) => string | Error;

/** Fake `gh`: routes by the first arguments and records every call. */
function fakeGh(handler: Handler) {
  const calls: string[][] = [];
  const exec: Exec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    const result = handler(args);
    if (result instanceof Error) throw result;
    return { stdout: result, stderr: "" };
  };
  return { exec, calls };
}

const repoJson = (...names: Array<string | [string, Partial<Record<string, boolean>>]>) =>
  JSON.stringify(
    names.map((entry) => {
      const [name, flags] = typeof entry === "string" ? [entry, {}] : entry;
      return {
        nameWithOwner: name,
        isArchived: false,
        isFork: false,
        hasWikiEnabled: false,
        isEmpty: false,
        url: `https://github.com/${name}`,
        ...flags,
      };
    }),
  );

const execError = (stderr: string, code: number | string = 1) =>
  new ExecError(`gh failed: ${stderr}`, "gh", code, stderr);

describe("parseRepoList", () => {
  it("maps gh output to RepoInfo", () => {
    const [repo] = parseRepoList(repoJson(["acme/app", { hasWikiEnabled: true, isFork: true }]));
    expect(repo).toEqual({
      source: "github",
      owner: "acme",
      name: "app",
      fullName: "acme/app",
      cloneUrl: "https://github.com/acme/app.git",
      wikiUrl: "https://github.com/acme/app.wiki.git",
      hasWiki: true,
      isArchived: false,
      isFork: true,
      isEmpty: false,
    });
  });

  it("omits wikiUrl when the wiki is disabled", () => {
    const [repo] = parseRepoList(repoJson("acme/app"));
    expect(repo).not.toHaveProperty("wikiUrl");
    expect(repo?.hasWiki).toBe(false);
  });

  it("returns an empty list for an owner without repositories", () => {
    expect(parseRepoList("[]")).toEqual([]);
  });

  it("rejects unexpected output", () => {
    expect(() => parseRepoList('[{"nameWithOwner":"x"}]')).toThrow();
    expect(() => parseRepoList("not json")).toThrow();
  });
});

describe("dedupeRepos", () => {
  it("drops case-insensitive duplicates and keeps the first", () => {
    const repos = parseRepoList(repoJson("Acme/App", "acme/app", "acme/other"));
    expect(dedupeRepos(repos).map((r) => r.fullName)).toEqual(["Acme/App", "acme/other"]);
  });
});

describe("github source prerequisites", () => {
  it("fails with an install link when gh is missing", async () => {
    const { exec } = fakeGh(() => execError("spawn gh ENOENT", "ENOENT"));
    const err = await createGithubSource({ exec })
      .checkPrerequisites()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PrerequisiteError);
    expect((err as Error).message).toContain("https://cli.github.com");
  });

  it("fails with login instructions when not authenticated", async () => {
    const { exec } = fakeGh((args) =>
      args[0] === "auth" ? execError("You are not logged into any GitHub hosts.") : "gh version 2",
    );
    const err = await createGithubSource({ exec })
      .checkPrerequisites()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PrerequisiteError);
    expect((err as PrerequisiteError).exitCode).toBe(2);
    expect((err as Error).message).toContain("gh auth login");
  });

  it("passes when gh is installed and logged in", async () => {
    const { exec } = fakeGh(() => "ok");
    await expect(createGithubSource({ exec }).checkPrerequisites()).resolves.toBeUndefined();
  });
});

describe("github source listRepos", () => {
  function handler(overrides: Record<string, string | Error> = {}): Handler {
    return (args) => {
      if (args[0] === "api" && args[1] === "user") return "me\n";
      if (args[0] === "api" && args[1] === "user/orgs") {
        // --paginate prints one login per line across pages.
        return overrides.orgs instanceof Error
          ? overrides.orgs
          : (overrides.orgs ?? "acme\nbeta\n");
      }
      if (args[0] === "repo" && args[1] === "list") {
        const owner = args[2] as string;
        const value = overrides[owner];
        if (value !== undefined) return value;
        return repoJson(`${owner}/one`, `${owner}/two`);
      }
      return new Error(`unexpected gh call: ${args.join(" ")}`);
    };
  }

  it("lists the user and every organization", async () => {
    const { exec, calls } = fakeGh(handler());
    const { repos, failures } = await createGithubSource({ exec }).listRepos();
    expect(failures).toEqual([]);
    expect(repos.map((r) => r.fullName)).toEqual([
      "me/one",
      "me/two",
      "acme/one",
      "acme/two",
      "beta/one",
      "beta/two",
    ]);
    const listCall = calls.find((c) => c[1] === "repo");
    expect(listCall).toEqual([
      "gh",
      "repo",
      "list",
      "me",
      "--limit",
      "100000",
      "--json",
      "nameWithOwner,isArchived,isFork,hasWikiEnabled,isEmpty,url",
    ]);
  });

  it("handles a user without organizations", async () => {
    const { exec } = fakeGh(handler({ orgs: "\n" }));
    const { repos } = await createGithubSource({ exec }).listRepos();
    expect(repos.map((r) => r.owner)).toEqual(["me", "me"]);
  });

  it("handles an organization with no repositories", async () => {
    const { exec } = fakeGh(handler({ acme: "[]" }));
    const { repos, failures } = await createGithubSource({ exec }).listRepos();
    expect(failures).toEqual([]);
    expect(repos.map((r) => r.owner)).toEqual(["me", "me", "beta", "beta"]);
  });

  it("reports a failing organization (e.g. SSO) and keeps the rest", async () => {
    const { exec } = fakeGh(
      handler({ acme: execError("Resource protected by organization SAML enforcement") }),
    );
    const { repos, failures } = await createGithubSource({ exec }).listRepos();
    expect(failures).toHaveLength(1);
    expect(failures[0]?.owner).toBe("acme");
    expect(failures[0]?.message).toContain("SAML");
    expect(repos.map((r) => r.owner)).toEqual(["me", "me", "beta", "beta"]);
  });

  it("reports a failing organization lookup and still lists personal repositories", async () => {
    const { exec } = fakeGh(handler({ orgs: execError("HTTP 403: needs read:org") }));
    const { repos, failures } = await createGithubSource({ exec }).listRepos();
    expect(failures.map((f) => f.owner)).toEqual(["organizations"]);
    expect(repos.map((r) => r.owner)).toEqual(["me", "me"]);
  });

  it("reports unparsable gh output as a failure for that owner", async () => {
    const { exec } = fakeGh(handler({ beta: "garbage" }));
    const { failures } = await createGithubSource({ exec }).listRepos();
    expect(failures.map((f) => f.owner)).toEqual(["beta"]);
  });

  it("deduplicates repositories returned for more than one owner", async () => {
    const { exec } = fakeGh(handler({ beta: repoJson("acme/one", "beta/own") }));
    const { repos } = await createGithubSource({ exec }).listRepos();
    expect(repos.filter((r) => r.fullName === "acme/one")).toHaveLength(1);
    expect(repos.map((r) => r.fullName)).toContain("beta/own");
  });

  it("deduplicates organizations listed twice", async () => {
    const { exec, calls } = fakeGh(handler({ orgs: "acme\nacme\n" }));
    await createGithubSource({ exec }).listRepos();
    expect(calls.filter((c) => c[1] === "repo" && c[3] === "acme")).toHaveLength(1);
  });
});

describe("github source gitEnv", () => {
  it("authenticates git through gh without touching global config", () => {
    const env = createGithubSource({ exec: fakeGh(() => "").exec }).gitEnv();
    expect(env).toEqual({
      GIT_CONFIG_COUNT: "2",
      GIT_CONFIG_KEY_0: "credential.https://github.com.helper",
      GIT_CONFIG_VALUE_0: "",
      GIT_CONFIG_KEY_1: "credential.https://github.com.helper",
      GIT_CONFIG_VALUE_1: "!gh auth git-credential",
      GIT_TERMINAL_PROMPT: "0",
    });
  });
});
