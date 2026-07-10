// eve autoloads MCP connection definitions from `agent/connections/*`.
//
// Liftosaur MCP — the user's training data: programs (Liftoscript),
// workout history, body measurements, gyms/equipment, and a playground
// to simulate progressions before saving.
//
// URL:     https://www.liftosaur.com/mcp   (Streamable HTTP transport)
// Auth:    API key as a Bearer token — the same key used by the REST API.
// Env var: LIFTOSAUR_API_KEY  (Liftosaur → Settings → API Keys, prefix `lftsk_`)
//
// We authenticate with the API key rather than OAuth 2.1: no browser
// sign-in flow server-side, and it sidesteps the MCP OAuth token expiry
// (astashov/liftosaur#560, no auto-refresh after 1h).
//
// This connection is app-local (not shared via @ds-team/agent-core) because
// it is fitness-specific — fitness-coach is the only consumer today. Promote
// it to agent-core if a second agent (e.g. nutrition-coach) needs it.
//
// Discovered tools surface to the model as `liftosaur__*`
//   e.g. liftosaur__get_liftoscript_reference, liftosaur__create_program,
//        liftosaur__run_playground, liftosaur__get_history.
import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://www.liftosaur.com/mcp",
  description:
    "Liftosaur: the user's real training data. Manage weightlifting programs written in Liftoscript, log workouts, read workout history and body measurements, and simulate progressions. Call liftosaur__get_liftoscript_reference BEFORE writing any program, and liftosaur__run_playground to test before saving. Preview and confirm with the user before any delete or overwrite (delete_program, delete_history_record, update_program).",
  headers: {
    Authorization: `Bearer ${process.env.LIFTOSAUR_API_KEY!}`,
  },
});
