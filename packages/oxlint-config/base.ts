/**
 * Shared oxlint config factory for the monorepo.
 *
 * Usage from a workspace's oxlint.config.ts:
 *   import { baseOxlintConfig } from "@workspace/oxlint-config/oxlint";
 *   export default { ...baseOxlintConfig, ignorePatterns: [...] };
 *
 * Philosophy: focus on real correctness and security issues. Pedantic
 * style rules are off by default — let the formatter (oxfmt) handle those.
 */
export const baseOxlintConfig = {
  plugins: ["typescript", "import", "promise", "vitest"],
  categories: {
    correctness: "error",
    perf: "error",
    // restriction is off: it flags structural choices (relative imports,
    // exports position) that are fine in our package layout. We use
    // a focused rule list below instead.
    restriction: "off",
    // suspicious is on at the root (highest-signal correctness rules).
    // Promoted to error because this repo handles PATs, JWTs, env, PII —
    // we cannot allow lax checking of suspicious constructs.
    suspicious: "error",
    nursery: "warn",
    pedantic: "off",
    style: "off",
  },
  // Node.js globals — every package targets Node 22+
  globals: {
    process: "readonly",
    console: "readonly",
    Buffer: "readonly",
    setTimeout: "readonly",
    clearTimeout: "readonly",
    setInterval: "readonly",
    clearInterval: "readonly",
    setImmediate: "readonly",
    clearImmediate: "readonly",
    global: "readonly",
    globalThis: "readonly",
    URL: "readonly",
    URLSearchParams: "readonly",
    fetch: "readonly",
    crypto: "readonly",
    performance: "readonly",
    // Web Fetch API globals (Node 22+). Used by route handlers in
    // apps/* that don't import a framework-supplied Request/Response.
    Request: "readonly",
    Response: "readonly",
    Headers: "readonly",
    FormData: "readonly",
  },
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    // `any` enforcement philosophy: ban explicit `any` outright;
    // no-unsafe-argument is also error to keep the unsafe-pointer family
    // consistent — if a function takes `any`, callers must be explicit.
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-argument": "error",
    // Strict equality — `==`/`!=` is a foot-gun in a security-sensitive repo.
    // oxlint's eqeqeq accepts only `"always"` or `"smart"`; `"always"` is the
    // strictest mode (covers the `{ null: "always" }` ESLint semantics).
    eqeqeq: ["error", "always"],
    // Assignment in conditionals is almost always a bug; promote to error
    // (correctness category already covers this, but pin explicitly).
    "no-cond-assign": "error",
    // Console output: warn by default (people still call console.log to
    // debug), but allow console.error so the OTel shutdown path can
    // surface fatal flush failures. Pin to "warn" rather than "error"
    // so a stray debug log doesn't fail CI in a security-sensitive code path.
    "no-console": ["warn", { allow: ["error"] }],
    // debugger statements are a foot-gun in committed code — they hang the
    // process if a breakpoint is open in the attached inspector.
    "no-debugger": "error",
    // alert/alert/prompt in committed code is almost always a stray debug
    // artefact. Promote to error.
    "no-alert": "error",
    // Catches accidental template-string concatenation of `unknown` —
    // relevant for pino/otel log paths.
    "@typescript-eslint/restrict-template-expressions": "error",
    "import/no-default-export": "off",
    // Test-only escape hatches use `__nameForTests` convention; allow it.
    "eslint/no-underscore-dangle": [
      "error",
      {
        allowAfterThis: false,
        allow: ["__resetSecondaryRetryForTests", "__resetOtelForTests", "__filename", "__dirname"],
      },
    ],
  },
  // Per-directory overrides for tests.
  overrides: [
    {
      files: ["**/tests/**", "**/*.test.ts", "**/vitest.config.ts"],
      rules: {
        "vitest/require-test-timeout": "off",
        "vitest/require-mock-type-parameters": "off",
        "vitest/no-conditional-expect": "off",
        // `it.skip` / `describe.skip` is a valid documentation idiom when a
        // test is intentionally not run (e.g. documenting that a schema is
        // all-optional so there is no required-field-missing case). Allow
        // it inside test files; production code paths are still checked.
        "vitest/no-disabled-tests": "off",
      },
    },
  ],
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.turbo/**",
    "**/.next/**",
    "**/build/**",
    "**/out/**",
    "**/coverage/**",
    "**/*.generated.ts",
    "**/*.generated.js",
  ],
} as const;
