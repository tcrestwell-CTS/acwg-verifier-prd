-- CreateTable
CREATE TABLE "VerificationFeatureSettings" (
    "id" TEXT NOT NULL,
    "identityIntelligence" BOOLEAN NOT NULL DEFAULT false,
    "propertyOwnership" BOOLEAN NOT NULL DEFAULT false,
    "deviceIntelligence" BOOLEAN NOT NULL DEFAULT false,
    "phoneRiskPlus" BOOLEAN NOT NULL DEFAULT false,
    "otpStepUp" BOOLEAN NOT NULL DEFAULT true,
    "documentRequest" BOOLEAN NOT NULL DEFAULT true,
    "payment3ds" BOOLEAN NOT NULL DEFAULT false,
    "configJson" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL DEFAULT 'system',

    CONSTRAINT "VerificationFeatureSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationFeatureAudit" (
    "id" TEXT NOT NULL,
    "oldValueJson" JSONB NOT NULL,
    "newValueJson" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationFeatureAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationFeatureAudit_createdAt_idx" ON "VerificationFeatureAudit"("createdAt");
