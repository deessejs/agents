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
  type TelegramMessage,
  type TelegramContext,
  type TelegramInboundResult,
} from "eve/channels/telegram";
import type { TelegramChannel } from "eve/channels/telegram";

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
// Build the turn message (same logic as eve's buildTelegramTurnMessage)
// ---------------------------------------------------------------------------
function buildTurnMessage(text: string, attachments: unknown[]): string | unknown[] {
  if (attachments.length === 0) return text;
  if (text.trim().length === 0) return attachments;
  return [{ type: "text", text }, ...attachments];
}

// ---------------------------------------------------------------------------
// Build the auth context (same logic as eve's defaultTelegramAuth)
// ---------------------------------------------------------------------------
function buildTelegramAuth(msg: TelegramParsedMessage): { authenticator: string; principalId: string; principalType: string; issuer: string; attributes: Record<string, unknown> } {
  const from = msg.from;
  if (!from) return { authenticator: "telegram-webhook", principalId: "unknown", principalType: "user", issuer: "telegram", attributes: {} };
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
  const principalId = isGroup
    ? `telegram:${msg.chat.id}:${from.id}`
    : `telegram:${from.id}`;
  const issuer = isGroup ? `telegram:${msg.chat.id}` : "telegram";
  const attributes: Record<string, unknown> = {
    chat_id: String(msg.chat.id),
    chat_type: msg.chat.type,
    message_id: String(msg.message_id),
    user_id: String(from.id),
  };
  if (msg.chat.title) attributes.chat_title = msg.chat.title;
  if (msg.message_thread_id !== undefined) attributes.message_thread_id = String(msg.message_thread_id);
  if (from.username) attributes.username = from.username;
  return {
    authenticator: "telegram-webhook",
    principalId,
    principalType: from.is_bot ? "service" : "user",
    issuer,
    attributes,
  };
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
            return orig(req, opts);
          }

          const msg = parsed.message as TelegramParsedMessage | undefined;
          const voice = msg?.voice as TelegramVoice | undefined;

          if (voice && botToken && msg) {
            try {
              const transcript = await transcribeVoice(voice, botToken);
              const send = (opts as { send: (input: unknown, options?: unknown) => Promise<unknown> }).send;
              const waitUntil = (opts as { waitUntil?: (fn: () => void | Promise<void>) => void }).waitUntil;

              // Build and dispatch the turn with the transcript as the message text
              const auth = buildTelegramAuth(msg);
              const turnMessage = buildTurnMessage(transcript, []);
              const continuationToken = `${String(msg.chat.id)}::`;

              // Dispatch the turn to the agent
              await send(
                { message: turnMessage, context: [] },
                { auth, continuationToken, state: {} },
              );

              // Echo the transcript in the Telegram chat after responding to the webhook
              if (waitUntil) {
                waitUntil(
                  (async () => {
                    try {
                      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          chat_id: String(msg!.chat.id),
                          text: `📝 ${transcript}`,
                          message_thread_id: msg!.message_thread_id,
                        }),
                      });
                    } catch {
                      // swallow
                    }
                  }) as () => void,
                );
              }

              // Short-circuit: we've dispatched the turn ourselves
              return new Response("ok");
            } catch (err) {
              console.error("[voice] dispatch failed:", err instanceof Error ? err.message : String(err));
              // Fall through to the original handler (will see empty message)
            }
          }

          return orig(req, opts);
        },
      };
    }
    return route;
  });

  return { ...inner, routes: wrappedRoutes } as unknown as TelegramChannel;
}

export default makeTelegramChannel;
