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
    // Catches accidental template-string concatenation of `unknown` —
    // relevant for pino/otel log paths.
    "@typescript-eslint/restrict-template-expressions": "error",
    "import/no-default-export": "off",
    // Test-only escape hatches use `__nameForTests` convention; allow it.
    "eslint/no-underscore-dangle": [
      "error",
      { allowAfterThis: false, allow: ["__resetSecondaryRetryForTests", "__resetOtelForTests"] },
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
