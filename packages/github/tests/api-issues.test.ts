/**
 * Tests for the `issues` API helpers.
 */
import { describe, expect, it } from "vitest";

import { getOpenIssues, getClosedIssues, getIssueTimeline } from "../src/api/issues.ts";
import issuesFixture from "./fixtures/issues.json";
import { makeFakeOctokit } from "./helpers/fake-octokit.ts";

describe("getOpenIssues", () => {
  it("returns parsed issues from the repo endpoint", async () => {
    const { octokit } = makeFakeOctokit(issuesFixture);

    const issues = await getOpenIssues(octokit, {
      org: "octocat",
      repo: "agents",
    });

    // The fixture includes only `state=closed` ones — verify parsing
    // without filtering for state.
    expect(issues).toHaveLength(3);
    expect(issues[0]?.number).toBe(101);
    expect(issues[0]?.labels[0]?.name).toBe("bug");
  });

  it("uses the search route when no repo is provided", async () => {
    const { octokit, iteratorSpy } = makeFakeOctokit(issuesFixture);
    await getOpenIssues(octokit, { org: "octocat" });
    expect(iteratorSpy).toHaveBeenCalledWith(
      "GET /search/issues",
      expect.objectContaining({
        q: expect.stringMatching(/^is:issue is:open org:octocat/),
      }),
    );
  });

  it("applies the author filter via the search query", async () => {
    const { octokit, iteratorSpy } = makeFakeOctokit(issuesFixture);
    await getOpenIssues(octokit, { org: "octocat", author: "hubot" });
    const call = iteratorSpy.mock.calls[0];
    expect(call).toBeDefined();
    const [, params] = call as [string, { q: string }];
    expect(params.q).toContain("author:hubot");
  });

  it("filters PRs (entries with pull_request field) out", async () => {
    const mixed = [
      ...issuesFixture,
      {
        ...issuesFixture[0],
        number: 200,
        pull_request: { url: "..." },
      },
    ];
    const { octokit } = makeFakeOctokit(mixed);
    const issues = await getOpenIssues(octokit, {
      org: "octocat",
      repo: "agents",
    });

    expect(issues.find((i) => i.number === 200)).toBeUndefined();
    expect(issues).toHaveLength(3);
  });
});

describe("getClosedIssues", () => {
  it("returns parsed closed issues", async () => {
    const { octokit } = makeFakeOctokit(issuesFixture);
    const issues = await getClosedIssues(octokit, {
      org: "octocat",
      repo: "agents",
    });

    expect(issues).toHaveLength(3);
    expect(issues[1]?.state).toBe("closed");
    expect(issues[1]?.state_reason).toBe("completed");
  });

  it("uses the search route when no repo is provided", async () => {
    const { octokit, iteratorSpy } = makeFakeOctokit(issuesFixture);
    await getClosedIssues(octokit, { org: "octocat", since: "2026-09-01T00:00:00Z" });
    expect(iteratorSpy).toHaveBeenCalledWith(
      "GET /search/issues",
      expect.objectContaining({
        q: expect.stringMatching(/^is:issue is:closed org:octocat closed:>=2026-09-01/),
      }),
    );
  });
});

describe("getIssueTimeline", () => {
  it("returns timeline events for the given issue", async () => {
    const timelineEvents = [
      {
        id: 1001,
        event: "labeled",
        label: { name: "bug", color: "d73a4a" },
        created_at: "2026-10-04T10:00:00Z",
      },
      {
        id: 1002,
        event: "assigned",
        assignee: {
          login: "octocat",
          id: 1,
          avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
          html_url: "https://github.com/octocat",
          type: "User",
        },
        created_at: "2026-10-04T10:01:00Z",
      },
      { id: 1003, event: "closed", created_at: "2026-10-04T10:30:00Z" },
    ];
    const { octokit } = makeFakeOctokit(timelineEvents);
    const events = await getIssueTimeline(octokit, {
      owner: "octocat",
      repo: "agents",
      issue_number: 101,
    });
    expect(events).toHaveLength(3);
    expect(events[0]?.event).toBe("labeled");
    expect(events[2]?.event).toBe("closed");
  });

  it("returns [] when the timeline is empty", async () => {
    const { octokit } = makeFakeOctokit([]);
    const events = await getIssueTimeline(octokit, {
      owner: "octocat",
      repo: "agents",
      issue_number: 101,
    });
    expect(events).toEqual([]);
  });

  it("uses the timeline route with the expected params", async () => {
    const { octokit, iteratorSpy } = makeFakeOctokit([]);
    await getIssueTimeline(octokit, {
      owner: "octocat",
      repo: "agents",
      issue_number: 7,
    });
    expect(iteratorSpy).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/issues/{issue_number}/timeline",
      expect.objectContaining({ owner: "octocat", repo: "agents", issue_number: 7 }),
    );
  });
});
