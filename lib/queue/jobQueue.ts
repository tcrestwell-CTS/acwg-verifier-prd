/**
 * Job Queue Abstraction
 *
 * When FEATURE_REDIS_QUEUE=true and REDIS_URL is set: uses Redis (ioredis).
 * Otherwise: uses Prisma QueueJob table as a simple polling queue.
 *
 * This lets us ship with Prisma-backed retries now and swap to Redis
 * with a single env var change when ready.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { flags } from "@/lib/featureFlags";

export interface Job {
  type: string;
  payload: Record<string, unknown>;
  runAt?: Date;
  maxAttempts?: number;
}

// ── Prisma-backed queue (default) ─────────────────────────────────────────────

async function enqueueViaPrisma(job: Job): Promise<string> {
  const record = await db.queueJob.create({
    data: {
      type: job.type,
      payload: job.payload as object,
      status: "pending",
      maxAttempts: job.maxAttempts ?? 3,
      runAt: job.runAt ?? new Date(),
    },
  });
  return record.id;
}

async function processNextViaPrisma(type?: string): Promise<boolean> {
  const job = await db.queueJob.findFirst({
    where: {
      status: "pending",
      runAt: { lte: new Date() },
      ...(type ? { type } : {}),
    },
    orderBy: { runAt: "asc" },
  });

  if (!job) return false;

  await db.queueJob.update({
    where: { id: job.id },
    data: { status: "running", attempts: { increment: 1 } },
  });

  try {
    await dispatchJob(job.type, job.payload as Record<string, unknown>);
    await db.queueJob.update({
      where: { id: job.id },
      data: { status: "completed", completedAt: new Date() },
    });
  } catch (err) {
    const nextAttempt = job.attempts + 1;
    const isDead = nextAttempt >= job.maxAttempts;
    const backoffMs = Math.min(1000 * 2 ** job.attempts, 30_000);

    await db.queueJob.update({
      where: { id: job.id },
      data: {
        status: isDead ? "dead_letter" : "pending",
        lastError: String(err),
        runAt: isDead ? job.runAt : new Date(Date.now() + backoffMs),
      },
    });

    logger.error("Job failed", { jobId: job.id, type: job.type, attempt: nextAttempt, isDead });
  }

  return true;
}

// ── Redis-backed queue (when FEATURE_REDIS_QUEUE=true) ────────────────────────

async function enqueueViaRedis(job: Job): Promise<string> {
  // Import dynamically so Redis is optional
  const { createClient } = await import("redis").catch(() => ({ createClient: null }));
  if (!createClient || !process.env.REDIS_URL) {
    logger.warn("Redis not available, falling back to Prisma queue");
    return enqueueViaPrisma(job);
  }

  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();

  const id = `job:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const score = (job.runAt ?? new Date()).getTime();
  await client.zAdd(`queue:${job.type}`, { score, value: JSON.stringify({ id, ...job }) });
  await client.disconnect();

  return id;
}

// ── Job dispatcher ────────────────────────────────────────────────────────────

async function dispatchJob(type: string, payload: Record<string, unknown>): Promise<void> {
  logger.info("Dispatching job", { type, payload });

  switch (type) {
    case "send_alert":
      // Hook for alert service
      logger.info("Alert job", { payload });
      break;
    case "send_otp":
      // Re-trigger OTP if needed
      break;
    case "verify_vendor_retry":
      // Retry a failed vendor call
      break;
    default:
      logger.warn("Unknown job type", { type });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function enqueueJob(job: Job): Promise<string> {
  if (flags.redisQueue && process.env.REDIS_URL) {
    return enqueueViaRedis(job);
  }
  return enqueueViaPrisma(job);
}

export async function processNext(type?: string): Promise<boolean> {
  return processNextViaPrisma(type);
}

export async function getFailedJobs(limit = 50) {
  return db.queueJob.findMany({
    where: { status: { in: ["dead_letter", "failed"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getJobMetrics() {
  const [pending, running, completed, failed, deadLetter] = await Promise.all([
    db.queueJob.count({ where: { status: "pending" } }),
    db.queueJob.count({ where: { status: "running" } }),
    db.queueJob.count({ where: { status: "completed" } }),
    db.queueJob.count({ where: { status: "failed" } }),
    db.queueJob.count({ where: { status: "dead_letter" } }),
  ]);
  return { pending, running, completed, failed, deadLetter };
}
