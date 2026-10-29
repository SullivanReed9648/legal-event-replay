import assert from "node:assert/strict";
import test from "node:test";
import { buildReplayPlan, replayRequestSchema } from "../src/matter_replay";

test("orders legal actions, removes duplicates, and skips incomplete signed delivery", () => {
  const input = replayRequestSchema.parse({
    replayId: "replay-m-7",
    webhookId: "legal-events",
    dlqQueue: "matter-events",
    deadLettersPerSecond: 3,
    events: [
      { eventId: "signed", kind: "document.signed", matterId: "m-7", occurredAt: "2026-09-30T09:02:00.000Z" },
      { eventId: "intake", kind: "matter.intake", matterId: "m-7", occurredAt: "2026-09-30T09:00:00.000Z" },
      { eventId: "intake", kind: "matter.intake", matterId: "m-7", occurredAt: "2026-09-30T09:01:00.000Z" },
      { eventId: "deadline", kind: "deadline.follow_up", matterId: "m-7", deadlineAt: "2026-10-07T17:00:00.000Z", occurredAt: "2026-09-30T09:03:00.000Z" }
    ]
  });

  assert.deepEqual(buildReplayPlan(input), [
    { eventId: "intake", matterId: "m-7", action: "open_matter" },
    { eventId: "deadline", matterId: "m-7", action: "schedule_deadline_follow_up" }
  ]);
});
