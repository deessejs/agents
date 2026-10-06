import { describe, expect, it } from "vitest";
import { render } from "react-email";
import { MetricsTable, describeDelta, type MetricRow } from "../../src/templates/metrics-table.tsx";

const sampleRows: ReadonlyArray<MetricRow> = [
  { label: "PRs merged", this: "38", last: "31", trend: "up", tone: "good" },
  { label: "Cycle time", this: "1.6d", last: "2.0d", trend: "down", tone: "good" },
  { label: "Dependabot open", this: "7", last: "4", trend: "up", tone: "bad" },
  { label: "PR size p95", this: "320", last: "320", trend: "flat", tone: "neutral" },
];

describe("MetricsTable", () => {
  it("renders the title and one row per metric", async () => {
    const html = await render(<MetricsTable title="Key metrics" rows={sampleRows} />);
    expect(html).toContain("Key metrics");
    expect(html).toContain("PRs merged");
    expect(html).toContain("Cycle time");
    expect(html).toContain("Dependabot open");
  });

  it("renders trend arrows for each row", async () => {
    const html = await render(<MetricsTable title="t" rows={sampleRows} />);
    expect(html).toContain("▲"); // up
    expect(html).toContain("▼"); // down
    expect(html).toContain("▬"); // flat
  });

  it("escapes row labels", async () => {
    // React auto-escapes the text content of every cell. The literal
    // `<b>` tag must not appear in the rendered HTML; the escaped form
    // `&lt;b&gt;` (one round of escaping) should.
    const html = await render(
      <MetricsTable
        title="t"
        rows={[
          { label: "<b>PRs merged</b>", this: "1", last: "1", trend: "flat", tone: "neutral" },
        ]}
      />,
    );
    expect(html).not.toContain("<b>PRs merged</b>");
    expect(html).toContain("&lt;b&gt;PRs merged&lt;/b&gt;");
  });
});

describe("describeDelta", () => {
  it("returns null when values are equal", () => {
    expect(describeDelta("100", "100")).toBeNull();
  });

  it("returns null when either is non-numeric", () => {
    expect(describeDelta("n/a", "100")).toBeNull();
    expect(describeDelta("100", "n/a")).toBeNull();
  });

  it("returns a formatted delta when values differ", () => {
    expect(describeDelta("38", "31")).toBe("7");
    expect(describeDelta("1500", "500")).toBe("1.0K");
  });

  it("returns a negative delta when this < last", () => {
    expect(describeDelta("31", "38")).toBe("-7");
  });
});
