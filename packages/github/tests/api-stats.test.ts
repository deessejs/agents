/**
 * Tests for the `stats` API helpers.
 */
import { describe, expect, it } from "vitest";

import { getCommitActivity } from "../src/api/stats.ts";
import { makeFakeOctokit, mockRequest } from "./helpers/fake-octokit.ts";

const sampleWeek = {
  week: 1_726_800_000,
  total: 42,
  days: [0, 5, 8, 2, 12, 10, 5],
} as const;

describe("getCommitActivity", () => {
  it("returns parsed activity buckets", async () => {
    const { octokit, requestSpy } = makeFakeOctokit();
    mockRequest(requestSpy, { data: [sampleWeek] });
    const activity = await getCommitActivity(octokit, { owner: "octocat", repo: "agents" });
    expect(activity).toHaveLength(1);
    expect(activity[0]?.total).toBe(42);
    expect(activity[0]?.days).toHaveLength(7);
  });

  it("returns [] when the response is not an array", async () => {
    const { octokit, requestSpy } = makeFakeOctokit();
    mockRequest(requestSpy, { data: {} });
    const activity = await getCommitActivity(octokit, { owner: "octocat", repo: "agents" });
    expect(activity).toEqual([]);
  });
});
