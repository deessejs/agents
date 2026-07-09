// eve autoloads channel definitions from `agent/channels/*`.
// We re-export the shared eve channel built in @ds-team/agent-core so any
// changes propagate across every ds-team agent.
export { default } from "@ds-team/agent-core/channel/eve";