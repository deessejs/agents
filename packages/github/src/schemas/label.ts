/**
 * Zod schema for a GitHub issue/PR label.
 *
 * `color` is the 6-char hex string without the leading `#`.
 */
import { z } from "zod";

export const LabelSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(50),
    color: z.string().regex(/^[0-9a-fA-F]{6}$/, "color must be a 6-char hex"),
    description: z.string().max(100).nullable().optional(),
    default: z.boolean().optional(),
  })
  .passthrough();

export type Label = z.infer<typeof LabelSchema>;
