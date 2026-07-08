---
title: "Telegram Voice Transcription — Architecture Analysis & Professional Fix Blueprint"
date: 2026-07-08
audited_file: packages/agent-core/src/channels/telegram.ts
related_audit: docs/internal/audits/telegram-voice-transcription-2026-07-08.md
scope: eve v0.20.0 telegram channel internals
---

## Executive Summary

The voice transcription fork in `@ds-team/agent-core` works end-to-end: Groq Whisper transcribes audio and the transcript reaches the agent model. However, the implementation bypasses most of eve's Telegram channel infrastructure, leaving the agent without identity context, with broken group chat routing, and exposed to unauthorized access from any Telegram user via voice messages.

This document explains **why** the fork was built this way, **what** eve's architecture actually provides, and **how** a production-quality fix should be structured. Five correctness findings are confirmed against the source. No code is modified here — this is analysis and design only.

---

## 1. Why the Fork Exists

eve's `telegramChannel` (v0.20.0) does not handle voice messages. When Telegram delivers a voice message, eve's `parseTelegramMessage()` returns a `TelegramMessage` with `text = ""` and `attachments = []`. The built-in `shouldDispatchTelegramMessage` filter immediately drops it:

```ts
// eve/dist/src/public/channels/telegram/defaults.js
function shouldDispatchTelegramMessage(e, t) {
  // ...
  let n = e.text || e.caption;
  return n.trim().length > 0 || e.attachments.length > 0
    ? // ...
    : false; // ← voice messages return false
}
```

eve provides no hook to intercept this path, mutate the message content, and continue. The fork solves this by wrapping the webhook route handler, transcribing before eve sees the message, and dispatching the turn manually.

**The fork's core insight is correct.** What it gets wrong is the degree to which it re-implements eve's downstream logic instead of using eve's own primitives.

---

## 2. eve's Telegram Channel Architecture

### 2.1 Normal message flow

```
POST /eve/v1/telegram (raw JSON body)
        │
        ▼
verifyInbound()                    ← X-Telegram-Bot-Api-Secret-Token check
        │
        ▼
parseTelegramUpdate(raw)           ← raw JSON → TelegramMessage
        │                           (text="", attachments=[] for voice)
        ▼
dispatchMessage({ message, config, onMessage, send, uploadPolicy })
        │
        ├── shouldDispatchTelegramMessage(msg) → false for voice ← THE GAP
        │
        ├── onMessage(ctx, msg)      ← custom hook: auth, whitelist, filtering
        │       └── returns { auth } or null
        │
        ├── stateFromMessage(msg)   ← builds TelegramChannelState
        │   { chatId, chatType, conversationId, messageThreadId,
        │     triggeringUserId, hitlCallbacks, pendingFreeformReplies, ... }
        │
        ├── collectTelegramFileParts(msg.attachments)  ← photo + document
        │
        ├── buildTelegramTurnMessage(msg, attachments)
        │   text only        → string
        │   attachments only → attachment[]
        │   both            → [{ type: "text", text }, ...attachments]
        │
        ├── formatTelegramContextBlock(msg) → <telegram_context> block
        │   response_medium: telegram
        │   response_instructions: "Reply for Telegram in concise plain text..."
        │   chat_id, chat_type, chat_title, message_id,
        │   message_thread_id, user_id, username, bot_username
        │
        ├── continuationTokenFromState(state)
        │   → `${chatId}:${threadId}:${conversationId}`
        │
        ├── telegramReplyInputResponse(msg)  ← if replyToMessage.from.isBot
        │
        └── send({ inputResponses, message, context },
                { auth, continuationToken, state })
```

Every one of these steps is implemented correctly by eve. The fork re-implements a subset of them incorrectly.

### 2.2 Public API surface (`eve/channels/telegram`)

eve exports everything needed to build a correct voice path:

| Export | Purpose |
|--------|---------|
| `formatTelegramContextBlock(TelegramInboundContext)` | Renders the `<telegram_context>` block |
| `buildTelegramTurnMessage(msg, attachments)` | Builds the turn message payload |
| `telegramContinuationToken({ chatId, messageThreadId, conversationId })` | Builds the continuation token |
| `defaultTelegramAuth(msg)` | Builds the auth context |
| `parseTelegramUpdate(raw)` | Parses the inbound Telegram JSON |
| `getTelegramFile({ fileId })` | Obtains the `file_path` for download |
| `downloadTelegramFile({ filePath })` | Downloads audio bytes |
| `callTelegramApi({ method, body })` | Raw Bot API calls |
| `sendTelegramMessage({ chatId, text })` | Sends a Telegram message |

