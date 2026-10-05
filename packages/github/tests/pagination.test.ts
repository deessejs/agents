/**
 * Tests for `paginateAll`.
 */
import { describe, expect, it } from "vitest";
import type { OctokitResponse } from "@octokit/types";

import { paginateAll } from "../src/pagination.ts";
import { makeFakeOctokit } from "./helpers/fake-octokit.ts";

describe("paginateAll", () => {
  it("walks every page and returns a flat array", async () => {
    const { octokit } = makeFakeOctokit<number>([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);

    const result = await paginateAll<number>(octokit, "GET /foo");
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("respects the max cap", async () => {
    const { octokit } = makeFakeOctokit<number>([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);

    const result = await paginateAll<number>(octokit, "GET /foo", undefined, { max: 5 });
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns empty array when no pages", async () => {
    const { octokit } = makeFakeOctokit<number>([]);
    const result = await paginateAll<number>(octokit, "GET /foo");
    expect(result).toEqual([]);
  });

  it("propagates errors thrown by the iterator", async () => {
    const errorIterator = (async function* () {
      yield { data: [1, 2] } as OctokitResponse<number>;
      throw new Error("boom");
    })();

    const octokit = {
      paginate: { iterator: () => errorIterator },
    } as unknown as Parameters<typeof paginateAll<number>>[0];

    await expect(paginateAll<number>(octokit, "GET /foo")).rejects.toThrow("boom");
  });

  it("calls paginate.iterator with route + params", async () => {
    const { octokit, iteratorSpy } = makeFakeOctokit<number>([[1]]);
    await paginateAll<number>(octokit, "GET /foo", { org: "octocat" });
    expect(iteratorSpy).toHaveBeenCalledWith("GET /foo", { org: "octocat" });
  });
});
