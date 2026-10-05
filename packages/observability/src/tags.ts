/**
 * Canonical tag names every agent uses. These show up on every log line and
 * (when OpenTelemetry is configured) on every span, so traces and logs can be
 * filtered uniformly in Honeycomb / Vercel Observability.
 *
 * GenAI semantic conventions are included so dashboards built against the
 * OpenTelemetry GenAI spec render correctly out of the box.
 */
export const STANDARD_TAGS = {
  // Agent identity
  AGENT_NAME: "agent.name",
  AGENT_VERSION: "agent.version",
  AGENT_RUN_ID: "agent.run_id",
  AGENT_SCHEDULE: "agent.schedule",
  AGENT_CHANNEL: "agent.channel",

  // Environment / correlation
  DEPLOYMENT_ENV: "deployment.environment",
  CORRELATION_PARENT: "correlation.parent_agent",

  // OpenTelemetry GenAI semantic conventions (I7)
  // See https://opentelemetry.io/docs/specs/semconv/gen-ai/
  GEN_AI_PROVIDER: "gen_ai.provider.name",
  GEN_AI_OPERATION: "gen_ai.operation.name",
  GEN_AI_REQUEST_MODEL: "gen_ai.request.model",
  GEN_AI_USAGE_INPUT: "gen_ai.usage.input_tokens",
  GEN_AI_USAGE_OUTPUT: "gen_ai.usage.output_tokens",
  GEN_AI_RESPONSE_FINISH_REASONS: "gen_ai.response.finish_reasons",
} as const;

/** Convenience type for code that needs to refer to a tag by its literal string. */
export type StandardTagName = (typeof STANDARD_TAGS)[keyof typeof STANDARD_TAGS];
