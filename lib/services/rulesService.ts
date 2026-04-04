import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { writeAuditLog } from "@/lib/audit";
import { runRiskEngine } from "@/lib/services/riskEngine";
import type { VerificationResult } from "@/lib/schemas";
import defaultRules from "@/config/risk-rules.json";

export interface RulesConfig {
  thresholds: { approved: number; queued: number };
  rules: Array<{
    id: string;
    description: string;
    points: number;
    distanceThresholdKm?: number;
    riskScoreThreshold?: number;
  }>;
}

// ── Get current published rules ───────────────────────────────────────────────

export async function getPublishedRules(): Promise<RulesConfig> {
  const published = await db.rulesVersion.findFirst({
    where: { status: "published" },
    orderBy: { version: "desc" },
  });
  if (!published) return defaultRules as RulesConfig;
  return published.rules as unknown as RulesConfig;
}

// ── List all versions ─────────────────────────────────────────────────────────

export async function listRulesVersions() {
  return db.rulesVersion.findMany({
    orderBy: { version: "desc" },
    select: {
      id: true, version: true, status: true, description: true,
      createdBy: true, publishedBy: true, publishedAt: true, createdAt: true,
    },
  });
}

// ── Get single version ────────────────────────────────────────────────────────

export async function getRulesVersion(id: string) {
  return db.rulesVersion.findUnique({ where: { id } });
}

// ── Create draft ──────────────────────────────────────────────────────────────

export async function createDraftRules(opts: {
  rules: RulesConfig;
  description?: string;
  actor: string;
}) {
  const latest = await db.rulesVersion.findFirst({ orderBy: { version: "desc" } });
  const nextVersion = (latest?.version ?? 0) + 1;

  const draft = await db.rulesVersion.create({
    data: {
      version: nextVersion,
      status: "draft",
      rules: opts.rules as object,
      description: opts.description ?? null,
      createdBy: opts.actor,
    },
  });

  await writeAuditLog({
    actor: opts.actor,
    action: "rules:draft_created",
    payload: { rulesVersionId: draft.id, version: nextVersion },
  });

  logger.info("Rules draft created", { rulesVersionId: draft.id, version: nextVersion });
  return draft;
}

// ── Publish a draft ───────────────────────────────────────────────────────────

export async function publishRulesVersion(id: string, actor: string) {
  // Archive existing published version
  await db.rulesVersion.updateMany({
    where: { status: "published" },
    data: { status: "archived" },
  });

  const published = await db.rulesVersion.update({
    where: { id },
    data: { status: "published", publishedBy: actor, publishedAt: new Date() },
  });

  await writeAuditLog({
    actor,
    action: "rules:published",
    payload: { rulesVersionId: id, version: published.version },
  });

  logger.info("Rules published", { rulesVersionId: id, version: published.version, actor });
  return published;
}

// ── Rollback to a prior version ───────────────────────────────────────────────

export async function rollbackRules(id: string, actor: string) {
  const target = await db.rulesVersion.findUnique({ where: { id } });
  if (!target) throw new Error("Rules version not found");

  // Create a new draft from the target version's rules
  const draft = await createDraftRules({
    rules: target.rules as RulesConfig,
    description: `Rollback to v${target.version}`,
    actor,
  });

  // Auto-publish it
  return publishRulesVersion(draft.id, actor);
}

// ── Preview: run sample payload against draft rules ───────────────────────────

export async function previewRules(opts: {
  rulesVersionId: string;
  sampleVerification: Omit<VerificationResult, "overall">;
}) {
  const version = await db.rulesVersion.findUnique({ where: { id: opts.rulesVersionId } });
  if (!version) throw new Error("Rules version not found");

  // Run risk engine with the draft rules' thresholds
  const rulesConfig = version.rules as unknown as RulesConfig;
  const result = runRiskEngine(opts.sampleVerification, rulesConfig);

  return {
    version: version.version,
    status: version.status,
    score: result.score,
    decision: result.decision,
    reasons: result.reasons,
    components: result.components,
  };
}
