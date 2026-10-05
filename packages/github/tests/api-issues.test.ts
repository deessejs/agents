/**
 * Tests for the `issues` API helpers.
 */
import { describe, expect, it } from "vitest";
import type { Octokit } from "@octokit/core";

import { getOpenIssues, getClosedIssues, getIssueTimeline } from "../src/api/issues.js";
import issuesFixture from "./fixtures/issues.json";

function fakeOctokit(pages: unknown[][]): Octokit {
  const iterator = (async function* () {
    for (const page of pages) {
      yield { data: page } as never;
    }
  })();

  return {
    paginate: { iterator: () => iterator },
    request: () => Promise.resolve({ data: {} } as never),
  } as unknown as Octokit;
}

describe("getOpenIssues", () => {
  it("returns parsed issues from the repo endpoint", async () => {
    const octokit = fakeOctokit([issuesFixture]);

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

  it("filters PRs (entries with pull_request field) out", async () => {
    const mixed = [
      ...issuesFixture,
      {
        ...issuesFixture[0],
        number: 200,
        pull_request: { url: "..." },
      },
    ];

    const octokit = fakeOctokit([mixed]);
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
    const octokit = fakeOctokit([issuesFixture]);
    const issues = await getClosedIssues(octokit, {
      org: "octocat",
      repo: "agents",
    });

    expect(issues).toHaveLength(3);
    expect(issues[1]?.state).toBe("closed");
    expect(issues[1]?.state_reason).toBe("completed");
  });
});

describe("getIssueTimeline", () => {
  it("returns timeline events for the given issue", async () => {
    const timelineEvents = [
      { event: "labeled", label: { name: "bug" }, created_at: "2026-10-04T10:00:00Z" },
      { event: "assigned", assignee: { login: "octocat" }, created_at: "2026-10-04T10:01:00Z" },
      { event: "closed", created_at: "2026-10-04T10:30:00Z" },
    ];
    const octokit = fakeOctokit([timelineEvents]);
    const events = await getIssueTimeline(octokit, {
      owner: "octocat",
      repo: "agents",
      issue_number: 101,
    });
    expect(events).toHaveLength(3);
    expect((events[0] as { event: string }).event).toBe("labeled");
    expect((events[2] as { event: string }).event).toBe("closed");
  });

  it("returns [] when the timeline is empty", async () => {
    const octokit = fakeOctokit([[]]);
    const events = await getIssueTimeline(octokit, {
      owner: "octocat",
      repo: "agents",
      issue_number: 101,
    });
    expect(events).toEqual([]);
  });
});
