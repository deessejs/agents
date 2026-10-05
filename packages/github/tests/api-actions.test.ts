/**
 * Tests for the `actions` API helpers.
 */
import { describe, expect, it, vi } from "vitest";
import type { Octokit } from "@octokit/core";

import { getWorkflowRuns, getFailedRuns } from "../src/api/actions.ts";
import workflowRunsFixture from "./fixtures/workflow-runs.json";

interface FakePage<T> {
  data: T[];
}

function fakeOctokit(pages: unknown[][]): Octokit {
  const iterator = (async function* () {
    for (const page of pages) {
      yield { data: page } as FakePage<unknown>;
    }
  })();
  return {
    paginate: { iterator: () => iterator },
    request: vi.fn(),
  } as unknown as Octokit;
}

describe("getWorkflowRuns", () => {
  it("returns parsed workflow runs from the repo endpoint", async () => {
    const octokit = fakeOctokit([workflowRunsFixture]);
    const runs = await getWorkflowRuns(octokit, { owner: "octocat", repo: "agents" });
    expect(runs).toHaveLength(3);
    expect(runs[0]?.name).toBe("CI");
    expect(runs[0]?.conclusion).toBe("success");
  });

  it("returns [] when no runs are found", async () => {
    const octokit = fakeOctokit([[]]);
    const runs = await getWorkflowRuns(octokit, { owner: "octocat", repo: "agents" });
    expect(runs).toEqual([]);
  });
});

describe("getFailedRuns", () => {
  it("filters runs to only those with a 'failure' conclusion", async () => {
    const octokit = fakeOctokit([workflowRunsFixture]);
    const failed = await getFailedRuns(octokit, { owner: "octocat", repo: "agents" });
    expect(failed).toHaveLength(1);
    expect(failed[0]?.conclusion).toBe("failure");
    expect(failed[0]?.id).toBe(9002);
  });

  it("returns [] when no runs have failed", async () => {
    const fixture = workflowRunsFixture.filter((r) => r.conclusion !== "failure");
    const octokit = fakeOctokit([fixture]);
    const failed = await getFailedRuns(octokit, { owner: "octocat", repo: "agents" });
    expect(failed).toEqual([]);
  });
});
