export {};

const response = await fetch("http://localhost:3000/replays", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    replayId: "replay-matter-1042-20260930",
    webhookId: "legal-events",
    dlqQueue: "matter-events",
    deadLettersPerSecond: 4,
    events: [
      {
        eventId: "evt-intake-1042",
        kind: "matter.intake",
        matterId: "matter-1042",
        occurredAt: "2026-09-30T09:00:00.000Z"
      },
      {
        eventId: "evt-signed-1042",
        kind: "document.signed",
        matterId: "matter-1042",
        documentId: "engagement-letter-1042",
        occurredAt: "2026-09-30T09:05:00.000Z"
      },
      {
        eventId: "evt-deadline-1042",
        kind: "deadline.follow_up",
        matterId: "matter-1042",
        deadlineAt: "2026-10-07T17:00:00.000Z",
        occurredAt: "2026-09-30T09:10:00.000Z"
      }
    ]
  })
});

console.log(JSON.stringify(await response.json(), null, 2));
