// eve autoloads channel definitions from `agent/channels/*`.
// We re-export the shared Telegram channel built in @ds-team/agent-core.
// The bot itself is not registered yet (phase 5); re-exporting here wires the
// channel into the agent so it can be enabled later by setting the Telegram
// env vars (TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET_TOKEN,
// TELEGRAM_ALLOWED_USER_ID) in Vercel.
export { default } from "@ds-team/agent-core/channel/telegram";