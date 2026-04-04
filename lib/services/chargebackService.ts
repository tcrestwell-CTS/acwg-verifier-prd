import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";

// ── Create chargeback ─────────────────────────────────────────────────────────

export async function createChargeback(opts: {
  orderId: string;
  reason: string;
  amount: number;
  currency?: string;
  chargebackDate: Date;
  notes?: string;
  actor: string;
}) {
  const order = await db.order.findUnique({
    where: { id: opts.orderId },
    include: { verification: true },
  });
  if (!order) throw new Error("Order not found");

  const record = await db.chargebackRecord.create({
    data: {
      orderId: opts.orderId,
      reason: opts.reason,
      amount: opts.amount,
      currency: opts.currency ?? "USD",
      chargebackDate: opts.chargebackDate,
      reportedBy: opts.actor,
      notes: opts.notes ?? null,
      status: "open",
    },
  });

  await writeAuditLog({
    orderId: opts.orderId,
    actor: opts.actor,
    action: "chargeback:created",
    payload: { chargebackId: record.id, amount: opts.amount, reason: opts.reason },
  });

  logger.info("Chargeback recorded", { chargebackId: record.id, orderId: opts.orderId });

  // Hook: analyze verification signals for future rules tuning
  if (order.verification) {
    await analyzeChargebackSignals(record.id, order.verification.overall as Record<string, unknown>);
  }

  return record;
}

// ── List chargebacks ──────────────────────────────────────────────────────────

export async function listChargebacks(opts?: {
  status?: string;
  orderId?: string;
  limit?: number;
}) {
  return db.chargebackRecord.findMany({
    where: {
      ...(opts?.status ? { status: opts.status as never } : {}),
      ...(opts?.orderId ? { orderId: opts.orderId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 100,
    include: {
      order: { select: { customerName: true, email: true } },
    },
  });
}

// ── Update chargeback status ──────────────────────────────────────────────────

export async function updateChargebackStatus(opts: {
  id: string;
  status: "investigating" | "won" | "lost" | "resolved";
  resolution?: string;
  actor: string;
}) {
  const updated = await db.chargebackRecord.update({
    where: { id: opts.id },
    data: {
      status: opts.status,
      resolution: opts.resolution ?? null,
      resolvedAt: ["won", "lost", "resolved"].includes(opts.status) ? new Date() : null,
    },
  });

  await writeAuditLog({
    orderId: updated.orderId,
    actor: opts.actor,
    action: `chargeback:${opts.status}`,
    payload: { chargebackId: opts.id, resolution: opts.resolution },
  });

  return updated;
}

// ── Signal analysis hook (for future rules tuning) ────────────────────────────

async function analyzeChargebackSignals(
  chargebackId: string,
  overall: Record<string, unknown>
) {
  // This hook surfaces which risk signals were present on chargeback orders.
  // Future: feed into a rules weight suggestion engine.
  // For now: log for manual review.
  logger.info("Chargeback signal analysis", {
    chargebackId,
    riskScore: overall.score,
    decision: overall.decision,
    reasons: overall.reasons,
    note: "Use this data to tune rule weights — no auto-modification of production rules",
  });
}

// ── Reporting: chargeback summary ─────────────────────────────────────────────

export async function getChargebackSummary() {
  const [total, open, won, lost] = await Promise.all([
    db.chargebackRecord.count(),
    db.chargebackRecord.count({ where: { status: "open" } }),
    db.chargebackRecord.count({ where: { status: "won" } }),
    db.chargebackRecord.count({ where: { status: "lost" } }),
  ]);

  const totalAmount = await db.chargebackRecord.aggregate({
    _sum: { amount: true },
  });

  return {
    total,
    open,
    won,
    lost,
    totalAmountUsd: totalAmount._sum.amount ?? 0,
    winRate: total > 0 ? Math.round((won / total) * 100) : 0,
  };
}
