import { telegramChannel, defaultTelegramAuth } from "eve/channels/telegram";

/**
 * Inline re-implementation of shouldDispatchTelegramMessage from eve defaults.
 * Dispatch a message if it has text/content and either:
 *   - it's a DM (private chat)
 *   - it replies to the bot
 *   - it's a bot command directed at this bot
 *   - it mentions the bot
 */
function shouldDispatchTelegramMessage(msg: {
  from?: { isBot?: boolean };
  chat: { type: string };
  text?: string;
  caption?: string;
  attachments: unknown[];
  replyToMessage?: { from?: { isBot?: boolean } };
}, botUsername?: string): boolean {
  if (msg.from?.isBot === true || msg.chat.type === "channel") return false;
  const text = msg.text ?? msg.caption;
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
  ctx: { telegram: { startTyping(): Promise<void>; botUsername?: string } },
  msg: Parameters<typeof shouldDispatchTelegramMessage>[0],
) {
  if (!shouldDispatchTelegramMessage(msg, ctx.telegram.botUsername)) return null;
  await ctx.telegram.startTyping();
  return { auth: defaultTelegramAuth(msg) };
}

// ---------------------------------------------------------------------------
// Debug onMessage — logs everything then delegates to the real handler.
// Remove this and the debug wrapper below once you're done debugging.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TODO: replace debugOnMessage with defaultOnMessageImpl when done debugging
// ---------------------------------------------------------------------------

async function debugOnMessage(
  ctx: { telegram: { startTyping(): Promise<void>; botUsername?: string; sendMessage(text: string): Promise<unknown> } },
  msg: Parameters<typeof shouldDispatchTelegramMessage>[0] & { raw?: unknown },
) {
  // Run the real handler first so the agent starts responding
  const result = await defaultOnMessageImpl(ctx, msg);
  if (!result) return null;

  // Build debug payloads
  const raw = JSON.stringify(msg.raw ?? {}, null, 2);
  const parsed = JSON.stringify(
    {
      from: msg.from,
      chat: msg.chat,
      messageId: (msg as Record<string, unknown>).messageId,
      text: msg.text,
      caption: msg.caption,
      messageThreadId: (msg as Record<string, unknown>).messageThreadId,
      replyToMessage: (msg as Record<string, unknown>).replyToMessage,
      attachments: msg.attachments,
    },
    null,
    2,
  );
  const authStr = JSON.stringify(result, null, 2);

  // Summary first — plain text, sends right now, caught errors bubble up
  await ctx.telegram.sendMessage(
    `[DEBUG] from=${msg.from?.username ?? msg.from?.id ?? "?"} | ` +
    `chat=${msg.chat.id} (${msg.chat.type}) | ` +
    `text="${(msg.text ?? msg.caption ?? "").substring(0, 80)}"`,
  );

  // Raw, parsed, auth — split into 4000-char chunks to stay under Telegram's limit
  for (const [label, data] of [
    ["[RAW]", raw],
    ["[PARSED]", parsed],
    ["[AUTH]", authStr],
  ] as const) {
    for (let i = 0; i < data.length; i += 4000) {
      const chunk = data.substring(i, i + 4000);
      await ctx.telegram.sendMessage(`${label}${i > 0 ? ` (${i})` : ""}\n${chunk}`).catch((e: unknown) =>
        ctx.telegram.sendMessage(`${label} ERROR: ${e instanceof Error ? e.message : String(e)}`),
      );
    }
  }

  return result;
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
    // TODO: switch to defaultOnMessageImpl once debug is done
    onMessage: debugOnMessage,
  });
}

export default makeTelegramChannel;
