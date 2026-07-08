/**
 * Fork of eve's telegramChannel with voice transcription support.
 *
 * Key insight: the POST /eve/v1/telegram handler's original dispatchMessage
 * calls buildTelegramTurnMessage(msg, []) which returns "" for a voice message
 * (no text, no attachments). We intercept BEFORE the original handler runs,
 * transcribe the voice, build the turn message ourselves, and call send()
 * directly. Then we return the webhook response so Telegram doesn't retry.
 *
 * If eve updates its telegramChannel, review this fork for changes.
 */
import {
  telegramChannel,
  defaultTelegramAuth,
  formatTelegramContextBlock,
  buildTelegramTurnMessage,
  telegramContinuationToken,
  telegramReplyInputResponse,
  type TelegramMessage,
  type TelegramContext,
  type TelegramInboundResult,
  type TelegramChannel,
} from "eve/channels/telegram";

export { defaultTelegramAuth };
export type { TelegramMessage, TelegramContext };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TelegramVoice {
  file_id: string;
  duration?: number;
  mime_type?: string;
  file_size?: number;
}

/** Raw parsed message from Telegram webhook payload */
interface TelegramParsedMessage {
  message_id: number | string;
  from?: { id: number | string; is_bot?: boolean; username?: string };
  chat: { id: number | string; type: string; title?: string; username?: string };
  text?: string;
  caption?: string;
  voice?: TelegramVoice;
  photo?: unknown[];
  document?: unknown;
  reply_to_message?: unknown;
  message_thread_id?: number;
}

/** Telegram channel state — mirrors eve's TelegramChannelState */
interface TelegramChannelState {
  botUsername: string | null;
  chatId: string | null;
  chatType: string | null;
  conversationId: string | null;
  hitlCallbacks: Record<string, unknown>;
  messageThreadId: number | null;
  nextHitlCallbackId: number;
  pendingFreeformReplies: Record<string, unknown>;
  triggeringUserId: string | null;
}

