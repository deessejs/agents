import {
  telegramChannel,
  defaultTelegramAuth,
  type TelegramMessage,
  type TelegramContext,
  type TelegramInboundResult,
  type TelegramInboundResultOrPromise,
} from "eve/channels/telegram";

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
 * Production onMessage: whitelist check + real handler.
 */
function makeOnMessage(): (
  ctx: TelegramContext,
  msg: TelegramMessage,
) => TelegramInboundResultOrPromise {
  return async (ctx, msg) => {
    const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
    if (allowedUserId && msg.from?.id !== allowedUserId) {
      await ctx.telegram.sendMessage("Access denied.");
      return null;
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
    onMessage: makeOnMessage(),
  });
}

export default makeTelegramChannel;
