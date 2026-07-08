import {
  telegramChannel,
  defaultTelegramAuth,
  type TelegramMessage,
  type TelegramContext,
  type TelegramInboundResult,
  type TelegramInboundResultOrPromise,
} from "eve/channels/telegram";

interface TelegramVoice {
  file_id: string;
  duration?: number;
  mime_type?: string;
  file_size?: number;
}

/**
 * Inline re-implementation of shouldDispatchTelegramMessage from eve defaults.
 */
function shouldDispatchTelegramMessage(msg: TelegramMessage, botUsername?: string): boolean {
  if (msg.from?.isBot === true || msg.chat.type === "channel") return false;
  const text = msg.text || msg.caption;
  const hasContent = (text?.trim().length ?? 0) > 0 || msg.attachments.length > 0;
  if (!hasContent) return false;
  if (msg.chat.type === "private") return true;
  if (msg.replyToMessage?.from?.isBot === true) return true;

  // Bot command: /command@botname or /command alone
  const cmdMatch = /^\/(?<command>[A-Za-z0-9_]+)(?:@(?<target>[A-Za-z0-9_]+))?(?:\s|$)/u.exec(text ?? "");
  if (cmdMatch) {
    const target = cmdMatch.groups?.target;
    return target === undefined || (botUsername !== undefined && target.toLowerCase() === botUsername.toLowerCase());
  }

  // Mention: @botUsername
  if (botUsername !== undefined && text?.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) return true;

  return false;
}

/**
 * Inline re-implementation of defaultOnMessage from eve defaults.
 */
async function defaultOnMessageImpl(
  ctx: TelegramContext,
  msg: TelegramMessage,
): Promise<TelegramInboundResult> {
  if (!shouldDispatchTelegramMessage(msg, ctx.telegram.botUsername)) return null;
  await ctx.telegram.startTyping();
  return { auth: defaultTelegramAuth(msg) };
}

/**
 * Transcribe a Telegram voice message using Groq's Whisper API.
 *
 * Flow:
 *   1. Call getFile on the Telegram Bot API to get the file path
 *   2. Download the OGG audio from Telegram's file server
 *   3. Transcribe via Groq Whisper
 */
async function transcribeVoice(voice: TelegramVoice, botToken: string): Promise<string> {
  // Step 1: getFile → returns { file_path: "voice/file_001.ogg" }
  const getFileResponse = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${voice.file_id}`,
  );
  if (!getFileResponse.ok) {
    throw new Error(`Telegram getFile failed: ${getFileResponse.status}`);
  }
  const getFileData = (await getFileResponse.json()) as {
    ok: boolean;
    result?: { file_path: string };
  };
  if (!getFileData.ok || !getFileData.result?.file_path) {
    throw new Error(`Telegram getFile returned an error: ${JSON.stringify(getFileData)}`);
  }

  // Step 2: download the audio file from Telegram
  // Telegram serves voice messages as .oga files (Ogg container + Opus codec).
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${getFileData.result.file_path}`;
  const audioResponse = await fetch(fileUrl);
  if (!audioResponse.ok) {
    throw new Error(`Telegram file download failed: ${audioResponse.status}`);
  }
  const audioBuffer = await audioResponse.arrayBuffer();

  // Step 3: transcribe via Groq Whisper API directly
  // We call the API with fetch because we need to control the multipart
  // filename so Groq's extension allowlist accepts .oga audio (Ogg/Opus).
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) throw new Error("GROQ_API_KEY is not set");

  const form = new FormData();
  // Use .ogg extension so Groq's allowlist (ogg, opus, mp3, ...) accepts it.
  // The bytes are identical — Telegram serves Ogg/Opus in a .oga container.
  form.append("file", new File([audioBuffer], "voice.ogg", { type: "audio/ogg" }));
  form.append("model", "whisper-large-v3");

  const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groqApiKey}` },
    body: form,
  });

  if (!groqResponse.ok) {
    const text = await groqResponse.text();
    throw new Error(`Groq transcription failed (${groqResponse.status}): ${text}`);
  }

  const data = (await groqResponse.json()) as { text?: string };
  return data.text ?? "";
}

/**
 * Production onMessage: whitelist check + real handler.
 */
function makeOnMessage(botToken: string): (
  ctx: TelegramContext,
  msg: TelegramMessage,
) => TelegramInboundResultOrPromise {
  return async (ctx, msg) => {
    const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
    if (allowedUserId && msg.from?.id !== allowedUserId) {
      await ctx.telegram.sendMessage("Access denied.");
      return null;
    }

    const raw = msg.raw as Record<string, unknown>;
    const voice = raw?.voice as TelegramVoice | undefined;

    if (voice) {
      try {
        await ctx.telegram.sendMessage("🎤 Transcribing...");
        const transcript = await transcribeVoice(voice, botToken);
        return defaultOnMessageImpl(ctx, { ...msg, text: transcript } as TelegramMessage);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await ctx.telegram.sendMessage(`Transcription failed: ${message}`);
        return null;
      }
    }

    return defaultOnMessageImpl(ctx, msg);
  };
}

/**
 * Telegram channel shared across ds-team agents.
 *
 * Reads credentials from the environment (so each app can have its own bot):
 *   TELEGRAM_BOT_TOKEN            — from @BotFather
 *   TELEGRAM_WEBHOOK_SECRET_TOKEN — random hex you also send to setWebhook
 *   TELEGRAM_BOT_USERNAME        — the @handle BotFather assigned (no `@` prefix)
 *   TELEGRAM_ALLOWED_USER_ID      — Telegram user ID that is allowed to use this bot
 *   GROQ_API_KEY                 — Groq API key for voice message transcription
 *
 * If any of the required credentials are missing at agent startup, the channel
 * factory will throw — declare them in .env before running eve dev or deploying.
 *
 * Attachments are constrained to images and PDFs up to 10 MB to keep
 * payload sizes predictable for the model context.
 */
export function makeTelegramChannel() {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecretToken = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;

  if (!botUsername) {
    throw new Error(
      "TELEGRAM_BOT_USERNAME is not set. Add it to .env (the @handle BotFather assigned, without `@`).",
    );
  }
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set. Add it to .env.");
  }
  if (!webhookSecretToken) {
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET_TOKEN is not set. Generate one with `node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"` and register it via setWebhook.",
    );
  }

  return telegramChannel({
    botUsername,
    credentials: {
      botToken,
      webhookSecretToken,
    },
    uploadPolicy: {
      allowedMediaTypes: ["image/*", "application/pdf"],
      maxBytes: 10 * 1024 * 1024,
    },
    onMessage: makeOnMessage(botToken),
  });
}

export default makeTelegramChannel;
