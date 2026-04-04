import { NextRequest, NextResponse } from "next/server";
import { OrderPayloadSchema } from "@/lib/schemas";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { writeAuditLog } from "@/lib/audit";
import { verifyLimiter } from "@/lib/middleware/rateLimit";
import { withRetry } from "@/lib/middleware/withRetry";
import { checkAddress } from "@/lib/integrations/address";
import { checkPhone } from "@/lib/integrations/phone";
import { checkEmail } from "@/lib/integrations/email";
import { checkPayment } from "@/lib/integrations/payment";
import { checkIp } from "@/lib/integrations/ip";
import { runRiskEngine } from "@/lib/services/riskEngine";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  const rateLimitResponse = verifyLimiter(req);
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = OrderPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const order = parsed.data;
  logger.info("Verification started", {
    requestId,
    email: order.contact.email,
    ip: order.context?.ip,
  });

  try {
    // Run all integration checks in parallel with retries
    const [addressResult, phoneResult, emailResult, paymentResult, ipResult] =
      await Promise.all([
        withRetry(
          () => checkAddress(order.shippingAddress as typeof order.billingAddress, order.billingAddress),
          { label: "address-check", attempts: 2 }
        ),
        withRetry(() => checkPhone(order.contact.phone), {
          label: "phone-check",
          attempts: 2,
        }),
        withRetry(() => checkEmail(order.contact.email), {
          label: "email-check",
          attempts: 2,
        }),
        withRetry(
          () => checkPayment(order.paymentMeta),
          { label: "payment-check", attempts: 2 }
        ),
        withRetry(
          () => checkIp(order.context?.ip, order.shippingAddress),
          { label: "ip-check", attempts: 2 }
        ),
      ]);

    // Run deterministic risk engine
    const risk = runRiskEngine({
      address: addressResult,
      phone: phoneResult,
      email: emailResult,
      payment: paymentResult,
      ip: ipResult,
    });

    const overall = {
      score: risk.score,
      decision: risk.decision,
      reasons: risk.reasons,
    };

    // Persist to database
    const dbOrder = await db.order.create({
      data: {
        customerName: `${order.customer.firstName} ${order.customer.lastName}`,
        email: order.contact.email,
        phone: order.contact.phone,
        billingAddress: order.billingAddress as object,
        shippingAddress: order.shippingAddress as object,
        items: order.items as object,
        paymentMeta: {
          cardLast4: order.paymentMeta.cardLast4 ?? null,
          bin: order.paymentMeta.bin ?? null,
          brand: order.paymentMeta.brand ?? null,
        },
        context: {
          ip: order.context?.ip ?? null,
          userAgent: order.context?.userAgent ?? null,
        },
      },
    });

    await db.verificationResult.create({
      data: {
        orderId: dbOrder.id,
        address: addressResult as object,
        phone: phoneResult as object,
        email: emailResult as object,
        payment: paymentResult as object,
        ip: ipResult as object,
        overall: overall as object,
      },
    });

    // Auto-queue if not clean approve
    if (risk.decision !== "approved") {
      await db.decision.create({
        data: {
          orderId: dbOrder.id,
          status: risk.decision === "denied" ? "denied" : "queued",
          reasons: risk.reasons as string[],
          decidedBy: "System Risk Engine",
        },
      });
    }

    await writeAuditLog({
      orderId: dbOrder.id,
      actor: "system",
      action: "verify",
      payload: {
        requestId,
        score: risk.score,
        decision: risk.decision,
        reasonCount: risk.reasons.length,
      },
    });

    logger.info("Verification complete", {
      requestId,
      orderId: dbOrder.id,
      score: risk.score,
      decision: risk.decision,
    });

    return NextResponse.json({
      id: dbOrder.id,
      verification: {
        address: addressResult,
        phone: phoneResult,
        email: emailResult,
        payment: paymentResult,
        ip: ipResult,
        overall,
      },
    });
  } catch (err) {
    logger.error("Verification failed", { requestId, error: String(err) });
    return NextResponse.json(
      { error: "Verification failed — please try again" },
      { status: 500 }
    );
  }
}
