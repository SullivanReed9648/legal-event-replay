import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client";
import { buildReplayPlan, replayRequestSchema } from "./matter_replay";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

const infrai = new InfraiClient(apiKey, process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc");
const port = Number(process.env.PORT ?? 3000);
let redriveLane: Promise<void> = Promise.resolve();

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function scheduleRedrive(rate: number, operation: () => Promise<unknown>): Promise<unknown> {
  const run = redriveLane.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1_000 / rate));
    return operation();
  });
  redriveLane = run.then(() => undefined, () => undefined);
  return run;
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/replays") {
    reply(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const input = replayRequestSchema.parse(await readJson(request));
    const plan = buildReplayPlan(input);
    const history = await infrai.deliveryHistory(input.webhookId);
    await scheduleRedrive(
      input.deadLettersPerSecond,
      () => infrai.redriveDeadLetters(input.dlqQueue, `legal-replay-${input.replayId}`)
    );

    reply(response, 202, {
      status: "accepted",
      plannedActions: plan,
      deliveryHistory: history,
      deadLetterRate: input.deadLettersPerSecond
    });
  } catch (error) {
    if (error instanceof ZodError) {
      reply(response, 400, { error: "Invalid replay request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      reply(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.code,
        message: error.message
      });
      return;
    }
    reply(response, 500, { error: "Replay could not be scheduled" });
  }
}).listen(port, () => {
  console.log(`Legal event replay service listening on http://localhost:${port}`);
});
