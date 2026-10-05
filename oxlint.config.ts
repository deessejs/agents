import { baseOxlintConfig } from "@workspace/oxlint-config/oxlint";

/**
 * Root oxlint config for the agents-studio monorepo.
 *
 * Uses oxlint's nested config auto-discovery: any subdirectory can ship
 * its own oxlint.config.ts to extend or override the root.
 *
 * For type-aware rules (oxlint-tsgolint), this is the only place they
 * can live (root config only).
 */
export default {
  ...baseOxlintConfig,
};
