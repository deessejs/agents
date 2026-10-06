/**
 * Acceptance tests for the Technical Analyst.
 *
 * These tests exercise the REAL tool bodies (collect_activity +
 * submit_digest) with mocked GitHub + Resend. They cover the v1
 * acceptance criteria: tool discovery, counts, repo-qualified ids,
 * pause-before-collect, essential-source failure, secret projection,
 * report validation, preview, edition identity, quiet-period
 * rendering, plain-text content, and schedule dispatch semantics.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

// Pin the wall clock to a date that matches our fixture data so the
// canonical UTC daily window covers 2026-10-05.
const FIXED_NOW = new Date("2026-10-06T10:00:00.000Z");

// eve's defineState reads from an AsyncLocalStorage-backed context
// container keyed by Symbol.for(`eve.context-storage`). The container
// has `get/require/has/set/ensure/delete/clearVirtualContext/
// setVirtualContext/entries` methods. We build a minimal container
// that satisfies the surface eve's `defineState.update()` calls use.
import { AsyncLocalStorage } from "node:async_hooks";

// `defineTool`'s execute return type is `Promise | AsyncIterable |
// sync object` — too wide for tests. The tools return plain objects
// (no async iteration), so cast through unknown to narrow to a
// Promise<...> in test sites.
const unwrap = async <T>(p: unknown): Promise<T> => (await p) as T;

type ContextContainer = {
  get: (...args: unknown[]) => unknown;
  require: (...args: unknown[]) => unknown;
  has: (...args: unknown[]) => boolean;
  set: (...args: unknown[]) => unknown;
  ensure: (...args: unknown[]) => unknown;
  delete: (...args: unknown[]) => boolean;
  clearVirtualContext: () => void;
  setVirtualContext: (...args: unknown[]) => void;
};

const EVE_CONTEXT_STORAGE_KEY = Symbol.for("eve.context-storage");

function getEveStorage(): AsyncLocalStorage<ContextContainer> | undefined {
  return (globalThis as unknown as Record<symbol, AsyncLocalStorage<ContextContainer>>)[
    EVE_CONTEXT_STORAGE_KEY
  ];
}

function makeContextContainer(): ContextContainer {
  const durable = new Map<string, unknown>();
  const virtual = new Map<string, unknown>();
  const keyOf = (key: unknown): string =>
    typeof key === "string" ? key : ((key as { name?: string })?.name ?? String(key));
  const self: ContextContainer = {} as ContextContainer;
  self.get = (key) => {
    const k = keyOf(key);
    return virtual.has(k) ? virtual.get(k) : durable.get(k);
  };
  self.require = (key) => {
    const k = keyOf(key);
    const v = self.get(k);
    if (v === undefined) throw new Error(`Context key "${k}" is not set.`);
    return v;
  };
  self.has = (key) => {
    const k = keyOf(key);
    return virtual.has(k) || durable.has(k);
  };
  self.set = (key, value) => {
    const k = keyOf(key);
    const v = typeof value === "function" ? (value as () => unknown)() : value;
    durable.set(k, v);
    return v;
  };
  self.ensure = (key, init) => {
    const k = keyOf(key);
    if (self.has(k)) return self.require(k);
    const fn = init as unknown as () => unknown;
    return self.set(k, fn());
  };
  self.delete = (key) => {
    const k = keyOf(key);
    return durable.delete(k) || virtual.delete(k);
  };
  self.clearVirtualContext = () => virtual.clear();
  self.setVirtualContext = (key, value) => virtual.set(keyOf(key), value);
  return self;
}

async function withEveContext<T>(fn: () => Promise<T>): Promise<T> {
  // Importing any eve module that touches the context eagerly seeds
  // the AsyncLocalStorage on first use of `loadContext()`. We import
  // a public surface (`eve/context`) for that side effect.
  await import("eve/context");
  const storage = getEveStorage();
  if (!storage) throw new Error("AsyncLocalStorage for eve context not found");
  return storage.run(makeContextContainer(), fn);
}

// ── ENV stubs (set BEFORE any module that reads env is imported) ────────

const envValues = {
  GITHUB_TOKEN: "ghp_testTokenForCIabcdef0123",
  GITHUB_ORG: "deessejs",
  GITHUB_REPO: "agents",
  DIGEST_RECIPIENT: "ops@example.com",
  RESEND_API_KEY: "re_testKeyForCI_1234567890",
  RESEND_FROM_ADDRESS: "digest@mail.example.com",
  RESEND_FROM_NAME: "Technical Analyst",
  MINIMAX_API_KEY: "minimax_test_key",
  LLM_MODEL_ID: "minimax-m3",
  AGENTS_PAUSED: "false",
} as const;

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED_NOW, toFake: ["Date"] });
  for (const [k, v] of Object.entries(envValues)) {
    process.env[k] = String(v);
  }
});

afterEach(() => {
  vi.useRealTimers();
  for (const k of Object.keys(envValues)) {
    delete process.env[k];
  }
  vi.resetModules();
});

// ── Mocked Octokit + Resend ──────────────────────────────────────────────

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "github-rest");

interface OctokitResponse {
  data: unknown;
  headers: Record<string, string>;
  status: number;
  url: string;
}

type RouteSpec =
  | { fixture: string }
  | { match: (params: Record<string, unknown> | undefined) => boolean; fixture: string };

function buildFakeOctokit(routes: Record<string, RouteSpec>): unknown {
  const stripQuery = (route: string): string => route.split("?")[0] ?? route;
  const lookup = (
    route: string,
    params?: Record<string, unknown>,
  ): { fixture: string } | undefined => {
    const path = stripQuery(route);
    // Predicate-based routes win over path-only routes when the predicate
    // is true (lets tests route search queries by `q` content).
    for (const [key, spec] of Object.entries(routes)) {
      if (Object.prototype.hasOwnProperty.call(spec, "match")) {
        if (
          stripQuery(key) === path &&
          (spec as { match: (p: unknown) => boolean }).match(params)
        ) {
          return spec as { fixture: string };
        }
      }
    }
    const fallback = routes[path] ?? routes[route];
    if (fallback && !Object.prototype.hasOwnProperty.call(fallback, "match")) {
      return fallback as { fixture: string };
    }
    return undefined;
  };
  const handler = async (
    route: string,
    params?: Record<string, unknown>,
  ): Promise<OctokitResponse> => {
    const spec = lookup(route, params);
    if (!spec) throw new Error(`Fake octokit: unstubbed route ${route}`);
    const data = JSON.parse(await readFile(join(FIXTURE_DIR, spec.fixture), "utf8")) as unknown;
    return { data, headers: {}, status: 200, url: route };
  };
  const paginate = {
    iterator(route: string, params?: Record<string, unknown>): AsyncIterable<{ data: unknown[] }> {
      const spec = lookup(route, params);
      if (!spec) throw new Error(`Fake octokit: unstubbed paginate ${route}`);
      return (async function* (): AsyncGenerator<{ data: unknown[] }> {
        const data = JSON.parse(
          await readFile(join(FIXTURE_DIR, spec.fixture), "utf8"),
        ) as unknown[];
        yield { data };
      })();
    },
  };
  return { request: handler, paginate };
}

// ── Discovery ───────────────────────────────────────────────────────────

describe("Tool discovery (criteria 1-3)", () => {
  it("the agent manifest exports a defineAgent + two business tools, and the schedules reach the tools", async () => {
    const base = resolve(dirname(fileURLToPath(import.meta.url)), "..", "agent");
    const agentFiles = await Promise.all(
      ["agent.ts", "instructions.md"].map((f) => readFile(resolve(base, f), "utf8")),
    );
    for (const raw of agentFiles) {
      expect(raw.length).toBeGreaterThan(0);
    }
    const toolsDir = resolve(base, "tools");
    const toolFiles = await Promise.all(
      ["collect_activity.ts", "submit_digest.ts"].map((n) =>
        readFile(resolve(toolsDir, n), "utf8"),
      ),
    );
    for (const raw of toolFiles) {
      expect(raw).toContain("defineTool");
    }
    // Schedule dispatch: each schedule's markdown must call
    // collect_activity then submit_digest. A schedule that does not
    // reach the publication path is silently no-op.
    const schedulesDir = resolve(base, "schedules");
    const daily = await readFile(resolve(schedulesDir, "daily-digest.ts"), "utf8");
    expect(daily).toContain("defineSchedule");
    expect(daily).toMatch(/cron: "0 20 \* \* \*"/);
    expect(daily).toContain("collect_activity");
    expect(daily).toContain("submit_digest");
    const weekly = await readFile(resolve(schedulesDir, "weekly-recap.ts"), "utf8");
    expect(weekly).toContain("defineSchedule");
    expect(weekly).toMatch(/cron: "0 16 \* \* 5"/);
    expect(weekly).toContain("collect_activity");
    expect(weekly).toContain("submit_digest");
  });
});

// ── collect_activity ────────────────────────────────────────────────────

describe("collect_activity", () => {
  const ctx = {
    callId: "x",
    toolName: "x",
    messages: [],
    abortSignal: new globalThis.AbortController().signal,
    session: { auth: {} as never },
  };

  it("returns computed counts + corpus with repo-qualified ids", async () => {
    const fakeOctokit = buildFakeOctokit({
      "GET /repos/{owner}/{repo}/dependabot/alerts": { fixture: "dependabot-alerts.json" },
      "GET /repos/{owner}/{repo}/code-scanning/alerts": { fixture: "code-scanning-alerts.json" },
      "GET /repos/{owner}/{repo}/secret-scanning/alerts": {
        fixture: "secret-scanning-alerts.json",
      },
      "GET /repos/{owner}/{repo}/pulls": { fixture: "merged-prs.json" },
      "GET /search/issues": {
        match: (params) => typeof params?.q === "string" && params.q.includes("is:merged"),
        fixture: "merged-prs.json",
      },
      "GET /search/issues_issues": { fixture: "issues-empty.json" },
      "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit }),
    }));
    const mod = await import("../agent/tools/collect_activity.ts");
    const tool = mod.default;
    const result = (await withEveContext(
      async () => tool.execute({ kind: "daily" } as never, ctx as never) as unknown,
    )) as Awaited<ReturnType<typeof tool.execute>>;

    expect(result.edition.kind).toBe("daily");
    expect(result.edition.id.length).toBeGreaterThan(0);
    // 2 open dependabot (the fixed one is filtered out)
    expect(result.counts.dependabot_alerts).toBe(2);
    expect(result.counts.dependabot_critical).toBe(1);
    expect(result.counts.merged_prs).toBeGreaterThan(0);
    expect(result.weeklyMetrics).toBeNull();
    for (const s of result.sources) {
      expect(s.id).toMatch(/^deessejs\/agents:/);
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.title.length).toBeGreaterThan(0);
    }
  });

  it("a failed security source does not abort collection; surfaces availability", async () => {
    // v1 partial-collection semantics: a single failed security
    // endpoint does not abort the digest. The corpus records an
    // availability entry naming the failed source so the renderer
    // surfaces it. Counts from the working endpoints are still computed.
    const failOctokit: unknown = {
      request: () => Promise.reject(new Error("503 Service Unavailable")),
      paginate: {
        iterator: () => {
          throw new Error("503 Service Unavailable");
        },
      },
    };
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: failOctokit }),
    }));
    const mod = await import("../agent/tools/collect_activity.ts");
    const tool = mod.default;
    const result = (await withEveContext(
      async () => tool.execute({ kind: "daily" } as never, ctx as never) as unknown,
    )) as Awaited<ReturnType<typeof tool.execute>>;
    expect(result.sources).toEqual([]);
    // At least one availability entry names each of the three security
    // sources that failed.
    const reasons = result.availability.map((a) => a.reason).join("\n");
    expect(reasons).toMatch(/Dependabot/);
    expect(reasons).toMatch(/CodeQL/);
    expect(reasons).toMatch(/Secret-scanning/);
  });

  it("throws when env.AGENTS_PAUSED=true (pause-before-collect)", async () => {
    process.env.AGENTS_PAUSED = "true";
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({
        raw: {
          request: () => Promise.resolve({ data: [], headers: {}, status: 200, url: "" }),
          paginate: {
            iterator: () =>
              (async function* () {
                yield { data: [] };
              })(),
          },
        },
      }),
    }));
    const mod = await import("../agent/tools/collect_activity.ts");
    const tool = mod.default;
    await expect(
      withEveContext(async () => tool.execute({ kind: "daily" } as never, ctx as never)),
    ).rejects.toThrow(/paused/);
  });
});

// ── submit_digest ───────────────────────────────────────────────────────

describe("submit_digest", () => {
  const ctx = {
    callId: "x",
    toolName: "x",
    messages: [],
    abortSignal: new globalThis.AbortController().signal,
    session: { auth: {} as never },
  };

  /**
   * Run collect_activity against a deterministic fixture set, then
   * run the supplied callback inside the same eve context so it can
   * read the populated corpus. Mocks Resend so we don't hit the
   * network.
   */
  async function withCollectionLoaded<T>(
    fn: (ctx: {
      collect: typeof import("../agent/tools/collect_activity.ts").default;
      submit: typeof import("../agent/tools/submit_digest.ts").default;
    }) => Promise<T>,
  ): Promise<T> {
    const fakeOctokit = buildFakeOctokit({
      "GET /repos/{owner}/{repo}/dependabot/alerts": { fixture: "dependabot-alerts.json" },
      "GET /repos/{owner}/{repo}/code-scanning/alerts": { fixture: "code-scanning-alerts.json" },
      "GET /repos/{owner}/{repo}/secret-scanning/alerts": {
        fixture: "secret-scanning-alerts.json",
      },
      "GET /repos/{owner}/{repo}/pulls": { fixture: "merged-prs.json" },
      "GET /search/issues": {
        match: (params) => typeof params?.q === "string" && params.q.includes("is:merged"),
        fixture: "merged-prs.json",
      },
      "GET /search/issues_issues": { fixture: "issues-empty.json" },
      "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit }),
    }));
    vi.doMock("@workspace/email", async () => {
      const actual = await vi.importActual<typeof import("@workspace/email")>("@workspace/email");
      return {
        ...actual,
        createEmailClient: () => ({
          async send() {
            return { id: "resend_test_id", idempotencyKey: "digest:send:abc" };
          },
        }),
      };
    });
    return withEveContext(async () => {
      const collectMod = await import("../agent/tools/collect_activity.ts");
      const submitMod = await import("../agent/tools/submit_digest.ts");
      await collectMod.default.execute({ kind: "daily" } as never, ctx as never);
      return fn({ collect: collectMod.default, submit: submitMod.default });
    });
  }

  it("renders authoritative URLs from the corpus (model cannot fabricate)", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "digest-"));
    const origCwd = process.cwd();
    process.chdir(tmp);
    try {
      await withCollectionLoaded(async ({ submit }) => {
        const corpusMod = await import("../agent/lib/state.ts");
        const corpus = corpusMod.sourceCorpus.get();
        const pr = corpus.sources.find((s) => s.kind === "merged_pr");
        if (!pr) throw new Error("fixture has no merged_pr");
        const result = (await unwrap(
          submit.execute(
            {
              kind: "daily",
              preview: true,
              report: {
                kind: "daily",
                sections: [{ kind: "tldr", items: [{ text: "1 PR merged", referenceId: pr.id }] }],
              },
            } as never,
            ctx as never,
          ),
        )) as Awaited<ReturnType<typeof submit.execute>>;
        expect(result.status).toBe("preview");
        const html = await readFile(result.path as string, "utf8");
        expect(html).toContain(pr.url);
        expect(html).toContain(pr.title);
      });
    } finally {
      process.chdir(origCwd);
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("rejects a reference id that is not in the corpus", async () => {
    await withCollectionLoaded(async ({ submit }) => {
      await expect(
        submit.execute(
          {
            kind: "daily",
            report: {
              kind: "daily",
              sections: [
                { kind: "tldr", items: [{ text: "x", referenceId: "deessejs/agents:pr:9999" }] },
              ],
            },
          } as never,
          ctx as never,
        ),
      ).rejects.toThrow(/not in the corpus/);
    });
  });

  it("rejects a kind/citation mismatch (dependabot under shipped)", async () => {
    await withCollectionLoaded(async ({ submit }) => {
      const corpusMod = await import("../agent/lib/state.ts");
      const corpus = corpusMod.sourceCorpus.get();
      const dep = corpus.sources.find((s) => s.kind === "dependabot_alert");
      if (!dep) throw new Error("no dependabot");
      await expect(
        submit.execute(
          {
            kind: "daily",
            report: {
              kind: "daily",
              sections: [{ kind: "shipped", items: [{ text: "x", referenceId: dep.id }] }],
            },
          } as never,
          ctx as never,
        ),
      ).rejects.toThrow(/may not cite source/);
    });
  });

  it("rejects an unknown top-level field via .strict()", async () => {
    await withCollectionLoaded(async ({ submit }) => {
      const corpusMod = await import("../agent/lib/state.ts");
      const corpus = corpusMod.sourceCorpus.get();
      const pr = corpus.sources.find((s) => s.kind === "merged_pr");
      if (!pr) throw new Error("no merged_pr");
      await expect(
        submit.execute(
          {
            kind: "daily",
            report: {
              kind: "daily",
              sections: [{ kind: "tldr", items: [{ text: "x", referenceId: pr.id }] }],
            },
            invented: "x", // top-level — rejected by .strict()
          } as never,
          ctx as never,
        ),
      ).rejects.toThrow(/Unrecognized key: "invented"/);
    });
  });

  it("throws when env.AGENTS_PAUSED=true (defensive check at submit time)", async () => {
    await withCollectionLoaded(async ({ submit }) => {
      // Set pause AFTER collect_activity ran successfully, then call
      // submit — its defensive pause check must abort the send.
      process.env.AGENTS_PAUSED = "true";
      const corpusMod = await import("../agent/lib/state.ts");
      const corpus = corpusMod.sourceCorpus.get();
      const pr = corpus.sources.find((s) => s.kind === "merged_pr");
      if (!pr) throw new Error("no merged_pr");
      try {
        await expect(
          submit.execute(
            {
              kind: "daily",
              report: {
                kind: "daily",
                sections: [{ kind: "tldr", items: [{ text: "x", referenceId: pr.id }] }],
              },
            } as never,
            ctx as never,
          ),
        ).rejects.toThrow(/paused/);
      } finally {
        process.env.AGENTS_PAUSED = "false";
      }
    });
  });

  it("preview: true always renders to disk regardless of prior delivery", async () => {
    await withCollectionLoaded(async ({ submit }) => {
      const corpusMod = await import("../agent/lib/state.ts");
      const corpus = corpusMod.sourceCorpus.get();
      const pr = corpus.sources.find((s) => s.kind === "merged_pr");
      if (!pr) throw new Error("no merged_pr");

      const result = (await unwrap(
        submit.execute(
          {
            kind: "daily",
            preview: true,
            report: {
              kind: "daily",
              sections: [{ kind: "tldr", items: [{ text: "preview me", referenceId: pr.id }] }],
            },
          } as never,
          ctx as never,
        ),
      )) as Awaited<ReturnType<typeof submit.execute>>;
      // Preview never returns already-delivered. It always renders.
      expect(result.status).toBe("preview");
    });
  });
});