The fork re-implements `buildTelegramTurnMessage` and `defaultTelegramAuth` from scratch, ignores everything else, and passes manual approximations.

---

## 3. Findings

All five findings from the audit are confirmed against the source code.

### Finding 1 — Security: whitelist bypass for voice messages

**Severity: High** | **Status: Confirmed**

`TELEGRAM_ALLOWED_USER_ID` is enforced in `onMessage` (lines 165–169). The voice path (lines 197–241) bypasses this hook entirely:

```ts
// Lines 197–211 — no whitelist check before send()
if (voice && botToken && msg) {
  const transcript = await transcribeVoice(voice, botToken);
  const auth = buildTelegramAuth(msg);
  await send(
    { message: turnMessage, context: [] },
    { auth, continuationToken, state: {} },
  );
  return new Response("ok");
}
```

Any Telegram user can trigger a turn by sending a voice message, regardless of `TELEGRAM_ALLOWED_USER_ID`. `buildTelegramAuth` populates `principalId: "unknown"` if `msg.from` is absent, but does not reject the dispatch.

**Fix:** Duplicate the whitelist check inside the voice path before calling `send()`:

```ts
if (voice && botToken && msg) {
  const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
  if (allowedUserId && String(msg.from?.id) !== allowedUserId) {
    // Echo "Access denied." via sendTelegramMessage, then return "ok"
    return new Response("ok");
  }
  // ... proceed
}
```

eve has no built-in hook for this — the check must be duplicated since `onMessage` is never called.

---

### Finding 2 — Missing `<telegram_context>` in voice turns

**Severity: Medium** | **Status: Confirmed**

Line 210: `context: []`. The agent model receives the transcribed text but **no identity context block**.

Without `<telegram_context>`, the model:
- Does not know `response_medium: telegram` — may emit Markdown Telegram cannot render
- Does not know `response_instructions` — may produce verbose output inappropriate for chat
- Does not know `chat_id`, `user_id`, `username`, `chat_type` — cannot personalize or route correctly

eve's `formatTelegramContextBlock` (inbound.js) renders:

```
<telegram_context>
response_medium: telegram
response_instructions: Reply for Telegram in concise plain text. Avoid tables, long code fences, and formatting that depends on Markdown rendering.
chat_id: {chatId}
chat_type: {chatType}
[chat_title: {title}]
message_id: {messageId}
[message_thread_id: {threadId}]
[user_id: {userId}]
[username: {username}]
[bot_username: {botUsername}]
</telegram_context>
```

**Fix:** Build and include the telegram context block using eve's utility:

```ts
import { formatTelegramContextBlock } from "eve/channels/telegram";

const contextBlock = formatTelegramContextBlock({
  botUsername,
  chatId: String(msg.chat.id),
  chatTitle: msg.chat.title,
  chatType: msg.chat.type,
  messageId: String(msg.message_id),
  messageThreadId: msg.message_thread_id,
  userId: msg.from?.id ? String(msg.from.id) : undefined,
  username: msg.from?.username,
});

await send(
  { message: turnMessage, context: [contextBlock] },
  { auth, continuationToken, state },
);
```

---

### Finding 3 — Incorrect `continuationToken` for group chats

**Severity: Medium** | **Status: Confirmed**

Line 206: `const continuationToken = \`${String(msg.chat.id)}::\`;`

