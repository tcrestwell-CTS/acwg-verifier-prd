import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { writeAuditLog } from "@/lib/audit";

type RetentionPolicy = "90d" | "180d" | "365d";

const POLICY_DAYS: Record<RetentionPolicy, number> = {
  "90d": 90,
  "180d": 180,
  "365d": 365,
};

export async function runRetentionJob(opts: {
  policy: RetentionPolicy;
  dryRun: boolean;
  actor: string;
}) {
  const days = POLICY_DAYS[opts.policy];
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  logger.info("Retention job starting", { policy: opts.policy, cutoff, dryRun: opts.dryRun });

  // Find orders older than cutoff that have been decided (not in limbo)
  const eligibleOrders = await db.order.findMany({
    where: {
      createdAt: { lt: cutoff },
      decisions: {
        some: { status: { in: ["approved", "denied"] } },
      },
    },
    select: { id: true, createdAt: true, email: true },
  });

  const recordsFound = eligibleOrders.length;
  let recordsPurged = 0;

  if (!opts.dryRun && recordsFound > 0) {
    // Purge in batches of 100
    for (let i = 0; i < eligibleOrders.length; i += 100) {
      const batch = eligibleOrders.slice(i, i + 100);
      const ids = batch.map((o) => o.id);

      await db.auditLog.deleteMany({ where: { orderId: { in: ids } } });
      await db.decision.deleteMany({ where: { orderId: { in: ids } } });
      await db.verificationResult.deleteMany({ where: { orderId: { in: ids } } });
      await db.order.deleteMany({ where: { id: { in: ids } } });

      recordsPurged += batch.length;
      logger.info("Retention batch purged", { batch: i / 100 + 1, count: batch.length });
    }
  }

  // Record the run
  const run = await db.retentionRun.create({
    data: {
      policy: opts.policy,
      recordsFound,
      recordsPurged,
      dryRun: opts.dryRun,
      ranBy: opts.actor,
    },
  });

  await writeAuditLog({
    actor: opts.actor,
    action: "retention:run",
    payload: {
      retentionRunId: run.id,
      policy: opts.policy,
      cutoff: cutoff.toISOString(),
      recordsFound,
      recordsPurged,
      dryRun: opts.dryRun,
    },
  });

  logger.info("Retention job complete", {
    runId: run.id, policy: opts.policy, recordsFound, recordsPurged, dryRun: opts.dryRun,
  });

  return { runId: run.id, recordsFound, recordsPurged, dryRun: opts.dryRun };
}

export async function listRetentionRuns(limit = 20) {
  return db.retentionRun.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
