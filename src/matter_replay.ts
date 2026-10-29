import { z } from "zod";

export const replayRequestSchema = z.object({
  replayId: z.string().min(1),
  webhookId: z.string().min(1),
  dlqQueue: z.string().min(1),
  deadLettersPerSecond: z.number().int().min(1).max(20),
  events: z.array(z.object({
    eventId: z.string().min(1),
    kind: z.enum(["matter.intake", "document.signed", "deadline.follow_up"]),
    matterId: z.string().min(1),
    occurredAt: z.string().datetime(),
    documentId: z.string().min(1).optional(),
    deadlineAt: z.string().datetime().optional()
  })).min(1)
});

export type ReplayRequest = z.infer<typeof replayRequestSchema>;

export type ReplayAction = {
  eventId: string;
  matterId: string;
  action: "open_matter" | "deliver_signed_document" | "schedule_deadline_follow_up";
};

export function buildReplayPlan(input: ReplayRequest): ReplayAction[] {
  const seen = new Set<string>();
  const ordered = [...input.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  return ordered.flatMap((event) => {
    if (seen.has(event.eventId)) return [];
    seen.add(event.eventId);

    if (event.kind === "document.signed" && !event.documentId) return [];
    if (event.kind === "deadline.follow_up" && !event.deadlineAt) return [];

    const actions = {
      "matter.intake": "open_matter",
      "document.signed": "deliver_signed_document",
      "deadline.follow_up": "schedule_deadline_follow_up"
    } as const;

    return [{
      eventId: event.eventId,
      matterId: event.matterId,
      action: actions[event.kind]
    }];
  });
}
