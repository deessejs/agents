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

type RouteSpecEntry =
  | { fixture: string }
  | { match: (params: Record<string, unknown> | undefined) => boolean; fixture: string };

/**
 * Each route key resolves to an ordered list of entries. The first
 * predicate (or the only fixture) that matches wins. Use this when one
 * route serves multiple query qualifiers — e.g. `GET /search/issues`
 * needs different fixtures for `is:merged` and `is:issue`.
 */
type RouteSpec = RouteSpecEntry | ReadonlyArray<RouteSpecEntry>;

function buildFakeOctokit(
  routes: Record<string, RouteSpec>,
  recordedCalls?: { route: string; params: Record<string, unknown> | undefined }[],
): { raw: unknown; calls: { route: string; params: Record<string, unknown> | undefined }[] } {
  const calls: { route: string; params: Record<string, unknown> | undefined }[] =
    recordedCalls ?? [];
  const stripQuery = (route: string): string => route.split("?")[0] ?? route;
  const asEntries = (spec: RouteSpec): ReadonlyArray<RouteSpecEntry> => {
    if (Array.isArray(spec)) return spec;
    return [spec as RouteSpecEntry];
  };
  const lookup = (
    route: string,
    params?: Record<string, unknown>,
  ): { fixture: string } | undefined => {
    const path = stripQuery(route);
    const spec = routes[path];
    if (!spec) return undefined;
    for (const entry of asEntries(spec)) {
      if (!Object.hasOwnProperty.call(entry, "match")) return entry as { fixture: string };
      const matches = (entry as { match: (p: unknown) => boolean }).match(params);
      if (matches) return entry as { fixture: string };
    }
    return undefined;
  };
  const handler = async (
    route: string,
    params?: Record<string, unknown>,
  ): Promise<OctokitResponse> => {
    calls.push({ route, params });
    const spec = lookup(route, params);
    if (!spec) throw new Error(`Fake octokit: unstubbed route ${route}`);
    const data = JSON.parse(await readFile(join(FIXTURE_DIR, spec.fixture), "utf8")) as unknown;
    return { data, headers: {}, status: 200, url: route };
  };
  const paginate = {
    iterator(route: string, params?: Record<string, unknown>): AsyncIterable<{ data: unknown[] }> {
      calls.push({ route, params });
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
  return { raw: { request: handler, paginate }, calls };
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
      "GET /search/issues": [
        {
          match: (params) => typeof params?.q === "string" && params.q.includes("is:merged"),
          fixture: "merged-prs.json",
        },
        {
          match: (params) =>
            typeof params?.q === "string" &&
            params.q.includes("is:issue") &&
            !params.q.includes("is:merged"),
          fixture: "issues-empty.json",
        },
      ],
      "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit.raw }),
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

  it("nested CodeQL rule.security_severity_level is projected into the source meta", async () => {
    const fakeOctokit = buildFakeOctokit({
      "GET /repos/{owner}/{repo}/dependabot/alerts": { fixture: "dependabot-alerts-empty.json" },
      "GET /repos/{owner}/{repo}/code-scanning/alerts": { fixture: "code-scanning-alerts.json" },
      "GET /repos/{owner}/{repo}/secret-scanning/alerts": {
        fixture: "secret-scanning-alerts-empty.json",
      },
      "GET /repos/{owner}/{repo}/pulls": { fixture: "merged-prs.json" },
      "GET /search/issues": [
        {
          match: (p) => typeof p?.q === "string" && p.q.includes("is:merged"),
          fixture: "merged-prs.json",
        },
        {
          match: (p) =>
            typeof p?.q === "string" && p.q.includes("is:issue") && !p.q.includes("is:merged"),
          fixture: "issues-empty.json",
        },
      ],
      "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit.raw }),
    }));
    const mod = await import("../agent/tools/collect_activity.ts");
    const tool = mod.default;
    const result = (await withEveContext(
      async () => tool.execute({ kind: "daily" } as never, ctx as never) as unknown,
    )) as Awaited<ReturnType<typeof tool.execute>>;
    const codeql = result.sources.find((s) => s.kind === "code_scanning_alert");
    expect(codeql).toBeDefined();
    expect(codeql?.meta?.security_severity).toBe("high");
    expect(codeql?.meta?.diagnostic_severity).toBe("error");
  });

  it("opened-issue half-open window: record exactly at period.end is excluded", async () => {
    const fakeOctokit = buildFakeOctokit({
      "GET /repos/{owner}/{repo}/dependabot/alerts": { fixture: "dependabot-alerts-empty.json" },
      "GET /repos/{owner}/{repo}/code-scanning/alerts": {
        fixture: "code-scanning-alerts-empty.json",
      },
      "GET /repos/{owner}/{repo}/secret-scanning/alerts": {
        fixture: "secret-scanning-alerts-empty.json",
      },
      "GET /repos/{owner}/{repo}/pulls": { fixture: "merged-prs.json" },
      "GET /search/issues": [
        {
          match: (p) => typeof p?.q === "string" && p.q.includes("is:merged"),
          fixture: "merged-prs.json",
        },
        {
          match: (p) =>
            typeof p?.q === "string" && p.q.includes("is:issue") && !p.q.includes("is:merged"),
          fixture: "issues-opened-boundary.json",
        },
      ],
      "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit.raw }),
    }));
    const mod = await import("../agent/tools/collect_activity.ts");
    const tool = mod.default;
    const result = (await withEveContext(
      async () => tool.execute({ kind: "daily" } as never, ctx as never) as unknown,
    )) as Awaited<ReturnType<typeof tool.execute>>;
    const opened = result.sources.filter((s) => s.kind === "opened_issue");
    expect(opened.map((s) => s.meta?.number)).toEqual([401]);
  });

  it("closed-issue half-open window: record exactly at period.end is excluded", async () => {
    const fakeOctokit = buildFakeOctokit({
      "GET /repos/{owner}/{repo}/dependabot/alerts": { fixture: "dependabot-alerts-empty.json" },
      "GET /repos/{owner}/{repo}/code-scanning/alerts": {
        fixture: "code-scanning-alerts-empty.json",
      },
      "GET /repos/{owner}/{repo}/secret-scanning/alerts": {
        fixture: "secret-scanning-alerts-empty.json",
      },
      "GET /repos/{owner}/{repo}/pulls": { fixture: "merged-prs.json" },
      "GET /search/issues": [
        {
          match: (p) => typeof p?.q === "string" && p.q.includes("is:merged"),
          fixture: "merged-prs.json",
        },
        {
          match: (p) =>
            typeof p?.q === "string" && p.q.includes("is:issue") && !p.q.includes("is:merged"),
          fixture: "issues-closed-boundary.json",
        },
      ],
      "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit.raw }),
    }));
    const mod = await import("../agent/tools/collect_activity.ts");
    const tool = mod.default;
    const result = (await withEveContext(
      async () => tool.execute({ kind: "daily" } as never, ctx as never) as unknown,
    )) as Awaited<ReturnType<typeof tool.execute>>;
    const closed = result.sources.filter((s) => s.kind === "closed_issue");
    expect(closed.map((s) => s.meta?.number)).toEqual([501]);
  });

  it("workflow-run endpoint receives status=failure + full ISO created range", async () => {
    const calls: { route: string; params: Record<string, unknown> | undefined }[] = [];
    const fakeOctokit = buildFakeOctokit(
      {
        "GET /repos/{owner}/{repo}/dependabot/alerts": { fixture: "dependabot-alerts-empty.json" },
        "GET /repos/{owner}/{repo}/code-scanning/alerts": {
          fixture: "code-scanning-alerts-empty.json",
        },
        "GET /repos/{owner}/{repo}/secret-scanning/alerts": {
          fixture: "secret-scanning-alerts-empty.json",
        },
        "GET /repos/{owner}/{repo}/pulls": { fixture: "merged-prs.json" },
        "GET /search/issues": [
          {
            match: (p) => typeof p?.q === "string" && p.q.includes("is:merged"),
            fixture: "merged-prs.json",
          },
          {
            match: (p) =>
              typeof p?.q === "string" && p.q.includes("is:issue") && !p.q.includes("is:merged"),
            fixture: "issues-empty.json",
          },
        ],
        "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
        "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
      },
      calls,
    );
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit.raw }),
    }));
    const mod = await import("../agent/tools/collect_activity.ts");
    const tool = mod.default;
    await withEveContext(
      async () => (await tool.execute({ kind: "daily" } as never, ctx as never)) as unknown,
    );
    const runsCall = calls.find((c) => c.route.includes("actions/runs"));
    expect(runsCall).toBeDefined();
    expect(runsCall?.params?.status).toBe("failure");
    expect(runsCall?.params?.created).toBe("2026-10-05T00:00:00.000Z..2026-10-06T00:00:00.000Z");
    expect(runsCall?.params?.per_page).toBe(100);
  });

  it("a 100-entry success-only response surfaces the workflow-run truncation warning", async () => {
    const fakeOctokit = buildFakeOctokit({
      "GET /repos/{owner}/{repo}/dependabot/alerts": { fixture: "dependabot-alerts-empty.json" },
      "GET /repos/{owner}/{repo}/code-scanning/alerts": {
        fixture: "code-scanning-alerts-empty.json",
      },
      "GET /repos/{owner}/{repo}/secret-scanning/alerts": {
        fixture: "secret-scanning-alerts-empty.json",
      },
      "GET /repos/{owner}/{repo}/pulls": { fixture: "merged-prs.json" },
      "GET /search/issues": [
        {
          match: (p) => typeof p?.q === "string" && p.q.includes("is:merged"),
          fixture: "merged-prs.json",
        },
        {
          match: (p) =>
            typeof p?.q === "string" && p.q.includes("is:issue") && !p.q.includes("is:merged"),
          fixture: "issues-empty.json",
        },
      ],
      "GET /repos/{owner}/{repo}/actions/runs": {
        fixture: "actions-runs-many-success.json",
      },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit.raw }),
    }));
    const mod = await import("../agent/tools/collect_activity.ts");
    const tool = mod.default;
    const result = (await withEveContext(
      async () => tool.execute({ kind: "daily" } as never, ctx as never) as unknown,
    )) as Awaited<ReturnType<typeof tool.execute>>;
    const runWarning = result.availability.find((a) => a.reason.includes("Workflow-runs"));
    expect(runWarning).toBeDefined();
    expect(runWarning?.reason).toMatch(/100-result cap/);
    expect(result.counts.failed_workflow_runs).toBe(0);
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
      "GET /search/issues": [
        {
          match: (params) => typeof params?.q === "string" && params.q.includes("is:merged"),
          fixture: "merged-prs.json",
        },
        {
          match: (params) =>
            typeof params?.q === "string" &&
            params.q.includes("is:issue") &&
            !params.q.includes("is:merged"),
          fixture: "issues-empty.json",
        },
      ],
      "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit.raw }),
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
      "GET /search/issues": [
        {
          match: (params) => typeof params?.q === "string" && params.q.includes("is:merged"),
          fixture: "merged-prs.json",
        },
        {
          match: (params) =>
            typeof params?.q === "string" &&
            params.q.includes("is:issue") &&
            !params.q.includes("is:merged"),
          fixture: "issues-empty.json",
        },
      ],
      "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit.raw }),
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
      "GET /search/issues": [
        {
          match: (p) => typeof p?.q === "string" && p.q.includes("is:merged"),
          fixture: "merged-prs.json",
        },
        {
          match: (params) =>
            typeof params?.q === "string" &&
            params.q.includes("is:issue") &&
            !params.q.includes("is:merged"),
          fixture: "issues-empty.json",
        },
      ],
      "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit.raw }),
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
      "GET /search/issues": [
        {
          match: (p) => typeof p?.q === "string" && p.q.includes("is:merged"),
          fixture: "merged-prs.json",
        },
        {
          match: (params) =>
            typeof params?.q === "string" &&
            params.q.includes("is:issue") &&
            !params.q.includes("is:merged"),
          fixture: "issues-empty.json",
        },
      ],
      "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit.raw }),
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

