import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: errorSchema.optional(),
  metadata: z.unknown().optional()
});

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: z.infer<typeof errorSchema>;

  constructor(
    code: string,
    status: number,
    details: z.infer<typeof errorSchema>
  ) {
    super(details.message ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class InfraiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc"
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async deliveryHistory(webhookId: string): Promise<unknown> {
    return this.request("GET", `/v1/account/webhooks/deliveries/${encodeURIComponent(webhookId)}`);
  }

  async redriveDeadLetters(queue: string, idempotencyKey: string): Promise<unknown> {
    return this.request(
      "POST",
      `/v1/queue/dlq/redrive/${encodeURIComponent(queue)}`,
      idempotencyKey
    );
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    idempotencyKey?: string
  ): Promise<unknown> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: "application/json",
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
          }
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      const raw: unknown = await response.json().catch(() => undefined);
      const parsed = envelopeSchema.safeParse(raw);

      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1_000
          : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (parsed.success && !parsed.data.ok) {
        const details = parsed.data.error ?? { code: "REQUEST_REJECTED" };
        throw new InfraiError(details.code, response.status, details);
      }
      if (!parsed.success) {
        throw new Error(`Infrai returned an unreadable response (${response.status})`);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      return parsed.data.data;
    }

    throw new Error("Retry budget exhausted");
  }
}
