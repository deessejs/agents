/**
 * Tests for the `actions` API helpers.
 */
import { describe, expect, it } from "vitest";

import { getWorkflowRuns, getFailedRuns } from "../src/api/actions.ts";
import workflowRunsFixture from "./fixtures/workflow-runs.json";
import { makeFakeOctokit } from "./helpers/fake-octokit.ts";

describe("getWorkflowRuns", () => {
  it("returns parsed workflow runs from the repo endpoint", async () => {
    const { octokit } = makeFakeOctokit(workflowRunsFixture);
    const runs = await getWorkflowRuns(octokit, { owner: "octocat", repo: "agents" });
    expect(runs).toHaveLength(3);
    expect(runs[0]?.name).toBe("CI");
    expect(runs[0]?.conclusion).toBe("success");
  });

  it("returns [] when no runs are found", async () => {
    const { octokit } = makeFakeOctokit([]);
    const runs = await getWorkflowRuns(octokit, { owner: "octocat", repo: "agents" });
    expect(runs).toEqual([]);
  });

  it("scopes the route to a workflow when one is provided", async () => {
    const { octokit, iteratorSpy } = makeFakeOctokit(workflowRunsFixture);
    await getWorkflowRuns(octokit, {
      owner: "octocat",
      repo: "agents",
      workflow: "ci.yml",
    });
    expect(iteratorSpy).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/actions/workflows/{workflow}/runs",
      expect.objectContaining({ workflow: "ci.yml" }),
    );
  });
});

describe("getFailedRuns", () => {
  it("filters runs to only those with a 'failure' conclusion", async () => {
    const { octokit } = makeFakeOctokit(workflowRunsFixture);
    const failed = await getFailedRuns(octokit, { owner: "octocat", repo: "agents" });
    expect(failed).toHaveLength(1);
    expect(failed[0]?.conclusion).toBe("failure");
    expect(failed[0]?.id).toBe(9002);
  });

  it("returns [] when no runs have failed", async () => {
    const fixture = workflowRunsFixture.filter((r) => r.conclusion !== "failure");
    const { octokit } = makeFakeOctokit(fixture);
    const failed = await getFailedRuns(octokit, { owner: "octocat", repo: "agents" });
    expect(failed).toEqual([]);
  });
});