// ---------------------------------------------------------------------------
// shouldDispatchTelegramMessage (inlined from eve defaults)
// ---------------------------------------------------------------------------
function shouldDispatchTelegramMessage(msg: TelegramMessage, botUsername?: string): boolean {
  if (msg.from?.isBot === true || msg.chat.type === "channel") return false;
  const text = msg.text || msg.caption;
  const hasContent = (text?.trim().length ?? 0) > 0 || msg.attachments.length > 0;
  if (!hasContent) return false;
  if (msg.chat.type === "private") return true;
  if (msg.replyToMessage?.from?.isBot === true) return true;
  const cmdMatch = /^\/(?<command>[A-Za-z0-9_]+)(?:@(?<target>[A-Za-z0-9_]+))?(?:\s|$)/u.exec(text ?? "");
  if (cmdMatch) {
    const target = cmdMatch.groups?.target;
    return target === undefined || (botUsername !== undefined && target.toLowerCase() === botUsername.toLowerCase());
  }
  if (botUsername !== undefined && text?.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Voice transcription via Groq Whisper
// ---------------------------------------------------------------------------
async function transcribeVoice(voice: TelegramVoice, botToken: string): Promise<string> {
  const getFileResponse = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${voice.file_id}`,
  );
  if (!getFileResponse.ok) throw new Error(`Telegram getFile failed: ${getFileResponse.status}`);
  const getFileData = (await getFileResponse.json()) as { ok: boolean; result?: { file_path: string } };
  if (!getFileData.ok || !getFileData.result?.file_path)
    throw new Error(`Telegram getFile error: ${JSON.stringify(getFileData)}`);

  const audioResponse = await fetch(
    `https://api.telegram.org/file/bot${botToken}/${getFileData.result.file_path}`,
  );
  if (!audioResponse.ok) throw new Error(`Telegram file download failed: ${audioResponse.status}`);
  const audioBuffer = await audioResponse.arrayBuffer();

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) throw new Error("GROQ_API_KEY is not set");

  // Groq's extension allowlist only includes .ogg, not .oga (Telegram's format).
  const form = new FormData();
  form.append("file", new File([audioBuffer], "voice.ogg", { type: "audio/ogg" }));
  form.append("model", "whisper-large-v3");

  const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groqApiKey}` },
    body: form,
  });
  if (!groqResponse.ok)
    throw new Error(`Groq failed (${groqResponse.status}): ${await groqResponse.text()}`);

  const data = (await groqResponse.json()) as { text?: string };
  return data.text ?? "";
}

// ---------------------------------------------------------------------------
// Channel factory
// ---------------------------------------------------------------------------
export function makeTelegramChannel(): TelegramChannel {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecretToken = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;

  if (!botUsername) throw new Error("TELEGRAM_BOT_USERNAME is not set.");
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  if (!webhookSecretToken)
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET_TOKEN is not set. Generate one with `node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"`.",
    );

  const inner = telegramChannel({
    botUsername,
    credentials: { botToken, webhookSecretToken },
    uploadPolicy: { allowedMediaTypes: ["image/*", "application/pdf"], maxBytes: 10 * 1024 * 1024 },
    onMessage: async (
      ctx: TelegramContext,
      msg: TelegramMessage,
    ): Promise<TelegramInboundResult> => {
      const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
      if (allowedUserId && msg.from?.id !== allowedUserId) {
        await ctx.telegram.sendMessage("Access denied.");
        return null;
      }
      if (!shouldDispatchTelegramMessage(msg, ctx.telegram.botUsername)) return null;
      await ctx.telegram.startTyping();
      return { auth: defaultTelegramAuth(msg) };
    },
  });

  // Wrap the POST /eve/v1/telegram route to intercept voice messages.
  // We build and dispatch the turn ourselves, then return so Telegram doesn't retry.
  const wrappedRoutes = inner.routes.map((route: unknown) => {
    const r = route as { method?: string; path?: string; handler?: unknown };
    if (r.method === "POST" && r.path === "/eve/v1/telegram") {
      const orig = r.handler as (req: Request, opts: unknown) => Response | Promise<Response>;

      return {
        ...(route as Record<string, unknown>),
        handler: async (req: Request, opts: unknown) => {
          const bodyText = await req.text();
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(bodyText);
          } catch {
            // Non-JSON body: pass to eve's original handler.
            // Clone the request first — the body stream is consumed after .text().
            const clonedReq = new Request(req.url, {
              method: req.method,
              headers: req.headers,
              body: bodyText,
            });
            return orig(clonedReq, opts);
          }

          const msg = parsed.message as TelegramParsedMessage | undefined;
          const voice = msg?.voice as TelegramVoice | undefined;

          if (voice && botToken && msg) {
            // ── Finding 1: Whitelist check (must duplicate — onMessage is not called) ──
            const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
            if (allowedUserId && String(msg.from?.id) !== allowedUserId) {
              // Echo access-denied inline (we have botToken here, unlike in onMessage)
              fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  chat_id: String(msg.chat.id),
                  text: "Access denied.",
                  message_thread_id: msg.message_thread_id,
                }),
              }).catch(() => {/* swallow — best effort */});
              return new Response("ok");
            }

            try {
              const transcript = await transcribeVoice(voice, botToken);
              const send = (opts as { send: (input: unknown, options?: unknown) => Promise<unknown> }).send;

              // ── Finding 4: Build proper TelegramChannelState ──
              const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
              const conversationId = isGroup
                ? (msg.reply_to_message as { from?: { is_bot?: boolean }; message_id?: number | string } | undefined)
                    ?.from?.is_bot === true
                  ? String((msg.reply_to_message as { message_id?: number | string }).message_id)
                  : String(msg.message_id)
                : null;
              const messageThreadId = msg.message_thread_id ?? null;

              const state: TelegramChannelState = {
                botUsername,
                chatId: String(msg.chat.id),
                chatType: msg.chat.type,
                conversationId,
                hitlCallbacks: {},
                messageThreadId,
                nextHitlCallbackId: 0,
                pendingFreeformReplies: {},
                triggeringUserId: msg.from?.id !== undefined ? String(msg.from.id) : null,
              };

              // ── Finding 3: Proper continuationToken (all chat types) ──
              const continuationToken = telegramContinuationToken({
                chatId: String(msg.chat.id),
                messageThreadId: messageThreadId ?? undefined,
                conversationId: conversationId ?? undefined,
              });

              // ── Finding 2: Telegram context block for the model ──
              const contextBlock = formatTelegramContextBlock({
                botUsername,
                chatId: String(msg.chat.id),
                chatTitle: msg.chat.title,
                chatType: msg.chat.type as "private" | "group" | "supergroup" | "channel",
                messageId: String(msg.message_id),
                messageThreadId: messageThreadId ?? undefined,
                userId: msg.from?.id !== undefined ? String(msg.from.id) : undefined,
                username: msg.from?.username,
              });

              // ── Build turn message (use eve's utility, not duplicated logic) ──
              const turnMessage = buildTelegramTurnMessage(
                { text: transcript, caption: "", attachments: [], replyToMessage: undefined } as Parameters<typeof buildTelegramTurnMessage>[0],
                [],
              );

              // ── Finding 5: replyToMessage for group anchoring / HITL ──
              const replyText = msg.reply_to_message
                ? (msg.caption || String(msg.message_id))
                : undefined;
              const inputResponses =
                replyText !== undefined &&
                replyText.trim().length > 0 &&
                (msg.reply_to_message as { from?: { is_bot?: boolean } } | undefined)?.from?.is_bot === true
                  ? [telegramReplyInputResponse({ messageId: String(msg.message_id), text: replyText })]
                  : undefined;

              // ── Auth: use eve's defaultTelegramAuth with a compatible shape ──
              // eve's defaultTelegramAuth accepts a TelegramMessage-like object.
              // We pass the shape it expects (messageId as string, etc.).
              const auth = defaultTelegramAuth({
                attachments: [],
                caption: "",
                chat: {
                  id: msg.chat.id,
                  title: msg.chat.title,
                  type: msg.chat.type as "private" | "group" | "supergroup" | "channel",
                  username: msg.chat.username,
                },
                from: msg.from
                  ? {
                      firstName: undefined,
                      id: String(msg.from.id),
                      isBot: msg.from.is_bot ?? false,
                      languageCode: undefined,
                      lastName: undefined,
                      username: msg.from.username,
                    }
                  : undefined,
                messageId: String(msg.message_id),
                messageThreadId: messageThreadId ?? undefined,
                raw: {},
                replyToMessage: undefined,
                text: transcript,
              } as Parameters<typeof defaultTelegramAuth>[0]);

              // ── Dispatch the turn to the agent ──
              await send(
                { inputResponses, message: turnMessage, context: [contextBlock] },
                { auth, continuationToken, state },
              );

              return new Response("ok");
            } catch (err) {
              console.error("[voice] dispatch failed:", err instanceof Error ? err.message : String(err));
              // Fall through to the original handler (will see empty message).
              // Clone the request — body stream is already consumed by transcribeVoice.
            }
          }

          // Non-voice message: pass to eve's original handler.
          // Clone the request first — the body stream was consumed by .text() above.
          const clonedReq = new Request(req.url, {
            method: req.method,
            headers: req.headers,
            body: bodyText,
          });
          return orig(clonedReq, opts);
        },
      };
    }
    return route;
  });

  return { ...inner, routes: wrappedRoutes } as unknown as TelegramChannel;
}

export default makeTelegramChannel;