This is the DM format: two segments `"${chatId}:${threadId}"` (threadId omitted → `""` in 3-segment form, but eve's `telegramContinuationToken` handles `undefined` → `""`).

eve's `telegramContinuationToken` (api.js:4):

```ts
function telegramContinuationToken(e) {
  const t = e.messageThreadId === undefined ? `` : String(e.messageThreadId);
  const n = e.conversationId === undefined ? `` : String(e.conversationId);
  return `${String(e.chatId)}:${t}:${n}`;
}
```

For DMs, `conversationId` is `null` (state is built by `stateFromMessage` which sets `conversationId: null` for private chats), so `n=""` — **DM routing works correctly**.

For groups/supergroups, `conversationId` must be set to the message id (or `replyToMessage.message_id` if the reply is to the bot). The fork always uses `""`, so each voice message in a group starts a new session instead of continuing the existing thread.

**Fix:** Mirror eve's `stateFromMessage` and `continuationTokenFromState` logic:

```ts
import { telegramContinuationToken } from "eve/channels/telegram";

const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
const conversationId = isGroup
  ? msg.reply_to_message?.from?.is_bot
    ? msg.reply_to_message.message_id
    : msg.message_id
  : null;

const continuationToken = telegramContinuationToken({
  chatId: String(msg.chat.id),
  messageThreadId: msg.message_thread_id ?? undefined,
  conversationId: conversationId !== null ? String(conversationId) : undefined,
});
```

Note: `messageThreadId` must be the 2nd segment, not `""` as currently used. The audit's proposed fix incorrectly omits `messageThreadId` from the 3-segment token.

---

### Finding 4 — Empty `state` object

**Severity: Low** | **Status: Confirmed**

Line 211: `state: {}`. eve's `TelegramChannelState` (telegramChannel.d.ts:30) requires:

```ts
interface TelegramChannelState extends TelegramHitlState {
  botUsername: string | null;
  chatId: string | null;
  chatType: TelegramChatType | null;
  conversationId: string | null;       // null for DMs, message id for groups
  hitlCallbacks: Record<string, unknown>;
  messageThreadId: number | null;     // forum topic id
  nextHitlCallbackId: number;
  pendingFreeformReplies: Record<string, unknown>;
  triggeringUserId: string | null;
}
```

Passing `{}` means:
- `chatId = null` in session metadata → telemetry breaks
- `triggeringUserId = null` → observability loses user identity
- HITL callbacks/replies are uninitialized → silent failures if those features are used

**Fix:** Build a proper `TelegramChannelState`:

```ts
const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
const conversationId = isGroup
  ? msg.reply_to_message?.from?.is_bot
    ? msg.reply_to_message.message_id
    : msg.message_id
  : null;

const state = {
  botUsername,
  chatId: String(msg.chat.id),
  chatType: msg.chat.type,
  conversationId: conversationId !== null ? String(conversationId) : null,
  hitlCallbacks: {},
  messageThreadId: msg.message_thread_id ?? null,
  nextHitlCallbackId: 0,
  pendingFreeformReplies: {},
  triggeringUserId: msg.from?.id ? String(msg.from.id) : null,
};
```

eve does not export `stateFromMessage` — it is internal to `telegramChannel.js`. The state build must be duplicated, but it is straightforward.

---

### Finding 5 — `replyToMessage` not forwarded for voice

**Severity: Low** | **Status: Confirmed** | **Note: groups and HITL may not be in use**

eve's `dispatchMessage` (telegramChannel.js) handles `replyToMessage` for two purposes:

1. **Group conversation anchoring**: When a user replies to the bot's message in a group, `replyToMessage.from.is_bot === true` → the conversation id is set to `replyToMessage.message_id`. This routes the turn to the correct session.

2. **HITL freeform reply**: When the agent requests freeform input and the user replies to the agent's message (not to the bot directly), eve extracts the reply text via `telegramReplyInputResponse`:

```ts
const u = e.message.replyToMessage?.from?.isBot === true && l.trim().length > 0
  ? [telegramReplyInputResponse({ messageId: e.message.replyToMessage.messageId, text: l })]
  : undefined;
```

The fork passes `attachments: []` and ignores `reply_to_message` entirely. These features will not work for voice messages.

---

## 4. Additional Observations

### 4.1 `defaultTelegramAuth` is duplicated with subtle differences

The fork's `buildTelegramAuth` (lines 116–140) is a manual copy of eve's `defaultTelegramAuth` (defaults.js). One real difference:

- **eve**: uses `numberLikeToString(id)` which handles both `string` and `number` inputs
- **fork**: uses `String(id)` — safe for numeric `id` values but the fork's types already cast to `string | number`

More importantly: eve returns `null` if `msg.from` is absent; the fork returns an `auth` object with `principalId: "unknown"`. The dispatch still proceeds in both cases, but eve's `null` would prevent delivery while the fork's `"unknown"` allows it. This is a latent security gap.

### 4.2 Error handling is silent

Lines 237–240: if transcription fails, the code falls through to `orig(req, opts)`, which receives the original voice message (empty text). Eve dispatches an empty turn. The user receives no error feedback.

eve's `defaultEvents["turn.failed"]` handler posts an error message to the user. This fires for failures *after* dispatch but not for failures *before* dispatch (transcription, auth, routing).

### 4.3 The echo is a workaround for missing model visibility

The `waitUntil` echo (`📝 {transcript}`) exists because the agent does not have the `<telegram_context>` block telling it to respond in Telegram. Once Finding 2 is fixed, the echo becomes redundant — the model will produce the transcript response directly. It can be removed.

### 4.4 Groq extension mismatch is handled correctly

Telegram sends `.oga` files (Opus audio in OGG container). Groq's extension allowlist includes `.ogg` but not `.oga`. Line 89 correctly works around this:

```ts
form.append("file", new File([audioBuffer], "voice.ogg", { type: "audio/ogg" }));
```

The MIME type `audio/ogg` is accepted by Groq regardless of extension. This is correct.

---

## 5. Professional Fix Blueprint

The fix should preserve the fork's interception strategy (it is the only way to handle voice given eve's current architecture) but use eve's public primitives instead of re-implementing the downstream logic.