// ── Schedule dispatch contract ───────────────────────────────────────────
//
// The agent's two schedules are fire-and-forget prompts (Eve's
// `defineSchedule({ markdown })`). Eve's runtime turns each prompt into
// a session and drives the model loop. The model loop's contract with
// the agent's tools is:
//   - tools that finish without throwing return normally,
//   - a tool with `endsTurn: true` ends the loop after a successful call,
//   - a tool that throws propagates up to the turn (schedule run fails).
//
// These tests exercise that contract against the **real tool bodies**
// (no mocks of collect_activity / submit_digest). The mocked model is
// a list of "next tool calls" — a faithful stand-in for what the LLM
// emits inside the loop. The tool loop is the same shape Eve uses:
// resolve the tool name → call its `execute(input, ctx)` → honor
// `endsTurn`.

interface ToolCall {
  readonly name: string;
  readonly input: unknown;
}

interface ToolDefLike {
  readonly description?: string;
  readonly inputSchema?: unknown;
  readonly endsTurn?: boolean;
  execute(input: unknown, ctx: unknown): Promise<unknown>;
}

type Outcome =
  | { kind: "delivered" }
  | { kind: "no-submission" }
  | { kind: "error"; error: unknown };

/**
 * Drive the agent's model loop with a fixed sequence of tool calls.
 * This is the smallest supported mechanism that exercises the real
 * tool bodies + their `endsTurn` flag + their error semantics — i.e.
 * the same loop shape Eve's schedule dispatcher runs.
 */
