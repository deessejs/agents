import { telegramChannel } from "eve/channels/telegram";
import { defaultOnMessage } from "eve/channels/telegram";

/**
 * Debug onMessage that logs all Telegram message data and the resulting
 * auth context before delegating to the real handler.
 *
 * Logs to stdout — look for it in the eve dev terminal.
 */
async function debugOnMessage(ctx, msg) {
  const rawFrom = msg.raw?.from ?? null;
  const rawChat = msg.raw?.chat ?? null;

  console.log("=== Telegram inbound ===");
  console.log("--- Raw Telegram body (from webhook) ---");
  console.log(JSON.stringify(msg.raw, null, 2));

  console.log("\n--- Parsed message object ---");
  console.log(JSON.stringify(
    {
      from: msg.from,
      chat: msg.chat,
      messageId: msg.messageId,
      text: msg.text,
      caption: msg.caption,
      messageThreadId: msg.messageThreadId,
      replyToMessage: msg.replyToMessage,
      attachments: msg.attachments,
    },
    null,
    2,
  ));

  const auth = defaultOnMessage(ctx, msg);

  console.log("\n--- Auth context being returned ---");
  if (auth && typeof auth.then === "function") {
    // auth is a promise
    auth.then((resolved) => {
      console.log(JSON.stringify(resolved, null, 2));
      console.log("=== end Telegram inbound ===\n");
      return resolved;
    });
    return auth;
  } else {
    console.log(JSON.stringify(auth, null, 2));
    console.log("=== end Telegram inbound ===\n");
    return auth;
  }
}

/**
 * Telegram channel shared across ds-team agents.
 *
 * Reads credentials from the environment (so each app can have its own bot):
 *   TELEGRAM_BOT_TOKEN         — from @BotFather
 *   TELEGRAM_WEBHOOK_SECRET_TOKEN — random hex you also send to setWebhook
 *   TELEGRAM_BOT_USERNAME      — the @handle BotFather assigned (no `@` prefix)
 *
 * If any of these is missing at agent startup, the channel factory will
 * throw — declare them in .env before running eve dev or deploying.
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
    onMessage: debugOnMessage,
  });
}

export default makeTelegramChannel;
