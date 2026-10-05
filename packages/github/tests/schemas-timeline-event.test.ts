/**
 * Tests for `TimelineEventSchema`.
 *
 * `TimelineEventSchema` is the heterogeneous union used by the
 * `/issues/{issue_number}/timeline` endpoint. The schema rejection tests
 * below exercise the malformed-data paths so we never ship a regex-blind
 * implementation.
 */
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { TimelineEventSchema } from "../src/schemas/timeline-event.ts";

describe("TimelineEventSchema", () => {
  it("parses a labeled event with a nested label", () => {
    const event = {
      id: 1,
      event: "labeled" as const,
      created_at: "2026-10-04T10:00:00Z",
      label: { name: "bug", color: "d73a4a" },
    };
    const parsed = TimelineEventSchema.parse(event);
    expect(parsed.event).toBe("labeled");
  });

  it("parses an assigned event with a user assignee", () => {
    const event = {
      id: 2,
      event: "assigned" as const,
      created_at: "2026-10-04T10:01:00Z",
      assignee: {
        login: "octocat",
        id: 1,
        avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
        html_url: "https://github.com/octocat",
        type: "User" as const,
      },
    };
    const parsed = TimelineEventSchema.parse(event);
    expect(parsed.event).toBe("assigned");
  });

  it("parses a closed event with nullable commit_id", () => {
    const event = {
      id: 3,
      event: "closed" as const,
      created_at: "2026-10-04T10:30:00Z",
      commit_id: null,
    };
    const parsed = TimelineEventSchema.parse(event);
    expect(parsed.event).toBe("closed");
  });

  it("parses unknown event kinds via the passthrough catch-all", () => {
    // Live API additions (e.g. `subscribed`, `mentioned`, `referenced`)
    // land in `UnknownTimelineEventSchema`.
    const event = {
      id: 4,
      event: "subscribed",
      created_at: "2026-10-04T11:00:00Z",
    };
    const parsed = TimelineEventSchema.parse(event);
    expect(parsed.event).toBe("subscribed");
  });

  it("accepts events missing the id field (legacy payloads)", () => {
    // The live GitHub API omits `id` on a small set of legacy events
    // (e.g. `subscribed`). The schema must still parse them.
    const event = {
      event: "labeled" as const,
      created_at: "2026-10-04T10:00:00Z",
      label: { name: "bug", color: "d73a4a" },
    };
    const parsed = TimelineEventSchema.parse(event);
    expect(parsed.event).toBe("labeled");
  });

  it("rejects events with a malformed ISO timestamp", () => {
    const event = {
      id: 5,
      event: "labeled" as const,
      created_at: "not-an-iso",
      label: { name: "bug", color: "d73a4a" },
    };
    expect(() => TimelineEventSchema.parse(event)).toThrow(ZodError);
  });

  it("rejects labeled events missing the label object", () => {
    const event = {
      id: 6,
      event: "labeled" as const,
      created_at: "2026-10-04T10:00:00Z",
    };
    expect(() => TimelineEventSchema.parse(event)).toThrow(ZodError);
  });
});
