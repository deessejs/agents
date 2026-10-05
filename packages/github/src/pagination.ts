/**
 * Pagination helper built on `@octokit/plugin-paginate-rest`.
 *
 * `paginateAll` walks every page and returns a flat array. Optional `max`
 * cap lets callers short-circuit large lists.
 */
import type { Octokit } from "@octokit/core";
import type { OctokitResponse, Route } from "@octokit/types";

export interface PaginateAllOptions {
  /** Stop once the accumulated result reaches this length. */
  max?: number;
}

/**
 * Walk every page of a paginated Octokit endpoint and return a flat array.
 *
 * The generic `T` is the per-item type. Pages are expected to return
 * arrays — non-array pages are pushed verbatim (not flattened).
 *
 * When `opts.max` is set, we stop adding items once we reach the cap and
 * trim any excess pushed by a final oversize page.
 */
export async function paginateAll<T>(
  octokit: Octokit,
  route: Route,
  params?: Record<string, unknown>,
  opts?: PaginateAllOptions,
): Promise<T[]> {
  const results: T[] = [];
  // `composePaginateRest` is heavily overloaded; pull a generic paginate
  // facade from the existing plugin-augmented Octokit instance instead of
  // trying to satisfy the overload chain with a single-arg call.
  const paginated = octokit as unknown as {
    paginate: {
      iterator: (
        route: Route,
        params?: Record<string, unknown>,
      ) => AsyncIterable<OctokitResponse<unknown>>;
    };
  };
  const iterator = paginated.paginate.iterator(route, params);

  const max = opts?.max;

  for await (const response of iterator) {
    const data = response.data;
    if (Array.isArray(data)) {
      for (const item of data as T[]) {
        if (max !== undefined && results.length >= max) break;
        results.push(item);
      }
    } else {
      if (max === undefined || results.length < max) {
        results.push(data as T);
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
