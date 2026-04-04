import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { writeAuditLog } from "@/lib/audit";
import { runRiskEngine } from "@/lib/services/riskEngine";
import type { VerificationResult } from "@/lib/schemas";
import type { RulesConfig } from "@/lib/services/rulesService";

// ── Deterministic hash for consistent assignment ──────────────────────────────

function hashOrderId(orderId: string): number {
  let hash = 0;
  for (let i = 0; i < orderId.length; i++) {
    hash = (hash * 31 + orderId.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash) % 100; // 0-99
}

// ── Get active experiment ─────────────────────────────────────────────────────

export async function getActiveExperiment() {
  return db.rulesExperiment.findFirst({
    where: { status: "running" },
    orderBy: { startedAt: "desc" },
  });
}

// ── Assign order to experiment variant ───────────────────────────────────────

export async function assignExperimentVariant(
  experimentId: string,
  orderId: string,
  rolloutPct: number
): Promise<"control" | "treatment"> {
  const existing = await db.experimentAssignment.findFirst({
    where: { experimentId, orderId },
  });
  if (existing) return existing.variant as "control" | "treatment";

  const bucket = hashOrderId(orderId);
  const variant: "control" | "treatment" = bucket < rolloutPct ? "treatment" : "control";

  // Don't await — fire and forget to avoid blocking verify path
  db.experimentAssignment.create({
    data: { experimentId, orderId, variant, rulesVersionId: "" },
  }).catch((err) => logger.error("Experiment assignment failed", { error: String(err) }));

  return variant;
}

// ── Run experiment scoring ────────────────────────────────────────────────────

export async function runWithExperiment(
  orderId: string,
  verification: Omit<VerificationResult, "overall">
) {
  const experiment = await getActiveExperiment();
  if (!experiment) return null;

  const variant = await assignExperimentVariant(
    experiment.id,
    orderId,
    experiment.rolloutPct
  );

  const rulesVersionId =
    variant === "treatment" ? experiment.treatmentId : experiment.controlId;

  const rulesVersion = await db.rulesVersion.findUnique({ where: { id: rulesVersionId } });
  if (!rulesVersion) return null;

  const config = rulesVersion.rules as unknown as RulesConfig;
  const result = runRiskEngine(verification, config);

  // Record experiment metric
  await db.experimentAssignment.updateMany({
    where: { experimentId: experiment.id, orderId },
    data: {
      rulesVersionId,
      score: result.score,
      decision: result.decision,
    },
  });

  logger.info("Experiment assignment", {
    experimentId: experiment.id,
    orderId,
    variant,
    score: result.score,
    decision: result.decision,
  });

  return { variant, score: result.score, decision: result.decision, reasons: result.reasons };
}

// ── Create experiment ─────────────────────────────────────────────────────────

export async function createExperiment(opts: {
  name: string;
  description?: string;
  controlId: string;
  treatmentId: string;
  rolloutPct: number;
  actor: string;
}) {
  if (opts.rolloutPct < 0 || opts.rolloutPct > 100) {
    throw new Error("rolloutPct must be 0-100");
  }

  const experiment = await db.rulesExperiment.create({
    data: {
      name: opts.name,
      description: opts.description ?? null,
      controlId: opts.controlId,
      treatmentId: opts.treatmentId,
      rolloutPct: opts.rolloutPct,
      status: "draft",
      createdBy: opts.actor,
    },
  });

  await writeAuditLog({
    actor: opts.actor,
    action: "experiment:created",
    payload: { experimentId: experiment.id, rolloutPct: opts.rolloutPct },
  });

  return experiment;
}

// ── Start/stop experiment ─────────────────────────────────────────────────────

export async function startExperiment(id: string, actor: string) {
  // Ensure no other experiment is running
  const active = await getActiveExperiment();
  if (active && active.id !== id) {
    throw new Error(`Experiment ${active.id} is already running. End it before starting a new one.`);
  }

  const experiment = await db.rulesExperiment.update({
    where: { id },
    data: { status: "running", startedAt: new Date() },
  });

  await writeAuditLog({
    actor,
    action: "experiment:started",
    payload: { experimentId: id },
  });

  return experiment;
}

export async function endExperiment(id: string, actor: string) {
  const experiment = await db.rulesExperiment.update({
    where: { id },
    data: { status: "completed", endedAt: new Date() },
  });

  await writeAuditLog({
    actor,
    action: "experiment:ended",
    payload: { experimentId: id },
  });

  return experiment;
}

// ── Experiment results summary ────────────────────────────────────────────────

export async function getExperimentResults(id: string) {
  const assignments = await db.experimentAssignment.findMany({
    where: { experimentId: id },
  });

  const control = assignments.filter((a) => a.variant === "control");
  const treatment = assignments.filter((a) => a.variant === "treatment");

  const avgScore = (arr: typeof assignments) =>
    arr.length > 0
      ? Math.round(arr.reduce((s, a) => s + (a.score ?? 0), 0) / arr.length)
      : 0;

  const decisionRate = (arr: typeof assignments, decision: string) =>
    arr.length > 0
      ? Math.round((arr.filter((a) => a.decision === decision).length / arr.length) * 100)
      : 0;

  return {
    experimentId: id,
    totalAssignments: assignments.length,
    control: {
      count: control.length,
      avgScore: avgScore(control),
      approvalRate: decisionRate(control, "approved"),
      denialRate: decisionRate(control, "denied"),
    },
    treatment: {
      count: treatment.length,
      avgScore: avgScore(treatment),
      approvalRate: decisionRate(treatment, "approved"),
      denialRate: decisionRate(treatment, "denied"),
    },
    note: "Suggestions from this data must be manually reviewed before publishing rules changes.",
  };
}