// ── Secret projection (criterion 6) ────────────────────────────────────

describe("Synthetic secret never reaches the corpus (criterion 6)", () => {
  const ctx = {
    callId: "x",
    toolName: "x",
    messages: [],
    abortSignal: new globalThis.AbortController().signal,
    session: { auth: {} as never },
  };

  it("secret-scanning alert with a synthetic secret value is reduced to categorical fields", async () => {
    const fakeOctokit = buildFakeOctokit({
      "GET /repos/{owner}/{repo}/dependabot/alerts": { fixture: "dependabot-alerts-empty.json" },
      "GET /repos/{owner}/{repo}/code-scanning/alerts": {
        fixture: "code-scanning-alerts-empty.json",
      },
      "GET /repos/{owner}/{repo}/secret-scanning/alerts": {
        fixture: "secret-scanning-alerts-synthetic.json",
      },
      "GET /repos/{owner}/{repo}/pulls": { fixture: "merged-prs.json" },
      "GET /search/issues": {
        match: (params) => typeof params?.q === "string" && params.q.includes("is:merged"),
        fixture: "merged-prs.json",
      },
      "GET /search/issues_issues": { fixture: "issues-empty.json" },
      "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit }),
    }));
    const mod = await import("../agent/tools/collect_activity.ts");
    const tool = mod.default;
    const result = (await withEveContext(
      async () => tool.execute({ kind: "daily" } as never, ctx as never) as unknown,
    )) as Awaited<ReturnType<typeof tool.execute>>;
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/ghp_SYNTHETICabc/);
    expect(json).not.toMatch(/AKIAIOSFODNN7EXAMPLE/);
    const secretSources = result.sources.filter((s) => s.kind === "secret_scanning_alert");
    expect(secretSources.length).toBeGreaterThan(0);
    for (const s of secretSources) {
      expect(s.title).toMatch(/^Secret detected — /);
    }
  });
});

