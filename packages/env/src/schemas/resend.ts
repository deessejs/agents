import { z } from "zod";

/**
 * Resend email delivery schema.
 *
 * Validates the API key shape (`re_<20+ alphanumeric/underscore chars>`)
 * and the From/Reply-To email addresses. Reply-To is optional so agents
 * that don't need a separate address can omit it.
 */
export const resendSchema = z
  .object({
    RESEND_API_KEY: z
      .string()
      .regex(
        /^re_[a-zA-Z0-9_]{20,}$/,
        "RESEND_API_KEY must start with 're_' followed by at least 20 identifier characters",
      ),
    RESEND_FROM_ADDRESS: z.email("RESEND_FROM_ADDRESS must be a valid email"),
    RESEND_FROM_NAME: z.string().default("Agent"),
    RESEND_REPLY_TO: z.email().optional(),
  })
  .strict();
