/**
 * Top-level email layout: <Html><Head/><Body><Container>...</Container></Body></Html>
 *
 * Inlines the design tokens' colors as inline CSS (most email clients
 * strip <style> blocks). Renders the optional header, optional footer
 * (with the `List-Unsubscribe` mailto link), and the main content slot.
 *
 * Children are expected to be the structured digest sections
 * (TL;DR, Shipped, Risks, Watchlist) — see `digest-block.tsx`.
 *
 * **Security:** every user-supplied string passed via JSX is
 * automatically escaped by React (text nodes are HTML-escaped before
 * render). XSS payloads are inert by construction; no separate
 * allowlist regex is needed.
 */
import * as React from "react";
import { Body, Container, Head, Html, Preview, Section, Text } from "react-email";

import { tokens } from "./tokens.ts";
import type { Theme } from "./tokens.ts";

export interface EmailShellProps {
  /**
   * Subject of the email. Rendered into a `<Preview>` element so
   * inbox previews show it.
   */
  readonly subject: string;
  /**
   * Optional header text (e.g. agent name + digest date).
   * React auto-escapes this on render.
   */
  readonly header?: string;
  /**
   * Optional footer text. The wrapper injects the unsubscribe mailto
   * separately (in `X-Digest-Id` + body) — this is for any extra
   * branding/legal text.
   */
  readonly footer?: string;
  /** Structured digest sections (TL;DR, Shipped, Risks, Watchlist). */
  readonly children: React.ReactNode;
  /** Theme override. Default: "light". */
  readonly theme?: Theme;
}

export function EmailShell({
  subject,
  header,
  footer,
  children,
  theme = "light",
}: EmailShellProps): React.ReactElement {
  // Narrow to the single theme's token object so `t.foreground` etc.
  // type-check without bleeding in the `rag` token shape.
  const t = theme === "dark" ? tokens.dark : tokens.light;
  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body
        style={{
          backgroundColor: t.background,
          color: t.foreground,
          fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          margin: 0,
          padding: 0,
        }}
      >
        <Container
          style={{
            maxWidth: "640px",
            margin: "0 auto",
            padding: tokens.spacing.lg,
          }}
        >
          {header !== undefined && (
            <Section
              style={{
                borderBottom: `1px solid ${t.sectionDivider}`,
                paddingBottom: tokens.spacing.md,
                marginBottom: tokens.spacing.md,
              }}
            >
              <Text
                style={{
                  fontSize: tokens.fontSize.small,
                  color: t.muted,
                  margin: 0,
                }}
              >
                {header}
              </Text>
            </Section>
          )}
          {children}
          {footer !== undefined && (
            <Section
              style={{
                borderTop: `1px solid ${t.sectionDivider}`,
                paddingTop: tokens.spacing.md,
                marginTop: tokens.spacing.lg,
              }}
            >
              <Text
                style={{
                  fontSize: tokens.fontSize.small,
                  color: t.muted,
                  margin: 0,
                }}
              >
                {footer}
              </Text>
            </Section>
          )}
        </Container>
      </Body>
    </Html>
  );
}