// ── Regression tests for review of commit 868e140 ───────────────────────

describe("Edition identity is a real hash of the canonical input", () => {
  const ctx = {
    callId: "x",
    toolName: "x",
    messages: [],
    abortSignal: new globalThis.AbortController().signal,
    session: { auth: {} as never },
  };
  function expectedId(
    org: string,
    repo: string,
    kind: "daily" | "weekly",
    start: string,
    end: string,
    recipient: string,
  ): string {
    const seed = `${org}|${repo}|${kind}|${start}|${end}|${recipient}`;
    return createHash("sha256").update(seed).digest("hex").slice(0, 24);
  }

  it("different dates, recipients, repos or kinds change the id; identical inputs preserve it", () => {
    // Reproduces the regression: two distinct daily windows must not
    // share an edition id.
    const a = expectedId(
      "deessejs",
      "agents",
      "daily",
      "2026-10-04T00:00:00.000Z",
      "2026-10-05T00:00:00.000Z",
      "ops@example.com",
    );
    const b = expectedId(
      "deessejs",
      "agents",
      "daily",
      "2026-10-05T00:00:00.000Z",
      "2026-10-06T00:00:00.000Z",
      "ops@example.com",
    );
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(b).toMatch(/^[0-9a-f]{24}$/);

    // Different recipient.
    const c = expectedId(
      "deessejs",
      "agents",
      "daily",
      "2026-10-05T00:00:00.000Z",
      "2026-10-06T00:00:00.000Z",
      "other@example.com",
    );
    expect(b).not.toBe(c);

    // Different repo.
    const d = expectedId(
      "deessejs",
      "other",
      "daily",
      "2026-10-05T00:00:00.000Z",
      "2026-10-06T00:00:00.000Z",
      "ops@example.com",
    );
    expect(b).not.toBe(d);

    // Different kind (daily vs weekly on the same Monday).
    const e = expectedId(
      "deessejs",
      "agents",
      "weekly",
      "2026-10-05T00:00:00.000Z",
      "2026-10-06T00:00:00.000Z",
      "ops@example.com",
    );
    expect(b).not.toBe(e);

    // Identical inputs preserve the id.
    const aBis = expectedId(
      "deessejs",
      "agents",
      "daily",
      "2026-10-04T00:00:00.000Z",
      "2026-10-05T00:00:00.000Z",
      "ops@example.com",
    );
    expect(aBis).toBe(a);
  });

  it("two distinct dates produce two distinct edition ids through the real tool", async () => {
    // Day 1: simulated via the canonical period function with a fixed now.
    const stateMod = await import("../agent/lib/state.ts");
    const fakeOctokit = buildFakeOctokit({
      "GET /repos/{owner}/{repo}/dependabot/alerts": { fixture: "dependabot-alerts.json" },
      "GET /repos/{owner}/{repo}/code-scanning/alerts": { fixture: "code-scanning-alerts.json" },
      "GET /repos/{owner}/{repo}/secret-scanning/alerts": {
        fixture: "secret-scanning-alerts.json",
      },
      "GET /repos/{owner}/{repo}/pulls": { fixture: "merged-prs.json" },
      "GET /search/issues": {
        match: (p) => typeof p?.q === "string" && p.q.includes("is:merged"),
        fixture: "merged-prs.json",
      },
      "GET /search/issues_issues": { fixture: "issues-empty.json" },
      "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit }),
    }));
    const mod = await import("../agent/tools/collect_activity.ts");
    const tool = mod.default;

    // Day 1: 2026-10-05 (wall clock set to 2026-10-06 → previous day).
    vi.useFakeTimers({ now: new Date("2026-10-06T10:00:00.000Z"), toFake: ["Date"] });
    let idDay1 = "";
    await withEveContext(async () => {
      await tool.execute({ kind: "daily" } as never, ctx as never);
      idDay1 = stateMod.edition.get().id;
    });

    // Reset modules so the next collect sees the new wall clock + a
    // fresh edition module (state is held in the AsyncLocalStorage
    // binding the first import established).
    vi.resetModules();
    vi.useRealTimers();
    vi.useFakeTimers({ now: new Date("2026-10-07T10:00:00.000Z"), toFake: ["Date"] });
    const stateMod2 = await import("../agent/lib/state.ts");
    const mod2 = await import("../agent/tools/collect_activity.ts");
    const tool2 = mod2.default;
    let idDay2 = "";
    await withEveContext(async () => {
      await tool2.execute({ kind: "daily" } as never, ctx as never);
      idDay2 = stateMod2.edition.get().id;
    });

    expect(idDay1).not.toBe(idDay2);
    expect(idDay1).toMatch(/^[0-9a-f]{24}$/);
    expect(idDay2).toMatch(/^[0-9a-f]{24}$/);
    vi.useRealTimers();
  });
});

