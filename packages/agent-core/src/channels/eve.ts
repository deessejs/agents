import { eveChannel } from "eve/channels/eve";
import { localDev, none, vercelOidc } from "eve/channels/auth";

/**
 * Standard eve HTTP channel shared by every ds-team agent.
 *
 * - vercelOidc() lets the eve TUI and Vercel deployments reach the deployed agent.
 * - localDev() opens localhost for `eve dev` and the REPL.
 *   Ignored in production.
 * - none() is the explicit allowlist for anonymous traffic. Use it ONLY
 *   for personal/dev agents that don't process non-public data.
 *   For anything customer-facing, swap it for an app-specific AuthFn
 *   (httpBasic, jwtHmac, jwtEcdsa, oidc, or a custom one).
 */
export function makeEveChannel() {
  return eveChannel({
    auth: [localDev(), vercelOidc(), none()],
  });
}

export default makeEveChannel;
