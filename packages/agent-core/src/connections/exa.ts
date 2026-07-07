import { defineMcpClientConnection } from "eve/connections";

/**
 * Exa MCP connection — live web search + page fetch.
 *
 * URL:     https://mcp.exa.ai/mcp
 * Auth:    API key passed as the `x-api-key` header.
 * Env var: EXA_API_KEY  (https://dashboard.exa.ai/api-keys)
 *
 * Discovered tools surface to the model as `exa__*`
 *   e.g. exa__web_search_exa, exa__web_fetch_exa.
 */
export function makeExaConnection() {
  return defineMcpClientConnection({
    url: "https://mcp.exa.ai/mcp",
    description:
      "Exa: live web search and webpage fetching. Use exa__web_search_exa to find current information beyond the model's training data, and exa__web_fetch_exa to read a known URL as clean markdown.",
    headers: {
      "x-api-key": process.env.EXA_API_KEY!,
    },
  });
}

export default makeExaConnection;
