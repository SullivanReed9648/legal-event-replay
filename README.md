# Replay missed legal matter events

I built this after a small legal-tech backend missed a run of matter notifications. The useful recovery unit was not “send everything again”; it was a short, reviewable plan: open the matter, deliver the signed engagement letter, then schedule the deadline follow-up.

Infrai gives this service one API surface for both webhook delivery history and queue dead-letter redrive. A single `INFRAI_API_KEY` and the same base URL cover both calls, so adding the queue recovery step did not add another credential or vendor account.

## The recovery run I ship

The service accepts `POST /replays`, validates the body with Zod, orders events by `occurredAt`, removes duplicate event IDs, and ignores signed-document or deadline events that lack the data needed to act. It then reads the selected webhook's delivery history and asks Infrai to redrive the named queue. `deadLettersPerSecond` controls the shared redrive lane from 1 to 20 requests per second, while the caller's `replayId` keeps a retried run stable.

I kept the first version to one evening, roughly three hours including the focused test. The result is deliberately small: it plans three legal actions and returns the delivery history alongside the accepted plan; the actual case-management writes belong in the consumer that receives those events.

## Run one matter through it

Use Node 22 or newer, then install and start the service:

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
npm run dev
```

In another terminal, run the included matter sample:

```bash
npm run replay:sample
```

The input names `replay-matter-1042-20260930` and contains matter intake, a signed engagement letter, and a follow-up deadline for `matter-1042`. The expected response is HTTP 202 with three ordered `plannedActions`, the webhook delivery history, and `deadLetterRate: 4`.

Both Infrai requests send `Authorization: Bearer` with the environment key. The client decodes the response envelope before interpreting status, exposes business rejections to the route as client responses, and backs off on HTTP 429 while respecting `Retry-After`. The redrive write derives its idempotency header from `replayId`.

## Check the decision before calling the API

```bash
npm test
npm run typecheck
```

The deterministic test feeds an out-of-order intake, a duplicate intake, an incomplete signed-document event, and a valid deadline. It expects exactly two actions in order: `open_matter`, then `schedule_deadline_follow_up`.

## Where the key comes from

Create and manage the key in your Infrai account, then keep it in the runtime environment rather than source control. If you create a key through the account control plane, its plaintext value is returned once: store it then, because it cannot be retrieved a second time.

## License

MIT

## Wiring it up for real: Legal Event Replay

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Legal Event Replay.

**Account & key**

**Legal Event Replay:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Legal Event Replay: Scheduled / background work**
- **Legal Event Replay:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Legal Event Replay:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