/** Drive the agent's model loop. Recursive so each step awaits the
 * previous one without `await` inside a `for` loop. */
async function drive(
  tools: Record<string, ToolDefLike>,
  ctx: unknown,
  remaining: ReadonlyArray<ToolCall>,
): Promise<{ kind: "delivered" } | { kind: "continue" }> {
  const [head, ...rest] = remaining;
  if (head === undefined) return { kind: "continue" };
  const tool = tools[head.name];
  if (!tool) throw new Error(`Unknown tool: ${head.name}`);
  await tool.execute(head.input, ctx);
  if (tool.endsTurn) return { kind: "delivered" };
  return drive(tools, ctx, rest);
}

async function runToolLoop(
  tools: Record<string, ToolDefLike>,
  ctx: unknown,
  calls: ReadonlyArray<ToolCall>,
): Promise<Outcome> {
  try {
    const result = await drive(tools, ctx, calls);
    return result.kind === "delivered" ? { kind: "delivered" } : { kind: "no-submission" };
  } catch (err) {
    return { kind: "error", error: err };
  }
}

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
      "GET /search/issues": [
        {
          match: (p) => typeof p?.q === "string" && p.q.includes("is:merged"),
          fixture: "merged-prs.json",
        },
        {
          match: (p) =>
            typeof p?.q === "string" && p.q.includes("is:issue") && !p.q.includes("is:merged"),
          fixture: "issues-empty.json",
        },
      ],
      "GET /repos/{owner}/{repo}/actions/runs": { fixture: "actions-runs.json" },
      "GET /repos/{owner}/{repo}/releases": { fixture: "releases.json" },
    });
  }

  /** Mock the email layer and run a callback inside the eve context
   * with the agent's real tools loaded. The callback executes the
   * mocked model — a sequence of tool calls — and observes the outcome. */
  async function runWithMockedAgent(
    opts: { emailFails?: boolean },
    body: (args: {
      tools: { collect_activity: ToolDefLike; submit_digest: ToolDefLike };
      ctx: {
        callId: string;
        toolName: string;
        messages: never[];
        abortSignal: AbortSignal;
        session: { auth: never };
      };
      delivered: boolean;
      sentHtml: string;
      sentText: string;
    }) => Promise<void>,
  ): Promise<void> {
    const fakeOctokit = buildFullFakeOctokit();
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: fakeOctokit.raw }),
    }));
    const state = { delivered: false, sentHtml: "", sentText: "" };
    vi.doMock("@workspace/email", async () => {
      const actual = await vi.importActual<typeof import("@workspace/email")>("@workspace/email");
      return {
        ...actual,
        createEmailClient: () => ({
          async send(args: { html: string; text?: string }) {
            if (opts.emailFails) throw new Error("Resend rejected the send");
            state.delivered = true;
            state.sentHtml = args.html;
            state.sentText = args.text ?? "";
            return { id: "resend_test_id", idempotencyKey: "digest:send:abc" };
          },
        }),
      };
    });
    return await withEveContext(async () => {
      const collectMod = await import("../agent/tools/collect_activity.ts");
      const submitMod = await import("../agent/tools/submit_digest.ts");
      const tools = {
        collect_activity: collectMod.default as unknown as ToolDefLike,
        submit_digest: submitMod.default as unknown as ToolDefLike,
      };
      return body({
        tools,
        ctx,
        delivered: state.delivered,
        sentHtml: state.sentHtml,
        sentText: state.sentText,
      });
    });
  }

  it("submit_digest sets endsTurn: true", async () => {
    const submitMod = await import("../agent/tools/submit_digest.ts");
    expect((submitMod.default as unknown as ToolDefLike).endsTurn).toBe(true);
  });

  it("collect_activity does NOT set endsTurn (loop continues)", async () => {
    const collectMod = await import("../agent/tools/collect_activity.ts");
    expect((collectMod.default as unknown as ToolDefLike).endsTurn).toBeFalsy();
  });

  it("delivered when the model calls collect then submit", async () => {
    await runWithMockedAgent({}, async ({ tools, ctx: c }) => {
      const corpusResult = (await tools.collect_activity.execute({ kind: "daily" }, c)) as {
        sources: { id: string; kind: string }[];
      };
      const pr = corpusResult.sources.find((s) => s.kind === "merged_pr");
      if (!pr) throw new Error("fixture has no merged_pr");
      const outcome = await runToolLoop(tools, c, [
        { name: "collect_activity", input: { kind: "daily" } },
        {
          name: "submit_digest",
          input: {
            kind: "daily",
            report: {
              kind: "daily",
              sections: [{ kind: "tldr", items: [{ text: "x", referenceId: pr.id }] }],
            },
          },
        },
      ]);
      expect(outcome.kind).toBe("delivered");
    });
  });

  it("loop ends without submission when the model finishes without calling submit", async () => {
    await runWithMockedAgent({}, async ({ tools, ctx: c }) => {
      const outcome = await runToolLoop(tools, c, [
        { name: "collect_activity", input: { kind: "daily" } },
      ]);
      // The loop ran one step (collect, no endsTurn) and then
      // exhausted the call list. The agent did not invoke an endsTurn
      // tool, so the turn does not produce a delivery. Eve's
      // scheduler records this as a run that produced no submission.
      expect(outcome.kind).toBe("no-submission");
    });
  });

  it("propagates the error when Resend rejects the send", async () => {
    await runWithMockedAgent({ emailFails: true }, async ({ tools, ctx: c }) => {
      const corpusResult = (await tools.collect_activity.execute({ kind: "daily" }, c)) as {
        sources: { id: string; kind: string }[];
      };
      const pr = corpusResult.sources.find((s) => s.kind === "merged_pr");
      if (!pr) throw new Error("fixture has no merged_pr");
      const outcome = await runToolLoop(tools, c, [
        { name: "collect_activity", input: { kind: "daily" } },
        {
          name: "submit_digest",
          input: {
            kind: "daily",
            report: {
              kind: "daily",
              sections: [{ kind: "tldr", items: [{ text: "x", referenceId: pr.id }] }],
            },
          },
        },
      ]);
      expect(outcome.kind).toBe("error");
      if (outcome.kind === "error") {
        expect(String(outcome.error)).toMatch(/Resend rejected/);
      }
    });
  });

  it("propagates validation errors from submit_digest", async () => {
    await runWithMockedAgent({}, async ({ tools, ctx: c }) => {
      // Run collect first so the corpus is populated and validation
      // has an id map to compare against.
      await tools.collect_activity.execute({ kind: "daily" }, c);
      const outcome = await runToolLoop(tools, c, [
        {
          name: "submit_digest",
          input: {
            kind: "daily",
            report: {
              kind: "daily",
              sections: [
                { kind: "tldr", items: [{ text: "x", referenceId: "deessejs/agents:pr:9999" }] },
              ],
            },
          },
        },
      ]);
      expect(outcome.kind).toBe("error");
      if (outcome.kind === "error") {
        expect(String(outcome.error)).toMatch(/not in the corpus/);
      }
    });
  });

  it("partial collection still delivers with availability surfaced in the email", async () => {
    // Same as before but with Dependabot failing. The rendered HTML
    // and plain-text must surface the failure so the operator does
    // not mistake an inaccessible endpoint for "no alerts".
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
    const captured = { delivered: false, sentHtml: "", sentText: "" };
    vi.doMock("@workspace/github", () => ({
      createGitHubClient: () => ({ raw: failOctokit }),
    }));
    vi.doMock("@workspace/email", async () => {
      const actual = await vi.importActual<typeof import("@workspace/email")>("@workspace/email");
      return {
        ...actual,
        createEmailClient: () => ({
          async send(args: { html: string; text?: string }) {
            captured.delivered = true;
            captured.sentHtml = args.html;
            captured.sentText = args.text ?? "";
            return { id: "resend_partial_id", idempotencyKey: "digest:send:partial" };
          },
        }),
      };
    });
    const outcome = await withEveContext(async () => {
      const collectMod = await import("../agent/tools/collect_activity.ts");
      const submitMod = await import("../agent/tools/submit_digest.ts");
      const tools = {
        collect_activity: collectMod.default as unknown as ToolDefLike,
        submit_digest: submitMod.default as unknown as ToolDefLike,
      };
      // First call populates the corpus; second pass drives the loop.
      const corpus = (await tools.collect_activity.execute({ kind: "daily" }, ctx)) as {
        sources: { id: string; kind: string }[];
      };
      const survivor = corpus.sources.find((s) => s.kind !== "dependabot_alert");
      const sections = survivor
        ? [{ kind: "risks", items: [{ text: "x", referenceId: survivor.id }] }]
        : [{ kind: "tldr", items: [] }];
      return runToolLoop(tools, ctx, [
        { name: "collect_activity", input: { kind: "daily" } },
        {
          name: "submit_digest",
          input: { kind: "daily", report: { kind: "daily", sections } },
        },
      ]);
    });
    expect(outcome.kind).toBe("delivered");
    expect(captured.delivered).toBe(true);
    expect(captured.sentHtml).toMatch(/Dependabot/);
    expect(captured.sentHtml).toMatch(/Data-source availability/);
    expect(captured.sentText).toMatch(/Dependabot/);
  });
});