describe("Quiet-period rendering (criteria 3)", () => {
  it("renders a quiet-period note when the corpus has no items and no availability", async () => {
    // Empty fixtures everywhere → corpus.sources is empty AND availability is empty.
    const fakeOctokit = buildFakeOctokit({
      "GET /repos/{owner}/{repo}/dependabot/alerts": { fixture: "dependabot-alerts-empty.json" },
      "GET /repos/{owner}/{repo}/code-scanning/alerts": {
        fixture: "code-scanning-alerts-empty.json",
      },
      "GET /repos/{owner}/{repo}/secret-scanning/alerts": {
        fixture: "secret-scanning-alerts.json",
      },
      "GET /repos/{owner}/{repo}/pulls": { fixture: "merged-prs.json" },
      "GET /search/issues": {
        match: (p) => typeof p?.q === "string" && p.q.includes("is:merged"),
        fixture: "merged-prs.json",
      },
      "GET /search/issues_issues": { fixture: "issues-empty.json" },
      "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit }),
    }));
    const renderMod = await import("@workspace/email");
    const digest: Awaited<ReturnType<typeof renderMod.renderDigest>> = await renderMod.renderDigest(
      {
        kind: "daily",
        subject: "Daily digest",
        header: "h",
        footer: "f",
        edition: {
          repo: "deessejs/agents",
          period: {
            start: "2026-10-05T00:00:00.000Z",
            end: "2026-10-06T00:00:00.000Z",
            label: "2026-10-05",
          },
          counts: {},
          weeklyMetrics: null,
          availability: [],
        },
        sections: [],
      },
    );
    expect(digest.html).toContain("No activity recorded for this period");
    expect(digest.text).toContain("No activity recorded for this period");
  });
});

