/**
 * Zod schema for a GitHub issue/PR label.
 *
 * `color` is the 6-char hex string without the leading `#`.
 */
import { z } from "zod";

export const LabelSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    color: z.string().regex(/^[0-9a-fA-F]{6}$/, "color must be a 6-char hex"),
    description: z.string().nullable().optional(),
    default: z.boolean().optional(),
  })
  .strict();

export type Label = z.infer<typeof LabelSchema>;
