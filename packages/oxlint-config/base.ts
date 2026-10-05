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
    // suspicious is on at the root (highest-signal correctness rules),
    // but tests/fixtures override it off because they intentionally
    // exercise weird shapes.
    suspicious: "warn",
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
    // allow the unsafe-pointer family at warn so existing code surfaces
    // without blocking CI.
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-argument": "warn",
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
