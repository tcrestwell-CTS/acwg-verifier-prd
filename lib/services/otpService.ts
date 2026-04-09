import { createHash } from "crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { writeAuditLog } from "@/lib/audit";
import { flags } from "@/lib/featureFlags";

const OTP_EXPIRY_MINUTES = 10;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
const MAX_ATTEMPTS = 3;
const COOLDOWN_MINUTES = 5;

// ── Provider abstraction ───────────────────────────────────────────────────────

interface OtpProvider {
  send(phone: string, code: string): Promise<void>;
}

class TwilioOtpProvider implements OtpProvider {
  async send(phone: string, code: string): Promise<void> {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (!sid || !token || !from) {
      logger.warn("Twilio OTP not configured — stub mode", { phone });
      return; // no-op stub
    }

    const encoded = Buffer.from(`${sid}:${token}`).toString("base64");
    const body = `Your ACWG verification code is: ${code}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`;

    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${encoded}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: phone, Body: body }),
    });
  }
}

function getProvider(): OtpProvider {
  return new TwilioOtpProvider();
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function initiateOtp(orderId: string, phone: string, actor: string) {
  if (!flags.otpStepUp) {
    return { stubbed: true, message: "OTP step-up is disabled (FEATURE_OTP_STEP_UP=false)" };
  }

  // Check cooldown — block if a recent attempt exists
  const recent = await db.otpAttempt.findFirst({
    where: {
      orderId,
      createdAt: { gte: new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000) },
      status: { not: "expired" },
    },
    orderBy: { createdAt: "desc" },
  });

  if (recent && recent.attempts >= MAX_ATTEMPTS) {
    throw new Error(`OTP rate limit: wait ${COOLDOWN_MINUTES} minutes before retrying`);
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  const codeHash = hashCode(code);

  const attempt = await db.otpAttempt.create({
    data: {
      orderId,
      phone,
      status:   "pending",
      expiresAt,
      codeHash,
    },
  });

  try {
    await getProvider().send(phone, code);
    logger.info("OTP sent", { orderId, attemptId: attempt.id });
  } catch (err) {
    logger.error("OTP send failed", { orderId, error: String(err) });
    throw new Error("Failed to send OTP — please retry");
  }

  await writeAuditLog({
    orderId,
    actor,
    action: "otp:initiated",
    payload: { attemptId: attempt.id, phone: phone.slice(0, -4) + "****" },
  });

  // Return the code only in development for testing
  return {
    attemptId: attempt.id,
    expiresAt,
    ...(process.env.NODE_ENV === "development" ? { _devCode: code } : {}),
  };
}

export async function verifyOtp(attemptId: string, code: string, actor: string) {
  if (!flags.otpStepUp) {
    return { verified: true, stubbed: true };
  }

  const attempt = await db.otpAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new Error("OTP attempt not found");
  if (attempt.status === "verified") throw new Error("Already verified");
  if (attempt.status === "expired" || attempt.expiresAt < new Date()) {
    await db.otpAttempt.update({ where: { id: attemptId }, data: { status: "expired" } });
    throw new Error("OTP has expired");
  }
  if (attempt.attempts >= MAX_ATTEMPTS) {
    await db.otpAttempt.update({ where: { id: attemptId }, data: { status: "failed" } });
    throw new Error("Too many failed attempts");
  }

  // Compare submitted code against stored hash
  const isValid = !!(attempt as { codeHash?: string | null }).codeHash &&
    hashCode(code) === (attempt as { codeHash?: string | null }).codeHash;

  await db.otpAttempt.update({
    where: { id: attemptId },
    data: {
      attempts: { increment: 1 },
      status: isValid ? "verified" : attempt.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending",
      verifiedAt: isValid ? new Date() : null,
    },
  });

  await writeAuditLog({
    orderId: attempt.orderId,
    actor,
    action: isValid ? "otp:verified" : "otp:failed",
    payload: { attemptId, success: isValid },
  });

  return { verified: isValid };
}

export async function getOtpStatus(orderId: string) {
  return db.otpAttempt.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, status: true, attempts: true,
      expiresAt: true, verifiedAt: true, createdAt: true,
      phone: false, // never expose phone in status queries
    },
  });
}
