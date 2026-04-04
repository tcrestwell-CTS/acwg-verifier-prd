import { db } from "@/lib/db";
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
  updatedAt: Date;
  updatedBy: string;
}

type FeatureUpdates = Partial<Omit<FeatureSettings, "id" | "updatedAt" | "updatedBy">>;

const DEFAULTS: FeatureUpdates & { updatedBy: string } = {
  identityIntelligence: false,
  propertyOwnership: false,
  deviceIntelligence: false,
  phoneRiskPlus: false,
  otpStepUp: true,
  documentRequest: true,
  payment3ds: false,
  updatedBy: "system",
};

/** Get the single settings record, creating it with defaults if missing */
export async function getFeatureSettings(): Promise<FeatureSettings> {
  const existing = await db.verificationFeatureSettings.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing as unknown as FeatureSettings;

  const created = await db.verificationFeatureSettings.create({ data: DEFAULTS });
  logger.info("Feature settings initialized with defaults");
  return created as unknown as FeatureSettings;
}

/** Update feature settings with full audit trail */
export async function updateFeatureSettings(
  updates: FeatureUpdates,
  actor: string
): Promise<FeatureSettings> {
  const current = await getFeatureSettings();

  // Strip configJson from updates to avoid Prisma type issues
  const { ...safeUpdates } = updates as Record<string, unknown>;
  delete safeUpdates.configJson;

  const updated = await db.verificationFeatureSettings.update({
    where: { id: current.id },
    data: { ...safeUpdates, updatedBy: actor },
  });

  await db.verificationFeatureAudit.create({
    data: {
      oldValueJson: current as unknown as object,
      newValueJson: updated as unknown as object,
      actorId: actor,
    },
  });

  logger.info("Feature settings updated", { actor, changes: Object.keys(updates) });
  return updated as unknown as FeatureSettings;
}

export async function getFeatureAuditLog(limit = 50) {
  return db.verificationFeatureAudit.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
