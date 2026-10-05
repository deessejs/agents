/**
 * Tests for `STANDARD_TAGS` — every agent tag and the GenAI conventions must
 * be present with the exact strings expected by downstream queries.
 */

import { describe, expect, it } from "vitest";

import { STANDARD_TAGS } from "../src/tags.ts";

describe("STANDARD_TAGS", () => {
  it("exposes every canonical agent / environment tag", () => {
    expect(STANDARD_TAGS.AGENT_NAME).toBe("agent.name");
    expect(STANDARD_TAGS.AGENT_VERSION).toBe("agent.version");
    expect(STANDARD_TAGS.AGENT_RUN_ID).toBe("agent.run_id");
    expect(STANDARD_TAGS.AGENT_SCHEDULE).toBe("agent.schedule");
    expect(STANDARD_TAGS.AGENT_CHANNEL).toBe("agent.channel");
    expect(STANDARD_TAGS.DEPLOYMENT_ENV).toBe("deployment.environment");
    expect(STANDARD_TAGS.CORRELATION_PARENT).toBe("correlation.parent_agent");
  });

  it("includes all OpenTelemetry GenAI semantic conventions", () => {
    expect(STANDARD_TAGS.GEN_AI_PROVIDER).toBe("gen_ai.provider.name");
    expect(STANDARD_TAGS.GEN_AI_OPERATION).toBe("gen_ai.operation.name");
    expect(STANDARD_TAGS.GEN_AI_REQUEST_MODEL).toBe("gen_ai.request.model");
    expect(STANDARD_TAGS.GEN_AI_USAGE_INPUT).toBe("gen_ai.usage.input_tokens");
    expect(STANDARD_TAGS.GEN_AI_USAGE_OUTPUT).toBe("gen_ai.usage.output_tokens");
    expect(STANDARD_TAGS.GEN_AI_RESPONSE_FINISH_REASONS).toBe("gen_ai.response.finish_reasons");
  });
});
