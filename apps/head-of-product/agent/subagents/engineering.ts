import { defineRemoteAgent } from "eve";
import { vercelOidc } from "eve/agents/auth";

/**
 * Remote agent: Head of Engineering.
 *
 * Exposed to the LLM as a delegation target with the file's path-derived
 * tool id (`engineering`). The model reads `description` to decide when to
 * call this instead of answering itself.
 *
 * `vercelOidc()` is the right outbound helper here — both agents are on
 * Vercel, so deployment-to-deployment trust requires zero secret
 * management: Vercel signs the request JWT and the remote's channel
 * auth walk verifies it via the existing `vercelOidc()` entry.
 */
export default defineRemoteAgent({
  url: "https://deessejs-hoe-agent.nesalia.com",
  description:
    "Delegate to the Head of Engineering. Use this for feasibility checks, implementation cost estimates, refactor scoping, architecture decisions, and tech-debt prioritization. The remote agent has web search (Exa) and full read/write access to GitHub (issues, PRs, file contents) — call it when the answer needs current code or repo state.",
  auth: vercelOidc(),
});
