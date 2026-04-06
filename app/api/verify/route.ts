import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
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
import { checkVelocity } from "@/lib/services/velocityService";
import { getFeatureSettings } from "@/lib/services/settingsService";
import { checkIdentity } from "@/lib/integrations/identity";
import { checkProperty } from "@/lib/integrations/property";
import { checkDevice } from "@/lib/integrations/device";
import { checkPhoneIntel } from "@/lib/integrations/phone-intel";
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
    const shippingAddr = (order.shippingAddress ?? order.billingAddress) as typeof order.billingAddress;
    const billingAddr = order.billingAddress;

    console.log("verify:start", { requestId, email: order.contact.email });

    // ── Stripe AVS/CVV (if card was tokenized in the form) ─────────────────
    const stripePaymentMethodId = order.paymentMeta?.stripePaymentMethodId;
    let stripeAvsResult: { avs: "Y"|"N"|"P"|"U"; cvv: "M"|"N"|"U"; last4?: string; brand?: string } | null = null;

    if (stripePaymentMethodId && process.env.STRIPE_SECRET_KEY) {
      try {
        const stripeParams = new URLSearchParams({
          payment_method: stripePaymentMethodId,
          confirm: "true",
          usage: "off_session",
          "payment_method_types[]": "card",
          "expand[]": "payment_method",
        });
        const stripeRes = await fetch("https://api.stripe.com/v1/setup_intents", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "Stripe-Version": "2023-10-16",
          },
          body: stripeParams,
        });
        const intent = await stripeRes.json() as {
          payment_method?: { card?: { last4?: string; brand?: string; checks?: { address_line1_check?: string|null; address_postal_code_check?: string|null; cvc_check?: string|null } } };
          error?: { message?: string };
        };
        const card = typeof intent.payment_method === "object" ? intent.payment_method?.card : null;
        const checks = card?.checks;
        const avsStreet = checks?.address_line1_check;
        const avsZip = checks?.address_postal_code_check;
        const cvvCheck = checks?.cvc_check;
        const avs = (avsStreet === "pass" && avsZip === "pass") ? "Y"
          : (avsStreet === "pass" || avsZip === "pass") ? "P"
          : (avsStreet === "fail" || avsZip === "fail") ? "N" : "U";
        const cvv = cvvCheck === "pass" ? "M" : cvvCheck === "fail" ? "N" : "U";
        stripeAvsResult = { avs, cvv, last4: card?.last4, brand: card?.brand };
        logger.info("verify:stripe_avs", { avs, cvv });
      } catch (e) {
        logger.error("verify:stripe_avs_failed", { error: String(e) });
      }
    }

    // Run all integration checks in parallel with retries
    const [addressResult, phoneResult, emailResult, paymentResult, ipResult] =
      await Promise.all([
        withRetry(
          () => checkAddress(shippingAddr, order.billingAddress),
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
          () => checkPayment(order.paymentMeta, {
            firstName: order.customer.firstName,
            lastName: order.customer.lastName,
            email: order.contact.email,
            phone: order.contact.phone,
            address: {
              line1: billingAddr.line1,
              city: billingAddr.city,
              state: billingAddr.state,
              postalCode: billingAddr.postalCode,
            },
            orderAmount: order.items.reduce((s: number, i: { qty: number; price: number }) => s + i.qty * i.price, 0),
            ip: order.context?.ip,
          }),
          { label: "payment-check", attempts: 2 }
        ),
        withRetry(
          () => checkIp(order.context?.ip, shippingAddr),
          { label: "ip-check", attempts: 2 }
        ),
      ]);

    console.log("verify:signals_collected", { requestId, score: "pending" });

    // Velocity check
    const velocity = await checkVelocity({
      email: order.contact.email,
      phone: order.contact.phone,
      cardLast4: order.paymentMeta.cardLast4,
      bin: order.paymentMeta.bin,
      shippingAddress: shippingAddr,
      orderTotal: order.items.reduce((sum, i) => sum + i.qty * i.price, 0),
    });

    // Load feature settings and run advanced integrations in parallel
    const featureSettings = await getFeatureSettings();

    const [identityResult, propertyResult, deviceResult, phoneIntelResult] = await Promise.all([
      featureSettings.identityIntelligence
        ? checkIdentity({
            firstName: order.customer.firstName,
            lastName: order.customer.lastName,
            email: order.contact.email,
            phone: order.contact.phone,
            billingAddress: billingAddr,
          }).catch((e) => { logger.error("identity check failed", { error: String(e) }); return null; })
        : Promise.resolve(null),

      featureSettings.propertyOwnership
        ? checkProperty({
            line1: billingAddr.line1,
            city: billingAddr.city,
            state: billingAddr.state,
            postalCode: billingAddr.postalCode,
            submittedName: `${order.customer.firstName} ${order.customer.lastName}`,
          }).catch((e) => { logger.error("property check failed", { error: String(e) }); return null; })
        : Promise.resolve(null),

      featureSettings.deviceIntelligence
        ? checkDevice({
            ip: order.context?.ip ?? "",
            userAgent: order.context?.userAgent,
          }).catch((e) => { logger.error("device check failed", { error: String(e) }); return null; })
        : Promise.resolve(null),

      featureSettings.phoneRiskPlus
        ? checkPhoneIntel({
            phone: order.contact.phone,
            submittedName: `${order.customer.firstName} ${order.customer.lastName}`,
          }).catch((e) => { logger.error("phone intel check failed", { error: String(e) }); return null; })
        : Promise.resolve(null),
    ]);

    // Run deterministic risk engine
    const risk = runRiskEngine(
      {
        address: addressResult,
        phone: phoneResult,
        email: emailResult,
        payment: paymentResult,
        ip: ipResult,
      },
      undefined, // use default rules config
      velocity,
      shippingAddr
    );

    // Merge Stripe AVS/CVV into payment result if available
    if (stripeAvsResult) {
      paymentResult = {
        ...paymentResult,
        avs: stripeAvsResult.avs,
        cvv: stripeAvsResult.cvv,
        ...(stripeAvsResult.last4 ? { cardLast4: stripeAvsResult.last4 } : {}),
        ...(stripeAvsResult.brand ? { brand: stripeAvsResult.brand } : {}),
        reasons: [
          ...(paymentResult.reasons ?? []).filter(r => !r.includes("AVS") && !r.includes("CVV")),
          stripeAvsResult.avs === "Y" ? "✓ AVS full match — billing address confirmed by card issuer" :
          stripeAvsResult.avs === "N" ? "AVS mismatch — billing address does not match card issuer records" :
          stripeAvsResult.avs === "P" ? "AVS partial match — ZIP matched but street address did not" :
          "AVS unavailable",
          stripeAvsResult.cvv === "M" ? "✓ CVV matched" :
          stripeAvsResult.cvv === "N" ? "CVV mismatch — security code rejected" : "CVV not verified",
        ],
      };
    }

    const overall = {
      score: risk.score,
      decision: risk.decision,
      reasons: risk.reasons,
      hardStop: risk.hardStop,
      requiresOtp: risk.requiresOtp,
      requiresDocVerification: risk.requiresDocVerification,
      velocity: {
        isReturningCustomer: velocity.isReturningCustomer,
        priorOrderCount: velocity.priorOrderCount,
        cardOrderCount24h: velocity.cardOrderCount24h,
      },
    };

    console.log("verify:risk_computed", { requestId, score: risk.score, decision: risk.decision });

    // Persist to database
    console.log("verify:db_write_start", { requestId });
    const dbOrder = await db.order.create({
      data: {
        customerName: `${order.customer.firstName} ${order.customer.lastName}`,
        email: order.contact.email,
        phone: order.contact.phone,
        billingAddress: order.billingAddress as object,
        shippingAddress: shippingAddr as object,
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

    console.log("verify:db_order_created", { requestId, orderId: dbOrder.id });

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
        ...(identityResult  ? { identity: identityResult }    : {}),
        ...(propertyResult  ? { property: propertyResult }    : {}),
        ...(deviceResult    ? { device: deviceResult }        : {}),
        ...(phoneIntelResult ? { phoneIntel: phoneIntelResult } : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Verification failed", { requestId, error: message });

    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid request payload", issues: err.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

