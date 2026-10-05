/**
 * Zod schema for a GitHub Issue timeline event.
 *
 * The `/issues/{issue_number}/timeline` endpoint returns a heterogeneous
 * list of event kinds. We model the most common ones as a discriminated
 * union on the `event` string; unknown kinds are kept via a passthrough
 * so live API additions don't break parsing.
 *
 * Reference: <https://docs.github.com/en/rest/issues/timeline>.
 */
import { z } from "zod";

import { IsoDateTimeSchema, NullableIsoDateTimeSchema } from "./datetime.ts";
import { CommitShaSchema } from "./shared.ts";
import { GitHubHtmlUrlSchema } from "./url.ts";
import { UserSchema } from "./user.ts";

/**
 * Common fields shared by every timeline event — `created_at`, the
 * actor (a `User` or `null`), and the URL.
 *
 * `id` is optional because the live GitHub API omits it on a small set
 * of legacy events (e.g. `subscribed`); keeping it required would
 * surface false-positive Zod errors for legitimate payloads.
 */
const TimelineEventBase = z.object({
  id: z.number().int().positive().optional(),
  created_at: IsoDateTimeSchema,
  updated_at: NullableIsoDateTimeSchema.optional(),
  actor: UserSchema.nullable().optional(),
  html_url: GitHubHtmlUrlSchema.optional(),
  url: GitHubHtmlUrlSchema.optional(),
});

/** `labeled` / `unlabeled` — `label` carries the affected label. */
const LabeledEventSchema = TimelineEventBase.extend({
  event: z.literal("labeled"),
  label: z
    .object({
      name: z.string(),
      color: z.string(),
    })
    .passthrough(),
});

const UnlabeledEventSchema = TimelineEventBase.extend({
  event: z.literal("unlabeled"),
  label: z
    .object({
      name: z.string(),
      color: z.string(),
    })
    .passthrough(),
});

/** `assigned` / `unassigned` — `assignee` is the affected user. */
const AssignedEventSchema = TimelineEventBase.extend({
  event: z.literal("assigned"),
  assignee: UserSchema,
});

const UnassignedEventSchema = TimelineEventBase.extend({
  event: z.literal("unassigned"),
  assignee: UserSchema,
});

/** `closed` — `commit_id` is optional; present when a closing commit exists. */
const ClosedEventSchema = TimelineEventBase.extend({
  event: z.literal("closed"),
  commit_id: CommitShaSchema.nullable().optional(),
});

/** `reopened`. */
const ReopenedEventSchema = TimelineEventBase.extend({
  event: z.literal("reopened"),
});

/** `commented` — `body` is the comment text, `commit_id` identifies the comment if any. */
const CommentedEventSchema = TimelineEventBase.extend({
  event: z.literal("commented"),
  body: z.string().max(65_536).nullable().optional(),
  commit_id: CommitShaSchema.nullable().optional(),
});

/** `renamed` — `from` and `to` carry the title transition. */
const RenamedEventSchema = TimelineEventBase.extend({
  event: z.literal("renamed"),
  rename: z.object({
    from: z.string(),
    to: z.string(),
  }),
});

/** `cross-referenced` — `source` is the referencing issue/PR. */
const CrossReferencedEventSchema = TimelineEventBase.extend({
  event: z.literal("cross-referenced"),
  source: z
    .object({
      type: z.enum(["issue", "pull_request", "discussion"]).optional(),
    })
    .passthrough(),
});

/** `review_requested` / `review_request_removed` — `requested_reviewer` / `requested_team`. */
const ReviewRequestedEventSchema = TimelineEventBase.extend({
  event: z.literal("review_requested"),
  requested_reviewer: UserSchema.optional(),
  requested_team: z
    .object({
      name: z.string(),
      slug: z.string(),
    })
    .passthrough()
    .optional(),
});

const ReviewRequestRemovedEventSchema = TimelineEventBase.extend({
  event: z.literal("review_request_removed"),
  requested_reviewer: UserSchema.optional(),
});

/** `review_dismissed` / `review_submitted`. */
const ReviewDismissedEventSchema = TimelineEventBase.extend({
  event: z.literal("review_dismissed"),
  dismissal_message: z.string().max(65_536).nullable().optional(),
});

const ReviewSubmittedEventSchema = TimelineEventBase.extend({
  event: z.literal("review_submitted"),
  review: z
    .object({
      state: z.string(),
    })
    .passthrough(),
});

/** `locked` / `unlocked` — `lock_reason` may be present on `locked`. */
const LockedEventSchema = TimelineEventBase.extend({
  event: z.literal("locked"),
  lock_reason: z
    .enum(["resolved", "off-topic", "too heated", "spam", "collaboration limited"])
    .nullable()
    .optional(),
});

