/**
 * Opt-in `no_reply` tool.
 *
 * Per the runtime doc the agent uses this when the period had nothing
 * to report AND submitting a one-section "no activity" message would
 * itself be noise. The tool factory from `eve/tools/no_reply`
 * provides a typed, ends-turn implementation that records the reason
 * in session history without sending anything.
 */
import { noReply } from "eve/tools/no_reply";

export default noReply();