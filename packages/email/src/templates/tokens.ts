/**
 * Design tokens for the digest email templates. Inlined CSS (no Tailwind
 * runtime) — the digest is a self-contained email, and Tailwind classes
 * are stripped by most mail clients.
 *
 * Two themes are exported: `light` and `dark`. Mail clients respect
 * the `prefers-color-scheme: dark` media query in CSS, so a single
 * template renders correctly in both modes.
 *
 * Color palette is hand-picked for:
 *   - WCAG AA contrast on body text (4.5:1 minimum)
 *   - Avoiding the "agent digest" pattern of grey-on-grey
 *   - Differentiating section types (TL;DR, Shipped, Risks) at a glance
 */

export const tokens = {
  light: {
    background: "#ffffff",
    foreground: "#0f172a", // slate-900
    muted: "#64748b", // slate-500
    accent: "#2563eb", // blue-600
    success: "#16a34a", // green-600
    warn: "#d97706", // amber-600
    danger: "#dc2626", // red-600
    sectionDivider: "#e2e8f0", // slate-200
  },
  dark: {
    background: "#0f172a", // slate-900
    foreground: "#f1f5f9", // slate-100
    muted: "#94a3b8", // slate-400
    accent: "#60a5fa", // blue-400
    success: "#4ade80", // green-400
    warn: "#fbbf24", // amber-400
    danger: "#f87171", // red-400
    sectionDivider: "#1e293b", // slate-800
  },
  /**
   * RAG status colors. Aligned with the editorial principle
   * "always search for yellow/red signals". The green is intentionally
   * muted so it doesn't dominate the eye.
   */
  rag: {
    green: "#16a34a",
    yellow: "#d97706",
    red: "#dc2626",
  },
  /**
   * Type scale (px). Email clients ignore custom font-size on <span>
   * but respect it on <p>/<h1>/<h2>/<h3>.
   */
  fontSize: {
    h1: "28px",
    h2: "20px",
    h3: "16px",
    body: "15px",
    small: "13px",
  },
  /** Spacing scale (px). Email clients respect margin/padding on <td>. */
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
  },
} as const;

export type Tokens = typeof tokens;
export type Theme = keyof typeof tokens;
