import { eveChannel } from "eve/channels/eve";
import { localDev, placeholderAuth, vercelOidc } from "eve/channels/auth";

/**
 * Standard eve HTTP channel shared by every ds-team agent.
 *
 * - vercelOidc() lets the eve TUI and Vercel deployments reach the deployed agent.
 * - localDev() opens localhost for `eve dev` and the REPL.
 *   Ignored in production.
 * - placeholderAuth() is a public-demo auth shim.
 *   Replace with your app's auth provider (Auth.js, Clerk, ...) or `none()`
 *   if you want a fully public agent.
 */
export function makeEveChannel() {
  return eveChannel({
    auth: [vercelOidc(), localDev(), placeholderAuth()],
  });
}

export default makeEveChannel;
