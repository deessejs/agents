import { describe, expect, it } from "vitest";
import { render } from "react-email";
import { EmailShell } from "../../src/templates/email-shell.tsx";
import { DigestBlock } from "../../src/templates/digest-block.tsx";

describe("EmailShell", () => {
  it("renders subject as <Preview>", async () => {
    const html = await render(
      <EmailShell subject="Daily digest 2026-10-06">
        <p>content</p>
      </EmailShell>,
    );
    expect(html).toContain("Daily digest 2026-10-06");
  });

  it("escapes header text", async () => {
    // React auto-escapes the text content of the <Text> element.
    const html = await render(
      <EmailShell subject="S" header="<script>alert(1)</script>">
        <p>x</p>
      </EmailShell>,
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes footer text", async () => {
    const html = await render(
      <EmailShell subject="S" footer="<img src=x onerror=alert(1)>">
        <p>x</p>
      </EmailShell>,
    );
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("renders children in the body slot", async () => {
    const html = await render(
      <EmailShell subject="S">
        <p data-testid="marker">the slot</p>
      </EmailShell>,
    );
    expect(html).toContain("the slot");
  });

  it("uses light theme by default", async () => {
    const html = await render(
      <EmailShell subject="S">
        <p>x</p>
      </EmailShell>,
    );
    expect(html).toContain("#ffffff"); // light background
  });
});

describe("DigestBlock", () => {
  it("renders the section label", async () => {
    const html = await render(<DigestBlock kind="tldr" text="Hello" />);
    expect(html).toContain("TL;DR");
  });

  it("prepends the RAG emoji when status is set", async () => {
    // react-email@6 made `render` async; the previous sync return is
    // now a Promise. We assert on the resolved value.
    const html = await render(<DigestBlock kind="risks" text="x" status="red" />);
    expect(html).toContain("🔴");
    expect(html).toContain("Risks &amp; blockers");
  });

  it("escapes the text body", async () => {
    // React auto-escapes the text content of the <Text> element.
    const html = await render(<DigestBlock kind="shipped" text="<b>feat: auth</b>" />);
    expect(html).not.toContain("<b>feat: auth</b>");
    expect(html).toContain("&lt;b&gt;feat: auth&lt;/b&gt;");
  });
});