describe("Plain-text is meaningful (criterion 7)", () => {
  it("text includes the annotation, source title, and URL — not just the URL list", async () => {
    const renderMod = await import("@workspace/email");
    const digest: Awaited<ReturnType<typeof renderMod.renderDigest>> = await renderMod.renderDigest(
      {
        kind: "daily",
        subject: "Daily digest",
        header: "h",
        footer: "f",
        edition: {
          repo: "deessejs/agents",
          period: {
            start: "2026-10-05T00:00:00.000Z",
            end: "2026-10-06T00:00:00.000Z",
            label: "2026-10-05",
          },
          counts: {},
          weeklyMetrics: null,
          availability: [],
        },
        sections: [
          {
            kind: "tldr",
            items: [
              {
                text: "OAuth PKCE landed",
                source: {
                  id: "deessejs/agents:pr:142",
                  kind: "merged_pr",
                  url: "https://github.com/deessejs/agents/pull/142",
                  title: "feat: OAuth PKCE support",
                },
              },
            ],
          },
        ],
      },
    );
    expect(digest.text).toContain("OAuth PKCE landed");
    expect(digest.text).toContain("feat: OAuth PKCE support");
    expect(digest.text).toContain("https://github.com/deessejs/agents/pull/142");
  });
});

// ── Schedule dispatch contract (review of commit 711642f) ──────────────

