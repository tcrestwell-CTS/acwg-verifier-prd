/**
 * Lightweight metrics counters for observability.
 *
 * In production: wire these to your observability provider
 * (Datadog, Prometheus, Vercel Analytics, etc.) via the flush() hook.
 *
 * For now: structured logs that can be ingested by any log aggregator.
 */

import { logger } from "@/lib/logger";

interface MetricEvent {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: number;
}

// In-memory buffer (flushed per-request in serverless)
const buffer: MetricEvent[] = [];

export function increment(name: string, tags?: Record<string, string>) {
  buffer.push({ name, value: 1, tags, timestamp: Date.now() });
}

export function timing(name: string, durationMs: number, tags?: Record<string, string>) {
  buffer.push({ name, value: durationMs, tags, timestamp: Date.now() });
  logger.info(`metric:timing ${name}=${durationMs}ms`, tags);
}

export function gauge(name: string, value: number, tags?: Record<string, string>) {
  buffer.push({ name, value, tags, timestamp: Date.now() });
}

/** Flush metrics to structured logs (replace with real sink in production) */
export function flush() {
  if (buffer.length === 0) return;
  const events = buffer.splice(0, buffer.length);
  events.forEach((e) => {
    logger.info(`metric:${e.name}`, { value: e.value, ...e.tags });
  });
}

/** Wrap an async function with timing instrumentation */
export async function timed<T>(
  name: string,
  fn: () => Promise<T>,
  tags?: Record<string, string>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    timing(name, Date.now() - start, { ...tags, status: "ok" });
    return result;
  } catch (err) {
    timing(name, Date.now() - start, { ...tags, status: "error" });
    throw err;
  }
}

// Named metric helpers
export const metrics = {
  verifyStart: () => increment("verify.started"),
  verifySuccess: (ms: number) => timing("verify.duration", ms, { status: "ok" }),
  verifyError: (ms: number) => timing("verify.duration", ms, { status: "error" }),
  decisionMade: (decision: string) => increment("decision.made", { decision }),
  vendorCall: (vendor: string, status: "ok" | "error", ms: number) =>
    timing(`vendor.${vendor}.duration`, ms, { status }),
  otpSent: () => increment("otp.sent"),
  otpVerified: (success: boolean) => increment("otp.verified", { success: String(success) }),
  webhookReceived: (platform: string) => increment("webhook.received", { platform }),
  webhookDuplicate: (platform: string) => increment("webhook.duplicate", { platform }),
  cacheHit: (key: string) => increment("cache.hit", { key }),
  cacheMiss: (key: string) => increment("cache.miss", { key }),
  queueJobEnqueued: (type: string) => increment("queue.enqueued", { type }),
  queueJobCompleted: (type: string) => increment("queue.completed", { type }),
  queueJobFailed: (type: string) => increment("queue.failed", { type }),
};
