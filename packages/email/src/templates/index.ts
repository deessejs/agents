/**
 * @workspace/email/templates — React Email components for agent digests.
 *
 * Public surface:
 *   - EmailShell  — top-level layout (header / footer / content slot)
 *   - DigestBlock — one section (TL;DR, Shipped, Risks, Watchlist)
 *   - tokens      — design tokens (light + dark themes)
 *   - SectionKind, RagStatus — discriminated unions for the editor
 */
export { EmailShell } from "./email-shell.tsx";
export type { EmailShellProps } from "./email-shell.tsx";
export { DigestBlock } from "./digest-block.tsx";
export type { DigestBlockProps, SectionKind, RagStatus } from "./digest-block.tsx";
export { tokens } from "./tokens.ts";
export type { Tokens, Theme } from "./tokens.ts";