const UnlockedEventSchema = TimelineEventBase.extend({
  event: z.literal("unlocked"),
});

/** `pinned` / `unpinned`. */
const PinnedEventSchema = TimelineEventBase.extend({ event: z.literal("pinned") });
const UnpinnedEventSchema = TimelineEventBase.extend({ event: z.literal("unpinned") });

/** `marked_as_duplicate` / `converted_to_discussion`. */
const MarkedAsDuplicateEventSchema = TimelineEventBase.extend({
  event: z.literal("marked_as_duplicate"),
});

const ConvertedToDiscussionEventSchema = TimelineEventBase.extend({
  event: z.literal("converted_to_discussion"),
});

/** Catch-all for events we don't model explicitly. Keeps live payloads
 * (e.g. `subscribed`, `mentioned`, `referenced`) parseable. */
const UnknownTimelineEventSchema = TimelineEventBase.extend({
  event: z.string().min(1).max(50),
}).passthrough();

/**
 * Discriminated union over the `event` discriminator for the events we
 * model explicitly. Each branch's discriminator is a string literal, so
 * Zod picks the matching branch in O(1) and surfaces meaningful errors
 * when the branch's other required fields are missing (e.g. `label` on
 * `labeled`).
 *
 * NOTE: this MUST stay the last const declared in the file. The
 * `KNOWN_EVENT_NAMES` set below derives from
 * `knownTimelineEventSchema.options` so adding a new branch here is the
 * only edit required to keep the model and the parse-allow-list in sync.
 */
export const knownTimelineEventSchema = z.discriminatedUnion("event", [
  LabeledEventSchema,
  UnlabeledEventSchema,
  AssignedEventSchema,
  UnassignedEventSchema,
  ClosedEventSchema,
  ReopenedEventSchema,
  CommentedEventSchema,
  RenamedEventSchema,
  CrossReferencedEventSchema,
  ReviewRequestedEventSchema,
  ReviewRequestRemovedEventSchema,
  ReviewDismissedEventSchema,
  ReviewSubmittedEventSchema,
  LockedEventSchema,
  UnlockedEventSchema,
  PinnedEventSchema,
  UnpinnedEventSchema,
  MarkedAsDuplicateEventSchema,
  ConvertedToDiscussionEventSchema,
]);

/**
 * Set of event names we model explicitly. If `event` is one of these,
 * the payload must satisfy the matching branch — falling through to the
 * catch-all is an error.
 *
 * Derived from the discriminated union above so adding a new branch
 * automatically registers its discriminator here (no second list to keep
 * in sync). We extract the `event` field from each branch via the
 * `.shape.event.value` access path; `z.literal("foo")` exposes the value
 * as a `ZodLiteral` whose `.value` is the literal string.
 */
const KNOWN_EVENT_NAMES: ReadonlySet<string> = new Set(
  knownTimelineEventSchema.options.map((option) => option.shape.event.value),
);

/** Inferred TypeScript type for a known timeline event. */
export type KnownTimelineEvent = z.infer<typeof knownTimelineEventSchema>;

/**
 * Parse a known timeline event via {@link knownTimelineEventSchema} and
 * fall back to {@link UnknownTimelineEventSchema} for events GitHub adds
 * later. The two-step parse keeps the discriminator strict (known events
 * must have the right shape) without rejecting future additions.
 *
 * @example
 * ```ts
 * const parsed = parseTimelineEvent({ event: "labeled", label: {...}, created_at: "..." });
 * ```
 */
export function parseTimelineEvent(raw: unknown): KnownTimelineEvent | UnknownTimelineEvent {
  if (raw !== null && typeof raw === "object" && "event" in raw) {
    const eventField = (raw as { event: unknown }).event;
    if (typeof eventField === "string" && KNOWN_EVENT_NAMES.has(eventField)) {
      // Known event kind — must satisfy the corresponding branch.
      return knownTimelineEventSchema.parse(raw);
    }
  }
  return UnknownTimelineEventSchema.parse(raw);
}

/** Inferred TypeScript type for a timeline event of unknown kind. */
export type UnknownTimelineEvent = z.infer<typeof UnknownTimelineEventSchema>;

/** Discriminated union over the `event` field covering all parseable timeline events. */
export type TimelineEvent = KnownTimelineEvent | UnknownTimelineEvent;

/** String-literal union of the timeline events we model explicitly. */
export type TimelineEventName = KnownTimelineEvent["event"];

/**
 * Top-level schema for parsing an arbitrary timeline event. Uses
 * {@link parseTimelineEvent} so unknown event kinds still parse via the
 * passthrough catch-all while known events must satisfy the matching schema.
 */
export const TimelineEventSchema = z.unknown().transform((raw) => parseTimelineEvent(raw));
