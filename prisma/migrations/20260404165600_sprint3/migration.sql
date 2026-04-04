-- CreateEnum
CREATE TYPE "RulesStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "DocRequestType" AS ENUM ('government_id', 'proof_of_address', 'bank_statement', 'selfie', 'other');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('pending', 'uploaded', 'reviewing', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "OtpStatus" AS ENUM ('pending', 'verified', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "StepUpStatus" AS ENUM ('initiated', 'challenged', 'authenticated', 'declined', 'failed');

-- CreateEnum
CREATE TYPE "ChargebackStatus" AS ENUM ('open', 'investigating', 'won', 'lost', 'resolved');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'dead_letter');

-- CreateTable
CREATE TABLE "RulesVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "RulesStatus" NOT NULL DEFAULT 'draft',
    "rules" JSONB NOT NULL,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RulesVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "DocRequestType" NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'pending',
    "requestedBy" TEXT NOT NULL,
    "notes" TEXT,
    "uploadUrl" TEXT,
    "fileName" TEXT,
    "reviewedBy" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpAttempt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "OtpStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepUpResult" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "StepUpStatus" NOT NULL DEFAULT 'initiated',
    "acsUrl" TEXT,
    "challengeId" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepUpResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargebackRecord" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "chargebackDate" TIMESTAMP(3) NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "notes" TEXT,
    "status" "ChargebackStatus" NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargebackRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueJob" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RulesVersion_status_idx" ON "RulesVersion"("status");

-- CreateIndex
CREATE INDEX "RulesVersion_version_idx" ON "RulesVersion"("version");

-- CreateIndex
CREATE INDEX "DocumentRequest_orderId_idx" ON "DocumentRequest"("orderId");

-- CreateIndex
CREATE INDEX "DocumentRequest_status_idx" ON "DocumentRequest"("status");

-- CreateIndex
CREATE INDEX "OtpAttempt_orderId_idx" ON "OtpAttempt"("orderId");

-- CreateIndex
CREATE INDEX "StepUpResult_orderId_idx" ON "StepUpResult"("orderId");

-- CreateIndex
CREATE INDEX "ChargebackRecord_orderId_idx" ON "ChargebackRecord"("orderId");

-- CreateIndex
CREATE INDEX "ChargebackRecord_status_idx" ON "ChargebackRecord"("status");

-- CreateIndex
CREATE INDEX "QueueJob_status_idx" ON "QueueJob"("status");

-- CreateIndex
CREATE INDEX "QueueJob_runAt_idx" ON "QueueJob"("runAt");

-- CreateIndex
CREATE INDEX "QueueJob_type_idx" ON "QueueJob"("type");

-- AddForeignKey
ALTER TABLE "DocumentRequest" ADD CONSTRAINT "DocumentRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpAttempt" ADD CONSTRAINT "OtpAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepUpResult" ADD CONSTRAINT "StepUpResult_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargebackRecord" ADD CONSTRAINT "ChargebackRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
