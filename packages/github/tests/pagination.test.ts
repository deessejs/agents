/**
 * Tests for `paginateAll`.
 */
import { describe, expect, it, vi } from "vitest";
import type { Octokit } from "@octokit/core";

import { paginateAll } from "../src/pagination.js";

interface FakePage<T> {
  data: T[];
}

/**
 * Build a fake Octokit whose `paginate.iterator` yields the given pages.
 */
function fakeOctokit<T>(pages: T[][]): Octokit {
  const iterator = (async function* () {
    for (const page of pages) {
      yield { data: page } as FakePage<T>;
    }
  })();

  return {
    paginate: { iterator: () => iterator },
  } as unknown as Octokit;
}

describe("paginateAll", () => {
  it("walks every page and returns a flat array", async () => {
    const octokit = fakeOctokit<number>([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);

    const result = await paginateAll<number>(octokit, "GET /foo");
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("respects the max cap", async () => {
    const octokit = fakeOctokit<number>([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);

    const result = await paginateAll<number>(octokit, "GET /foo", undefined, {
      max: 5,
    });
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns empty array when no pages", async () => {
    const octokit = fakeOctokit<number>([]);
    const result = await paginateAll<number>(octokit, "GET /foo");
    expect(result).toEqual([]);
  });

  it("propagates errors thrown by the iterator", async () => {
    const errorIterator = (async function* () {
      yield { data: [1, 2] } as FakePage<number>;
      throw new Error("boom");
    })();

    const octokit = {
      paginate: { iterator: () => errorIterator },
    } as unknown as Octokit;

    await expect(paginateAll<number>(octokit, "GET /foo")).rejects.toThrow("boom");
  });

  it("calls paginate.iterator with route + params", async () => {
    const iteratorSpy = vi.fn(async function* () {
      yield { data: [1] } as FakePage<number>;
    });
    const octokit = {
      paginate: { iterator: iteratorSpy },
    } as unknown as Octokit;

    await paginateAll<number>(octokit, "GET /foo", { org: "octocat" });
    expect(iteratorSpy).toHaveBeenCalledWith("GET /foo", { org: "octocat" });
  });
});
