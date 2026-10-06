import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { BANNED } from "@workspace/format";

/**
 * Pins the 10 hostile PR-title fixtures shipped in
 * tests/fixtures/adversarial-pr-titles.json. CI runs this test on every
 * PR to ensure the BANNED regex in @workspace/format catches every
 * payload documented in the runtime doc.
 */

const __filename = fileURLToPath(import.meta.url);
const here = dirname(__filename);
const FIXTURE_PATH = resolve(here, "fixtures", "adversarial-pr-titles.json");

async function loadFixtures(): Promise<ReadonlyArray<string>> {
  const raw = await readFile(FIXTURE_PATH, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Fixture file is not a JSON array: ${FIXTURE_PATH}`);
  }
  return parsed as ReadonlyArray<string>;
}

describe("adversarial PR-title fixtures (BANNED regex)", () => {
  it("ships exactly 10 fixtures (locked Phase 2 plan)", async () => {
    const fixtures = await loadFixtures();
    expect(fixtures).toHaveLength(10);
  });

  it("every fixture is flagged by the BANNED regex", async () => {
    const fixtures = await loadFixtures();
    for (const [i, payload] of fixtures.entries()) {
      expect(BANNED.test(payload), `BANNED missed: #${i + 1} "${payload}"`).toBe(true);
    }
  });
});
