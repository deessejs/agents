 ---
title: "Telegram voice transcription — code audit"
date: 2026-07-08
audited_file: packages/agent-core/src/channels/telegram.ts
severity: medium
---

## Summary

The voice transcription implementation in `agent-core` works end-to-end (transcribed audio reaches the agent model), but several correctness issues were found during review.

---

## Finding 1 — Security: whitelist bypass for voice messages

**Severity:** High
**Status:** Open

The `onMessage` whitelist (`TELEGRAM_ALLOWED_USER_ID`) is bypassed for voice messages. The voice path in the wrapped route handler calls `send()` directly, skipping `onMessage` entirely:

```ts
if (voice && botToken && msg) {
  // ... dispatch via send() — no whitelist check
}
```

Any Telegram user who sends a voice message can trigger a turn on the agent, regardless of `TELEGRAM_ALLOWED_USER_ID`.

**Fix:** Apply the whitelist check inside the voice path before calling `send()`:

```ts
if (voice && botToken && msg) {
  const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
  if (allowedUserId && String(msg.from?.id) !== allowedUserId) {
    // Echo "Access denied." to the user, then return
    return new Response("ok");
  }
  // ... dispatch
}
```

---

## Finding 2 — Missing `<telegram_context>` in voice turns

**Severity:** Medium
**Status:** Open

Voice turns are dispatched with `context: []`. The agent model does not receive the `<telegram_context>` block containing `chat_id`, `chat_type`, `user_id`, `username`, `message_id`, etc.

The normal path builds the context with `formatTelegramContextBlock(...)` and passes it as the first element of `context: [telegramBlock, ...r.context]`. The voice path passes an empty array.

The agent therefore lacks identity context for the turn. It knows what to say but not where, or whose it is.

**Fix:** Build and include the telegram context block in the voice dispatch:

```ts
// In the voice dispatch block, add:
const contextBlock = `...`; // replicate formatTelegramContextBlock
await send(
  { message: turnMessage, context: [contextBlock] },
  { auth, continuationToken, state: {} },
);
```

---

## Finding 3 — Incorrect `continuationToken` for group chats

**Severity:** Medium
**Status:** Open (groups may not be in use)

The voice dispatch uses `continuationToken: \`${chatId}::\`` (DM format). For group and supergroup chats, eve uses the three-segment format `${chatId}:${threadId}:${conversationId}`.

Incorrect `continuationToken` means the turn is routed to a new session instead of resuming an existing group conversation.

**Fix:** Mirror the logic from `continuationTokenFromState()` and `stateFromMessage()` from eve's `telegramChannel.js`:

```ts
const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
const conversationId = isGroup
  ? (msg.reply_to_message?.from?.is_bot ? msg.reply_to_message.message_id : msg.message_id)
  : undefined;
const continuationToken = `${chatId}:${threadId ?? ""}:${conversationId ?? ""}`;
```

---

## Finding 4 — Empty `state` object

**Severity:** Low
**Status:** Open

The voice dispatch passes `state: {}`. eve's runtime expects `TelegramChannelState` with at minimum `chatId`, `chatType`, `triggeringUserId` — these are used for session metadata, routing, and telemetry.

Passing an empty object may cause silent failures in session tracking and metadata.

**Fix:** Build a proper `TelegramChannelState`:

```ts
const state = {
  botUsername,
  chatId: String(msg.chat.id),
  chatType: msg.chat.type,
  conversationId: isGroup ? conversationId : null,
  hitlCallbacks: {},
  messageThreadId: msg.message_thread_id ?? null,
  nextHitlCallbackId: 0,
  pendingFreeformReplies: {},
  triggeringUserId: msg.from?.id ? String(msg.from.id) : null,
};
```

---

## Finding 5 — `replyToMessage` not forwarded for voice

**Severity:** Low
**Status:** Open (groups / HITL may not be in use)

eve's normal `dispatchMessage` handles `replyToMessage` to support group conversations (anchoring the conversation to a reply target) and HITL freeform reply flows. The voice path passes `attachments: []` and ignores `reply_to_message` entirely.

If these features are used in group voice threads, they will not work for voice messages.

---

## Recommendations

Priority order:

1. **Fix 1** (whitelist bypass) — must fix before any production use with untrusted users
2. **Fix 2** (context block) — required for the agent to behave correctly
3. **Fix 3** (continuationToken) — required if group chats are in scope
4. **Fix 4 & 5** — nice to have for correctness / telemetry

When eve releases a version of `telegramChannel` that exposes a hook for pre-processing the message before `dispatchMessage` reads it, the fork should be replaced with that hook and this audit should be revisited.
