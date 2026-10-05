/**
 * Shared test helpers for building a fake Octokit instance.
 *
 * The `@workspace/github` package depends on Octokit's runtime shape
 * (`paginate.iterator`, `request`), but unit tests should not spin up a
 * real `@octokit/core` instance. These helpers build a minimal mock that
 * satisfies the same surface and expose spies so tests can assert what
 * was called and with what arguments.
 */
import { vi, type Mock } from "vitest";
import type { Octokit } from "@octokit/core";
import type { OctokitResponse, RequestParameters, Route } from "@octokit/types";

/**
 * Shape of a single page returned by `paginate.iterator` or `request`.
 * Matches the minimal `OctokitResponse.data` shape used throughout our
 * codebase; `status`, `url`, and `headers` are optional because most
 * tests only care about `data`.
 */
export interface MockOctokitResponse<T = unknown> {
  data: T;
  status?: number;
  url?: string;
  headers?: Record<string, string>;
}

/**
 * Narrow Octokit shape our API helpers consume. We only call
 * `octokit.request(...)` and `octokit.paginate.iterator(...)`, so a
 * `Pick`-style structural type keeps the fake close to the real type
 * without dragging in the rest of Octokit's plugin surface.
 */
export type FakeOctokitShape = Pick<Octokit, "request"> & {
  paginate: { iterator: Octokit["paginate"]["iterator"] };
};

/**
 * What every fake Octokit test helper returns. Each property is a `vi.fn`
 * so tests can assert calls with the standard Vitest API.
 */
export interface FakeOctokit {
  /** The minimal Octokit-shaped object our API helpers consume. */
  octokit: FakeOctokitShape;
  /** Records every `request(route, params)` invocation. */
  requestSpy: Mock<
    (route: Route | URL, params?: RequestParameters) => Promise<OctokitResponse<unknown>>
  >;
  /** Records every top-level `paginate(route, params)` invocation. */
  paginateSpy: Mock<(route: Route | URL, params?: RequestParameters) => Promise<unknown[]>>;
  /** Records every `paginate.iterator(route, params)` invocation. */
  iteratorSpy: Mock<
    (route: Route | URL, params?: RequestParameters) => AsyncIterable<OctokitResponse<unknown>>
  >;
}

/**
 * Helper to declare a single mock `request` return value.
 *
 * @example
 * ```ts
 * const { octokit, requestSpy } = makeFakeOctokit();
 * mockRequest(requestSpy, { data: { id: 42 } });
 * const result = await getRepo(octokit, { owner: "x", repo: "y" });
 * expect(result.id).toBe(42);
 * ```
 */
export function mockRequest(spy: FakeOctokit["requestSpy"], response: MockOctokitResponse): void {
  spy.mockResolvedValueOnce(response as OctokitResponse<unknown>);
}

/**
 * Helper to declare a sequence of mock `request` return values.
 */
export function mockRequests(
  spy: FakeOctokit["requestSpy"],
  responses: ReadonlyArray<MockOctokitResponse>,
): void {
  for (const response of responses) {
    mockRequest(spy, response);
  }
}

/**
 * Build a fake Octokit whose `paginate.iterator` yields the given pages
 * of data. `request` and the top-level `paginate` are also exposed as
 * spies so tests can assert on them when needed.
 */
export function makeFakeOctokit<T = unknown>(
  pages: ReadonlyArray<ReadonlyArray<T>> = [],
): FakeOctokit {
  const requestSpy =
    vi.fn<(route: Route | URL, params?: RequestParameters) => Promise<OctokitResponse<unknown>>>();
  const paginateSpy =
    vi.fn<(route: Route | URL, params?: RequestParameters) => Promise<unknown[]>>();
  const iteratorSpy =
    vi.fn<
      (route: Route | URL, params?: RequestParameters) => AsyncIterable<OctokitResponse<unknown>>
    >();

  iteratorSpy.mockImplementation(() =>
    (async function* () {
      for (const page of pages) {
        yield { data: page } as OctokitResponse<T>;
      }
    })(),
  );
  paginateSpy.mockImplementation(() => Promise.resolve<readonly unknown[]>(pages.flat()));

  // Narrow structural shape — we provide exactly the methods the package
  // uses (`request`, `paginate.iterator`). The runtime shape is
  // intentionally minimal; no `unknown` chain needed.
  const octokit: FakeOctokitShape = {
    request: requestSpy,
    paginate: {
      iterator: iteratorSpy,
    },
  };

  return { octokit, requestSpy, paginateSpy, iteratorSpy };
}

/**
 * Convenience: a single-page fake Octokit that yields the given data on
 * the first `paginate.iterator` call. Mirrors the most common test
 * pattern where a single page of results is returned.
 */
export function makeSinglePageFakeOctokit<T>(page: ReadonlyArray<T>): FakeOctokit {
  return makeFakeOctokit<T>([page]);
}
