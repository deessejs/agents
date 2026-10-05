/**
 * Tests for `paginateAll`.
 */
import { describe, expect, it, vi } from "vitest";
import type { OctokitResponse } from "@octokit/types";
import type { Octokit } from "@octokit/core";

import { paginateAll } from "../src/pagination.ts";
import { makeFakeOctokit } from "./helpers/fake-octokit.ts";

/**
 * Narrow Octokit shape `paginateAll` actually uses — local alias for
 * tests that build a literal Octokit instead of going through
 * `makeFakeOctokit`.
 */
type PaginateAllInput = Parameters<typeof paginateAll<number>>[0];

describe("paginateAll", () => {
  it("walks every page and returns a flat array", async () => {
    const { octokit } = makeFakeOctokit<number>([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);

    const result = await paginateAll<number>(octokit as PaginateAllInput, "GET /foo");
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("respects the max cap", async () => {
    const { octokit } = makeFakeOctokit<number>([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);

    const result = await paginateAll<number>(octokit as PaginateAllInput, "GET /foo", undefined, {
      max: 5,
    });
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns empty array when no pages", async () => {
    const { octokit } = makeFakeOctokit<number>([]);
    const result = await paginateAll<number>(octokit as PaginateAllInput, "GET /foo");
    expect(result).toEqual([]);
  });

  it("propagates errors thrown by the iterator", async () => {
    const errorIterator = (async function* () {
      yield { data: [1, 2] } as OctokitResponse<number>;
      throw new Error("boom");
    })();

    const octokit = {
      paginate: { iterator: () => errorIterator },
    } as Octokit as PaginateAllInput;

    await expect(paginateAll<number>(octokit, "GET /foo")).rejects.toThrow("boom");
  });

  it("calls paginate.iterator with route + params", async () => {
    const { octokit, iteratorSpy } = makeFakeOctokit<number>([[1]]);
    await paginateAll<number>(octokit as PaginateAllInput, "GET /foo", { org: "octocat" });
    expect(iteratorSpy).toHaveBeenCalledWith("GET /foo", { org: "octocat" });
  });

  it("calls the validator on every row and returns the validated array", async () => {
    const { octokit } = makeFakeOctokit<number>([
      [1, 2, 3],
      [4, 5],
    ]);
    const validator = vi.fn((raw: unknown) => (raw as number) * 10);

    const result = await paginateAll<number>(
      octokit as PaginateAllInput,
      "GET /foo",
      undefined,
      undefined,
      validator,
    );

    expect(result).toEqual([10, 20, 30, 40, 50]);
    expect(validator).toHaveBeenCalledTimes(5);
    expect(validator).toHaveBeenNthCalledWith(1, 1);
    expect(validator).toHaveBeenNthCalledWith(5, 5);
  });

  it("propagates errors thrown by the validator", async () => {
    const { octokit } = makeFakeOctokit<number>([[1, 2, 3]]);
    const validator = vi.fn((_raw: unknown): number => {
      throw new Error("bad row");
    });

    await expect(
      paginateAll<number>(octokit as PaginateAllInput, "GET /foo", undefined, undefined, validator),
    ).rejects.toThrow("bad row");
    expect(validator).toHaveBeenCalledTimes(1);
  });

  it("validates non-array page payloads (single object per page)", async () => {
    const { octokit, iteratorSpy } = makeFakeOctokit<unknown>([]);
    // Inject a single page with a non-array payload.
    iteratorSpy.mockImplementation(() =>
      (async function* () {
        yield { data: 99 } as OctokitResponse<unknown>;
      })(),
    );

    const validator = vi.fn((raw: unknown): number => raw as number);

    const result = await paginateAll<number>(
      octokit as PaginateAllInput,
      "GET /foo",
      undefined,
      undefined,
      validator,
    );

    expect(result).toEqual([99]);
    expect(validator).toHaveBeenCalledTimes(1);
    expect(validator).toHaveBeenCalledWith(99);
  });
});
