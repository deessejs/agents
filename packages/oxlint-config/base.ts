/**
 * Shared oxlint config factory for the monorepo.
 *
 * Usage from a workspace's oxlint.config.ts:
 *   import { baseOxlintConfig } from "@workspace/oxlint-config/oxlint";
 *   export default { ...baseOxlintConfig, ignorePatterns: [...] };
 *
 * Coverage:
 *   - TypeScript (core, type-aware via tsgolint when installed)
 *   - React, JSX a11y
 *   - Import, Unicorn, Promise, Vitest
 *   - Next.js (when used)
 *
 * Severity philosophy:
 *   - correctness / perf / restriction / suspicious → error
 *   - nursery → warn (opt-in, may be unstable)
 *   - pedantic / style → off (let the formatter handle style)
 */
export const baseOxlintConfig = {
  plugins: [
    "typescript",
    "react",
    "react-hooks",
    "jsx-a11y",
    "import",
    "unicorn",
    "promise",
    "vitest",
  ],
  categories: {
    correctness: "error",
    perf: "error",
    restriction: "error",
    suspicious: "error",
    nursery: "warn",
    pedantic: "off",
    style: "off",
  },
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    "import/no-default-export": "off",
  },
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