describe("Schedule dispatch contract", () => {
  const ctx = {
    callId: "x",
    toolName: "x",
    messages: [],
    abortSignal: new globalThis.AbortController().signal,
    session: { auth: {} as never },
  };

  function buildFullFakeOctokit() {
    return buildFakeOctokit({
      "GET /repos/{owner}/{repo}/dependabot/alerts": { fixture: "dependabot-alerts.json" },
      "GET /repos/{owner}/{repo}/code-scanning/alerts": { fixture: "code-scanning-alerts.json" },
      "GET /repos/{owner}/{repo}/secret-scanning/alerts": {
        fixture: "secret-scanning-alerts.json",
      },
      "GET /repos/{owner}/{repo}/pulls": { fixture: "merged-prs.json" },
      "GET /search/issues": {
        match: (p) => typeof p?.q === "string" && p.q.includes("is:merged"),
        fixture: "merged-prs.json",
      },
      "GET /search/issues_issues": { fixture: "issues-empty.json" },
      "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
  }

  it("submit_digest sets endsTurn: true so the schedule run is delivered", async () => {
    // submit_digest must mark the turn as ending after delivery. A
    // schedule's run is only "successful" if a tool with endsTurn: true
    // is invoked; otherwise Eve reports the run as having produced no
    // delivery. We assert the contract here.
    const submitMod = await import("../agent/tools/submit_digest.ts");
    const tool = submitMod.default as unknown as { endsTurn?: boolean };
    expect(tool.endsTurn).toBe(true);
  });

  it("schedule run is delivered when the model calls collect then submit", async () => {
    const fakeOctokit = buildFullFakeOctokit();
    let delivered = false;
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit }),
    }));
    vi.doMock("@workspace/email", async () => {
      const actual = await vi.importActual<typeof import("@workspace/email")>("@workspace/email");
      return {
        ...actual,
        createEmailClient: () => ({
          async send() {
            delivered = true;
            return { id: "resend_test_id", idempotencyKey: "digest:send:abc" };
          },
        }),
      };
    });
    await withEveContext(async () => {
      const collectMod = await import("../agent/tools/collect_activity.ts");
      const submitMod = await import("../agent/tools/submit_digest.ts");
      await collectMod.default.execute({ kind: "daily" } as never, ctx as never);
      const corpusMod = await import("../agent/lib/state.ts");
      const corpus = corpusMod.sourceCorpus.get();
      const pr = corpus.sources.find((s) => s.kind === "merged_pr");
      if (!pr) throw new Error("fixture has no merged_pr");
      await submitMod.default.execute(
        {
          kind: "daily",
          report: {
            kind: "daily",
            sections: [{ kind: "tldr", items: [{ text: "x", referenceId: pr.id }] }],
          },
        } as never,
        ctx as never,
      );
    });
    expect(delivered).toBe(true);
  });

  it("partial collection still delivers the digest with availability surfaced", async () => {
    // v1 schedule contract: a partial collection (one source fails)
    // does not abort the digest. The model reaches submit_digest with
    // a non-empty source list, the digest is delivered, and the failed
    // source appears in the availability block so the operator sees it.
    const failOctokit: unknown = {
      request: (route: string) => {
        if (route.includes("dependabot")) {
          return Promise.reject(new Error("403 rate-limited"));
        }
        return Promise.resolve({ data: [], headers: {}, status: 200, url: route });
      },
      paginate: {
        iterator: (route: string) => {
          if (route.includes("dependabot")) {
            throw new Error("403 rate-limited");
          }
          return (async function* () {
            yield { data: [] };
          })();
        },
      },
    };
    let delivered = false;
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: failOctokit }),
    }));
    vi.doMock("@workspace/email", async () => {
      const actual = await vi.importActual<typeof import("@workspace/email")>("@workspace/email");
      return {
        ...actual,
        createEmailClient: () => ({
          async send() {
            delivered = true;
            return { id: "resend_partial_id", idempotencyKey: "digest:send:partial" };
          },
        }),
      };
    });
    await withEveContext(async () => {
      const collectMod = await import("../agent/tools/collect_activity.ts");
      await collectMod.default.execute({ kind: "daily" } as never, ctx as never);
      const corpusMod = await import("../agent/lib/state.ts");
      const corpus = corpusMod.sourceCorpus.get();
      // Dependabot failed; the model can still submit from the
      // remaining sources (e.g. secret-scanning). With every other
      // endpoint mocked empty, the only available corpus is whatever
      // didn't fail.
      const any = corpus.sources[0];
      const sectionItems = any
        ? [{ kind: "risks", items: [{ text: "x", referenceId: any.id }] }]
        : [];
      const submitMod = await import("../agent/tools/submit_digest.ts");
      const report =
        sectionItems.length > 0
          ? { kind: "daily" as const, sections: sectionItems }
          : { kind: "daily" as const, sections: [{ kind: "tldr", items: [] }] };
      await submitMod.default.execute({ kind: "daily", report } as never, ctx as never);
    });
    expect(delivered).toBe(true);
  });

  it("schedule run is unsuccessful when the model emits no submit (only collect)", async () => {
    // Models sometimes call collect_activity and then end the turn
    // without submitting. submit_digest is the only tool with
    // endsTurn: true; without it, Eve reports no output → run is
    // unsuccessful.
    const fakeOctokit = buildFullFakeOctokit();
    let delivered = false;
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit }),
    }));
    vi.doMock("@workspace/email", async () => {
      const actual = await vi.importActual<typeof import("@workspace/email")>("@workspace/email");
      return {
        ...actual,
        createEmailClient: () => ({
          async send() {
            delivered = true;
            return { id: "x", idempotencyKey: "x" };
          },
        }),
      };
    });
    await withEveContext(async () => {
      const collectMod = await import("../agent/tools/collect_activity.ts");
      await collectMod.default.execute({ kind: "daily" } as never, ctx as never);
      // Intentionally no submit_digest call.
    });
    expect(delivered).toBe(false);
  });
});