### 5.1 Architecture

```
POST /eve/v1/telegram (raw body)
        │
        ▼
if voice message?
  ├─ Verify whitelist (duplicate check — no hook available)
  ├─ Transcribe via Groq Whisper
  ├─ Build TelegramChannelState    ← use from above
  ├─ Build continuationToken        ← use telegramContinuationToken
  ├─ Build context block            ← use formatTelegramContextBlock
  ├─ Build turn message             ← use buildTelegramTurnMessage
  ├─ Dispatch via send()            ← with complete params
  ├─ Echo transcript (optional, remove after Finding 2 fix)
  └─ return "ok"
        │
        ▼ (non-voice messages)
        orig(req, opts)             ← eve handles normally
```

### 5.2 Imports to add

```ts
import {
  formatTelegramContextBlock,
  buildTelegramTurnMessage,
  telegramContinuationToken,
  defaultTelegramAuth,
} from "eve/channels/telegram";
```

### 5.3 Priority order

| Priority | Finding | Reason |
|----------|---------|--------|
| 1 | Fix 1 — Whitelist bypass | Unauthorized access is a production security risk |
| 2 | Fix 2 — Context block | Agent behavior is incorrect without identity context |
| 3 | Fix 3 — continuationToken | Group chats route to wrong sessions |
| 4 | Fix 4 — State object | Telemetry and observability broken |
| 5 | Fix 5 — replyToMessage | Low impact if groups/HITL are not in use |
| — | Remove echo after Fix 2 | Redundant once model sees context block |

### 5.4 Long-term path

The fork is architecturally fragile: it is a snapshot of eve v0.20.0 and will diverge with each eve update. The note in the audit file is correct:

> "When eve releases a version of `telegramChannel` that exposes a hook for pre-processing the message before `dispatchMessage` reads it, the fork should be replaced with that hook."

A `onBeforeDispatch` or `onMessagePreprocess` hook that receives a mutable `TelegramMessage` (or the raw parsed object) would allow the transcription to be injected into eve's normal flow, eliminating the need to re-implement state building, context formatting, and continuation token logic. Until that hook exists, the fork is the correct approach — but it must use eve's public API for all downstream logic.

---

## Appendix A: Key Files Referenced

| File | Purpose |
|------|---------|
| `eve/dist/src/public/channels/telegram/telegramChannel.js` | Main channel factory, `dispatchMessage`, `stateFromMessage`, `continuationTokenFromState` |
| `eve/dist/src/public/channels/telegram/inbound.js` | `parseTelegramUpdate`, `formatTelegramContextBlock` |
| `eve/dist/src/public/channels/telegram/defaults.js` | `defaultTelegramAuth`, `defaultOnMessage`, `shouldDispatchTelegramMessage` |
| `eve/dist/src/public/channels/telegram/api.js` | `telegramContinuationToken`, `callTelegramApi`, `getTelegramFile`, `downloadTelegramFile` |
| `eve/dist/src/public/channels/telegram/attachments.js` | `buildTelegramTurnMessage`, `collectTelegramFileParts` |
| `eve/dist/src/public/channels/telegram/hitl.js` | `telegramReplyInputResponse`, `isTelegramSyntheticResponse` |
| `eve/docs/channels/telegram.mdx` | User-facing documentation of the channel |
| `packages/agent-core/src/channels/telegram.ts` | The fork being audited |
