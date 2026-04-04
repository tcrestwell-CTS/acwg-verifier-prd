import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { writeAuditLog } from "@/lib/audit";
import { enqueueJob } from "@/lib/queue/jobQueue";
import type { NormalizedPlatformOrder, PlatformAdapter } from "@/lib/integrations/platforms/adapter";
import { randomUUID } from "crypto";

export async function processWebhookEvent(opts: {
  adapter: PlatformAdapter;
  eventType: string;
  rawBody: string;
  signature: string;
  secret: string;
  idempotencyKey?: string;
}): Promise<{ status: "processed" | "duplicate" | "invalid" | "error"; message?: string }> {
  // 1. Verify HMAC signature
  const isValid = opts.adapter.verifyWebhookSignature(opts.rawBody, opts.signature, opts.secret);
  if (!isValid) {
    logger.warn("Webhook signature verification failed", { platform: opts.adapter.name });
    return { status: "invalid", message: "Invalid signature" };
  }

  // 2. Idempotency check
  const idemKey = opts.idempotencyKey ?? `${opts.adapter.name}:${opts.eventType}:${randomUUID()}`;
  const existing = await db.webhookEvent.findUnique({ where: { idempotencyKey: idemKey } });
  if (existing) {
    logger.info("Duplicate webhook event — skipping", { idempotencyKey: idemKey });
    return { status: "duplicate" };
  }

  // 3. Parse order
  const normalized: NormalizedPlatformOrder | null = opts.adapter.parseWebhookOrder(
    opts.rawBody,
    opts.eventType
  );

  // 4. Persist webhook event
  const webhookEvent = await db.webhookEvent.create({
    data: {
      platform: opts.adapter.name,
      eventType: opts.eventType,
      externalId: normalized?.externalId ?? "unknown",
      idempotencyKey: idemKey,
      payload: normalized ? (normalized as unknown as object) : JSON.parse(opts.rawBody) as object,
      status: "received",
    },
  });

  await writeAuditLog({
    actor: `webhook:${opts.adapter.name}`,
    action: "webhook:received",
    payload: {
      webhookEventId: webhookEvent.id,
      platform: opts.adapter.name,
      eventType: opts.eventType,
      externalId: normalized?.externalId,
    },
  });

  if (!normalized) {
    await db.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "skipped" },
    });
    return { status: "processed", message: "Event type skipped" };
  }

  // 5. Enqueue for async verification processing
  try {
    await enqueueJob({
      type: "platform_order_verify",
      payload: {
        webhookEventId: webhookEvent.id,
        platform: opts.adapter.name,
        order: normalized as unknown as Record<string, unknown>,
      },
    });

    await db.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "processing" },
    });

    logger.info("Webhook enqueued for processing", {
      webhookEventId: webhookEvent.id,
      externalId: normalized.externalId,
    });

    return { status: "processed" };
  } catch (err) {
    await db.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "failed", errorMessage: String(err) },
    });
    return { status: "error", message: String(err) };
  }
}
