import { db } from "@/lib/db";
import { flags } from "@/lib/featureFlags";
import { logger } from "@/lib/logger";

// ── Decision metrics ──────────────────────────────────────────────────────────

export async function getDecisionMetrics(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [approved, queued, denied, total] = await Promise.all([
    db.decision.count({ where: { status: "approved", decidedAt: { gte: since } } }),
    db.decision.count({ where: { status: "queued", decidedAt: { gte: since } } }),
    db.decision.count({ where: { status: "denied", decidedAt: { gte: since } } }),
    db.decision.count({ where: { decidedAt: { gte: since } } }),
  ]);

  return {
    period: `${days}d`,
    total,
    approved,
    queued,
    denied,
    approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
    denialRate: total > 0 ? Math.round((denied / total) * 100) : 0,
    queueRate: total > 0 ? Math.round((queued / total) * 100) : 0,
  };
}

// ── Queue aging ───────────────────────────────────────────────────────────────

export async function getQueueAgingMetrics() {
  const queued = await db.order.findMany({
    where: {
      decisions: {
        some: { status: "queued" },
        none: { status: { in: ["approved", "denied"] } },
      },
    },
    select: { id: true, createdAt: true },
  });

  const now = Date.now();
  const buckets = { under1h: 0, under4h: 0, under24h: 0, over24h: 0 };

  queued.forEach((o) => {
    const ageMs = now - o.createdAt.getTime();
    if (ageMs < 3_600_000) buckets.under1h++;
    else if (ageMs < 14_400_000) buckets.under4h++;
    else if (ageMs < 86_400_000) buckets.under24h++;
    else buckets.over24h++;
  });

  return { total: queued.length, aging: buckets };
}

// ── Risk score distribution ───────────────────────────────────────────────────

export async function getRiskDistribution(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const verifications = await db.verificationResult.findMany({
    where: { createdAt: { gte: since } },
    select: { overall: true },
  });

  const buckets = { low: 0, medium: 0, high: 0 };
  verifications.forEach((v) => {
    const overall = v.overall as { score?: number };
    const score = overall.score ?? 0;
    if (score <= 25) buckets.low++;
    else if (score <= 60) buckets.medium++;
    else buckets.high++;
  });

  return { period: `${days}d`, total: verifications.length, distribution: buckets };
}

// ── CSV export ────────────────────────────────────────────────────────────────

export async function exportDecisionsCsv(days = 30): Promise<string> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const decisions = await db.decision.findMany({
    where: { decidedAt: { gte: since } },
    include: {
      order: {
        select: {
          id: true, customerName: true, email: true, createdAt: true,
          verification: { select: { overall: true } },
        },
      },
    },
    orderBy: { decidedAt: "desc" },
  });

  const rows = [
    ["Order ID", "Customer", "Email", "Decision", "Risk Score", "Decided By", "Decided At", "Reasons"].join(","),
    ...decisions.map((d) => {
      const overall = d.order.verification?.overall as { score?: number } | null;
      const reasons = (d.reasons as string[]).join("; ").replace(/,/g, " ");
      return [
        d.orderId,
        `"${d.order.customerName}"`,
        d.order.email,
        d.status,
        overall?.score ?? "",
        `"${d.decidedBy}"`,
        d.decidedAt.toISOString(),
        `"${reasons}"`,
      ].join(",");
    }),
  ];

  return rows.join("\n");
}

// ── Alert dispatcher ──────────────────────────────────────────────────────────

export async function sendAlert(opts: {
  type: "high_risk_order" | "aging_queue" | "chargeback";
  message: string;
  data?: Record<string, unknown>;
}) {
  logger.info("Alert triggered", { type: opts.type, message: opts.message });

  if (flags.slackAlerts && process.env.SLACK_WEBHOOK_URL) {
    await sendSlackAlert(opts.message, opts.data);
  }

  if (flags.emailAlerts && process.env.ALERT_EMAIL) {
    logger.info("Email alert stub", { to: process.env.ALERT_EMAIL, message: opts.message });
    // Wire to SendGrid / SES / Resend in production
  }
}

async function sendSlackAlert(message: string, data?: Record<string, unknown>) {
  try {
    await fetch(process.env.SLACK_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🚨 *ACWG Verifier Alert*\n${message}`,
        attachments: data
          ? [{ color: "#cc1111", text: JSON.stringify(data, null, 2) }]
          : [],
      }),
    });
  } catch (err) {
    logger.error("Slack alert failed", { error: String(err) });
  }
}
