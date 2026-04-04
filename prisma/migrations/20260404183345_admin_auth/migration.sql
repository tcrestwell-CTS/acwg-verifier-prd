-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('received', 'processing', 'processed', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('draft', 'running', 'paused', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('reviewer', 'admin', 'superadmin');

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'received',
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformWriteback" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformWriteback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncryptionKeyVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "EncryptionKeyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionRun" (
    "id" TEXT NOT NULL,
    "policy" TEXT NOT NULL,
    "recordsFound" INTEGER NOT NULL,
    "recordsPurged" INTEGER NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "ranBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RulesExperiment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "controlId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "rolloutPct" INTEGER NOT NULL DEFAULT 0,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RulesExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentAssignment" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "rulesVersionId" TEXT NOT NULL,
    "score" INTEGER,
    "decision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'reviewer',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_idempotencyKey_key" ON "WebhookEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WebhookEvent_platform_externalId_idx" ON "WebhookEvent"("platform", "externalId");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_idx" ON "WebhookEvent"("status");

-- CreateIndex
CREATE INDEX "WebhookEvent_idempotencyKey_idx" ON "WebhookEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PlatformWriteback_orderId_idx" ON "PlatformWriteback"("orderId");

-- CreateIndex
CREATE INDEX "PlatformWriteback_status_idx" ON "PlatformWriteback"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptionKeyVersion_version_key" ON "EncryptionKeyVersion"("version");

-- CreateIndex
CREATE INDEX "RulesExperiment_status_idx" ON "RulesExperiment"("status");

-- CreateIndex
CREATE INDEX "ExperimentAssignment_experimentId_idx" ON "ExperimentAssignment"("experimentId");

-- CreateIndex
CREATE INDEX "ExperimentAssignment_orderId_idx" ON "ExperimentAssignment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_email_idx" ON "AdminUser"("email");

-- AddForeignKey
ALTER TABLE "ExperimentAssignment" ADD CONSTRAINT "ExperimentAssignment_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "RulesExperiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
