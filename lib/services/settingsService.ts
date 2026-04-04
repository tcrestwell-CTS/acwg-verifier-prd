import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

export interface FeatureSettings {
  id: string;
  identityIntelligence: boolean;
  propertyOwnership: boolean;
  deviceIntelligence: boolean;
  phoneRiskPlus: boolean;
  otpStepUp: boolean;
  documentRequest: boolean;
  payment3ds: boolean;
  configJson: Record<string, unknown> | null;
  updatedAt: Date;
  updatedBy: string;
}

const DEFAULTS = {
  identityIntelligence: false,
  propertyOwnership: false,
  deviceIntelligence: false,
  phoneRiskPlus: false,
  otpStepUp: true,
  documentRequest: true,
  payment3ds: false,
  configJson: Prisma.JsonNull as unknown,
  updatedBy: "system",
};

/** Get the single settings record, creating it with defaults if missing */
export async function getFeatureSettings(): Promise<FeatureSettings> {
  const existing = await db.verificationFeatureSettings.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing as FeatureSettings;

  // Seed defaults on first access
  const created = await db.verificationFeatureSettings.create({ data: DEFAULTS });
  logger.info("Feature settings initialized with defaults");
  return created as FeatureSettings;
}

/** Update feature settings with full audit trail */
export async function updateFeatureSettings(
  updates: Partial<Omit<FeatureSettings, "id" | "updatedAt">>,
  actor: string
): Promise<FeatureSettings> {
  const current = await getFeatureSettings();

  const updated = await db.verificationFeatureSettings.update({
    where: { id: current.id },
    data: { ...updates, updatedBy: actor },
  });

  // Write audit record
  await db.verificationFeatureAudit.create({
    data: {
      oldValueJson: current as unknown as object,
      newValueJson: updated as unknown as object,
      actorId: actor,
    },
  });

  logger.info("Feature settings updated", { actor, changes: Object.keys(updates) });
  return updated as FeatureSettings;
}

export async function getFeatureAuditLog(limit = 50) {
  return db.verificationFeatureAudit.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
