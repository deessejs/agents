/**
 * Acceptance tests for the Technical Analyst.
 *
 * These tests exercise the REAL tool bodies (collect_activity +
 * submit_digest) with mocked GitHub + Resend + KV. They cover the
 * 10 acceptance criteria from the refactor brief. Criteria 1-3
 * (Eve discovery, build, schedule dispatch) are exercised by the
 * `eve info` + `eve build` steps in CI on Node 24.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
  UNSUBSCRIBE_BASE_URL: "https://app.example.com",
  UNSUBSCRIBE_MAILTO: "unsubscribe@example.com",
  MINIMAX_API_KEY: "minimax_test_key",
  LLM_PROVIDER: "minimax",
  LLM_MODEL_ID: "minimax-m3",
  KV_REST_API_URL: "https://example.com/kv",
  KV_REST_API_TOKEN: "kv_test_token",
  AGENTS_PAUSED: "false",
} as const;

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED_NOW, toFake: ["Date"] });
  for (const [k, v] of Object.entries(envValues)) {
    process.env[k] = String(v);
  }
  delete process.env.RESEND_REPLY_TO;
});

afterEach(() => {
  vi.useRealTimers();
  for (const k of Object.keys(envValues)) {
    delete process.env[k];
  }
  kvStore.clear();
  vi.resetModules();
});

// ── Mocked Octokit + KV + Resend ────────────────────────────────────────

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "github-rest");

interface OctokitResponse {
  data: unknown;
  headers: Record<string, string>;
  status: number;
  url: string;
}

function buildFakeOctokit(routes: Record<string, { fixture: string }>): unknown {
  const handler = async (route: string): Promise<OctokitResponse> => {
    const spec = routes[route];
    if (!spec) throw new Error(`Fake octokit: unstubbed route ${route}`);
    const data = JSON.parse(await readFile(join(FIXTURE_DIR, spec.fixture), "utf8")) as unknown;
    return { data, headers: {}, status: 200, url: route };
  };
  const paginate = {
    iterator(route: string): AsyncIterable<{ data: unknown[] }> {
      const spec = routes[route];
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

const kvStore = new Map<string, unknown>();

vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn(async <T>(key: string) => (kvStore.get(key) as T | undefined) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      kvStore.set(key, value);
      return "OK";
    }),
  },
}));

// ── Discovery ───────────────────────────────────────────────────────────

describe("Tool discovery (criteria 1-3)", () => {
  it("the agent manifest exports a defineAgent + two business tools + opt-in no_reply", async () => {
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
    // no_reply.ts is a one-line re-export of `noReply()` from eve —
    // it's still a tool, just not defined with defineTool directly.
    const noReplyRaw = await readFile(resolve(toolsDir, "no_reply.ts"), "utf8");
    expect(noReplyRaw).toContain("noReply");
    const schedulesDir = resolve(base, "schedules");
    const daily = await readFile(resolve(schedulesDir, "daily-digest.ts"), "utf8");
    expect(daily).toContain("defineSchedule");
    expect(daily).toMatch(/cron: "0 20 \* \* \*"/);
    const weekly = await readFile(resolve(schedulesDir, "weekly-recap.ts"), "utf8");
    expect(weekly).toContain("defineSchedule");
    expect(weekly).toMatch(/cron: "0 16 \* \* 5"/);
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
      "GET /orgs/{org}/dependabot/alerts": { fixture: "dependabot-alerts.json" },
      "GET /orgs/{org}/code-scanning/alerts": { fixture: "code-scanning-alerts.json" },
      "GET /orgs/{org}/secret-scanning/alerts": { fixture: "secret-scanning-alerts.json" },
      "GET /repos/{owner}/{repo}/pulls": { fixture: "merged-prs.json" },
      "GET /search/issues": { fixture: "issues-empty.json" },
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

  it("throws when an essential source (Dependabot) fails", async () => {
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
    await expect(
      withEveContext(async () => tool.execute({ kind: "daily" } as never, ctx as never)),
    ).rejects.toThrow(/503/);
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
      "GET /orgs/{org}/dependabot/alerts": { fixture: "dependabot-alerts.json" },
      "GET /orgs/{org}/code-scanning/alerts": { fixture: "code-scanning-alerts.json" },
      "GET /orgs/{org}/secret-scanning/alerts": { fixture: "secret-scanning-alerts.json" },
      "GET /repos/{owner}/{repo}/pulls": { fixture: "merged-prs.json" },
      "GET /search/issues": { fixture: "issues-empty.json" },
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
          sendBatch: async () => [],
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

  it("reuses the persisted payload + idempotency key when the KV record is already delivered", async () => {
    await withCollectionLoaded(async ({ submit }) => {
      const corpusMod = await import("../agent/lib/state.ts");
      const kvMod = await import("../agent/lib/kv-edition.ts");
      const corpus = corpusMod.sourceCorpus.get();
      const ed = corpusMod.edition.get();
      const pr = corpus.sources.find((s) => s.kind === "merged_pr");
      if (!pr) throw new Error("no merged_pr");

      await kvMod.writePending({
        editionId: ed.id,
        org: envValues.GITHUB_ORG,
        repo: envValues.GITHUB_REPO,
        kind: "daily" as const,
        periodStart: corpus.edition.period.start,
        periodEnd: corpus.edition.period.end,
        recipient: envValues.DIGEST_RECIPIENT,
        subject: "previously-sent",
        html: "<p/>",
        text: "",
        idempotencyKey: "digest:send:prior",
        messageId: null,
        status: "pending",
        firstAttemptAt: new Date().toISOString(),
        deliveredAt: null,
      });
      await kvMod.markDelivered(ed.id, "resend_prior_id");

      const result = (await unwrap(
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
      )) as Awaited<ReturnType<typeof submit.execute>>;
      expect(result.status).toBe("already-delivered");
      if (result.status === "already-delivered") {
        expect(result.messageId).toBe("resend_prior_id");
      }
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
      "GET /orgs/{org}/dependabot/alerts": { fixture: "dependabot-alerts-empty.json" },
      "GET /orgs/{org}/code-scanning/alerts": { fixture: "code-scanning-alerts-empty.json" },
      "GET /orgs/{org}/secret-scanning/alerts": {
        fixture: "secret-scanning-alerts-synthetic.json",
      },
      "GET /repos/{owner}/{repo}/pulls": { fixture: "merged-prs.json" },
      "GET /search/issues": { fixture: "issues-empty.json" },
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
