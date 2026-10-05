/**
 * Pagination helper built on `@octokit/plugin-paginate-rest`.
 *
 * `paginateAll` walks every page and returns a flat array. Optional `max`
 * cap lets callers short-circuit large lists.
 *
 * The boundary validates every row through a caller-supplied Zod-style
 * validator before returning — so consumers cannot accidentally treat
 * raw `unknown` as their typed entity. Callers that don't need
 * validation can pass `passthrough` (or their own identity function).
 */
import type { Octokit } from "@octokit/core";
import type { OctokitResponse, RequestParameters, Route } from "@octokit/types";

import { ComposedOctokit } from "./octokit.ts";

export interface PaginateAllOptions {
  /** Stop once the accumulated result reaches this length. */
  max?: number;
}

/**
 * Type alias: an Octokit instance that has the paginate-rest plugin
 * installed. The `paginate.iterator` method is what `paginateAll` calls.
 *
 * Derived from the composed class via `InstanceType` — no more
 * `as unknown as { paginate: ... }` cast.
 */
export type OctokitWithPaginate = InstanceType<typeof ComposedOctokit>;

/**
 * Identity validator — returns the input unchanged. Useful for callers
 * that want a `paginateAll` without a Zod boundary, e.g. paginating
 * endpoints where the row schema is built downstream.
 */
export function passthrough<T>(raw: unknown): T {
  return raw as T;
}

/**
 * Walk every page of a paginated Octokit endpoint and return a flat array.
 *
 * Every raw row is passed through `validate` before being added to the
 * result list. The generic `T` is the validated per-item type — callers
 * pair it with a Zod-style validator (`Schema.parse`) to enforce their
 * domain shape.
 *
 * When `opts.max` is set, we stop adding items once we reach the cap and
 * trim any excess pushed by a final oversize page.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import { paginateAll } from "@workspace/github/pagination";
 *
 * const PullRequestSchema = z.object({ id: z.number() });
 *
 * const rows = await paginateAll(
 *   octokit,
 *   "GET /repos/{owner}/{repo}/pulls",
 *   { owner: "x", repo: "y" },
 *   { max: 500 },
 *   PullRequestSchema.parse,
 * );
 * ```
 */
export async function paginateAll<T>(
  octokit: Octokit,
  route: Route,
  params?: RequestParameters,
  opts?: PaginateAllOptions,
  validate: (raw: unknown) => T = passthrough<T>,
): Promise<T[]> {
  const results: T[] = [];
  // Narrow the Octokit instance to one that has the paginate-rest plugin's
  // `iterator` method. The cast is local and never escapes the function.
  const paginated = octokit as OctokitWithPaginate;
  const iterator: AsyncIterable<OctokitResponse<unknown>> = paginated.paginate.iterator(
    route,
    params,
  );

  const max = opts?.max;

  for await (const response of iterator) {
    const data = response.data;
    if (Array.isArray(data)) {
      for (const item of data) {
        if (max !== undefined && results.length >= max) break;
        results.push(validate(item));
      }
    } else {
      if (max === undefined || results.length < max) {
        results.push(validate(data));
      }
    }
    if (max !== undefined && results.length >= max) break;
  }

  // Trim if the last page pushed us past the cap (defensive — the loop
  // usually stops early).
  if (max !== undefined && results.length > max) {
    return results.slice(0, max);
  }
  return results;
}
