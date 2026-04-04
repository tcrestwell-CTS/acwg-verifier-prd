import { http, HttpResponse } from "msw";
import type { OrderPayload, VerificationResult, Decision } from "@/lib/schemas";
import { computeRisk } from "@/lib/risk";
import { MOCK_ORDERS } from "./fixtures";
import type { OrderRecord } from "@/lib/schemas";

// In-memory store
const orderStore: Map<string, OrderRecord> = new Map(
  MOCK_ORDERS.map((o) => [o.id, { ...o, history: [...o.history] }])
);

let orderCounter = 4;

function generateVerification(order: OrderPayload): VerificationResult {
  const reasons: VerificationResult["address"]["reasons"] = [];

  // Address check
  const billing = order.billingAddress;
  const shipping = order.shippingAddress;
  const sameCity =
    (shipping.city ?? "").toLowerCase() === billing.city.toLowerCase() &&
    (shipping.state ?? "") === billing.state;
  const distanceKm = sameCity ? 0 : Math.floor(Math.random() * 3500);
  const dpv: "Y" | "N" | "S" | "D" | "U" =
    (shipping.line1 ?? "").toLowerCase().includes("fake") ? "N" : "Y";

  if (dpv !== "Y") reasons.push("Address not found in delivery database");
  if (distanceKm > 500)
    reasons.push(
      `Billing and shipping are ${distanceKm} km apart`
    );

  const email = order.contact.email;
  const disposableDomains = ["tempmail.io", "mailinator.com", "guerrillamail.com", "10minutemail.com"];
  const emailDomain = email.split("@")[1] ?? "";
  const isDisposable = disposableDomains.some((d) => emailDomain.includes(d));

  const phone = order.contact.phone;
  const isVoip = phone.startsWith("+1800") || phone.startsWith("+1888");

  const ip = order.context?.ip ?? "";
  const isProxy = ip.startsWith("185.") || ip.startsWith("104.");

  const payment = order.paymentMeta;
  const avsResult: "Y" | "N" | "P" | "U" =
    !payment.cardLast4 ? "U" : distanceKm > 500 ? "P" : "Y";
  const cvvResult: "M" | "N" | "U" = !payment.cardLast4 ? "U" : "M";

  const verification: VerificationResult = {
    address: {
      dpv,
      deliverable: dpv === "Y",
      residential: true,
      distanceKm,
      normalized:
        dpv === "Y"
          ? {
              line1: (shipping.line1 ?? "").toUpperCase(),
              city: (shipping.city ?? "").toUpperCase(),
              state: (shipping.state ?? "").toUpperCase(),
              postalCode: (shipping.postalCode ?? ""),
              country: (shipping.country ?? "US") ?? "US",
            }
          : undefined,
      reasons,
    },
    phone: {
      type: isVoip ? "voip" : "mobile",
      active: !isVoip,
      carrier: isVoip ? undefined : "AT&T",
      riskScore: isVoip ? 85 : 15,
      e164: phone,
      reasons: isVoip
        ? ["VoIP number detected", "Cannot verify active subscriber"]
        : ["Active mobile number confirmed"],
    },
    email: {
      disposable: isDisposable,
      mxValid: !isDisposable,
      domainRisk: isDisposable ? "high" : "low",
      reasons: isDisposable
        ? ["Disposable email domain", "No valid MX records"]
        : ["Domain has valid MX records"],
    },
    payment: {
      avs: avsResult,
      cvv: cvvResult,
      binCountry: "US",
      binType: "credit",
      reasons: [
        `AVS: ${avsResult === "Y" ? "Full match" : avsResult === "P" ? "Partial match" : "No match"}`,
        `CVV: ${cvvResult === "M" ? "Match" : "Not provided"}`,
      ],
    },
    ip: {
      country: isProxy ? "NL" : "US",
      proxy: isProxy,
      vpn: false,
      distanceToShipKm: isProxy ? 8000 : 20,
      reasons: isProxy
        ? ["IP routes through known proxy", "Geolocation: Netherlands"]
        : ["IP consistent with shipping region"],
    },
    overall: { score: 0, decision: "approved", reasons: [] },
  };

  const risk = computeRisk(verification);
  verification.overall = {
    score: risk.score,
    decision: risk.decision,
    reasons: risk.reasons,
  };

  return verification;
}

export const handlers = [
  // POST /api/verify
  http.post("/api/verify", async ({ request }) => {
    const body = (await request.json()) as OrderPayload;
    await new Promise((r) => setTimeout(r, 900)); // simulate latency
    const verification = generateVerification(body);

    const id = `ord_${String(orderCounter++).padStart(3, "0")}`;
    const record: OrderRecord = {
      id,
      createdAt: new Date().toISOString(),
      currentStatus: verification.overall.decision,
      order: body,
      verification,
      history: [],
    };
    orderStore.set(id, record);

    return HttpResponse.json({ id, verification });
  }),

  // POST /api/decision
  http.post("/api/decision", async ({ request }) => {
    const body = (await request.json()) as { orderId: string } & Decision;
    await new Promise((r) => setTimeout(r, 400));
    const record = orderStore.get(body.orderId);
    if (record) {
      record.currentStatus = body.status;
      record.history.push({
        status: body.status,
        reasons: body.reasons,
        notes: body.notes,
        decidedBy: body.decidedBy,
        decidedAt: body.decidedAt,
      });
    }
    return HttpResponse.json({ ok: true });
  }),

  // GET /api/orders
  http.get("/api/orders", ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    let orders = Array.from(orderStore.values());
    if (status) {
      orders = orders.filter((o) => o.currentStatus === status);
    }
    return HttpResponse.json(orders);
  }),

  // GET /api/orders/:id
  http.get("/api/orders/:id", ({ params }) => {
    const record = orderStore.get(params.id as string);
    if (!record) return HttpResponse.json({ error: "Not found" }, { status: 404 });
    return HttpResponse.json(record);
  }),

  // POST /api/ai/explain — mock Claude rep explanation
  http.post("/api/ai/explain", async ({ request }) => {
    await new Promise((r) => setTimeout(r, 1200));
    const body = (await request.json()) as {
      input: { verification: VerificationResult };
    };
    const { overall } = body.input.verification;
    const bullets = overall.reasons.length
      ? overall.reasons.map((r) => `• ${r}`).join("\n")
      : "• No significant risk signals detected — order appears clean.";

    const text = `Risk Score: ${overall.score}/100 (${overall.decision.toUpperCase()})\n\n` +
      `Key findings:\n${bullets}\n\n` +
      `Recommended action: ${
        overall.decision === "approved"
          ? "Proceed with processing. All signals are within acceptable thresholds."
          : overall.decision === "queued"
          ? "Hold for manual review. One or more signals require human verification before charging."
          : "Do not process. Multiple high-risk signals detected. Request alternate payment method or contact customer via verified channel."
      }`;

    return HttpResponse.json({ text });
  }),

  // POST /api/ai/message — mock Claude customer message
  http.post("/api/ai/message", async ({ request }) => {
    await new Promise((r) => setTimeout(r, 1200));
    const body = (await request.json()) as {
      input: { order: OrderPayload; verification: VerificationResult };
    };
    const firstName = body.input.order.customer.firstName;
    const decision = body.input.verification.overall.decision;

    let text = "";
    if (decision === "approved") {
      text = `Hi ${firstName},\n\nThank you for your order! We've completed our standard verification and everything looks great. Your reservation is confirmed and you'll receive a full confirmation shortly.\n\nWe're excited to help you plan an incredible trip!`;
    } else if (decision === "queued") {
      text = `Hi ${firstName},\n\nThank you for choosing us! We're completing a quick verification step on your order before processing. This is a routine security measure and typically takes less than one business day.\n\nIf you'd like to speed things up, you're welcome to call us directly at (800) 555-0100 to verify your information. We appreciate your patience!`;
    } else {
      text = `Hi ${firstName},\n\nThank you for your interest. Unfortunately, we were unable to complete your order as submitted. This can happen for a variety of security reasons.\n\nWe'd love to assist you — please contact our team at (800) 555-0100 or visit us in person so we can help you complete your booking with an alternate payment method.`;
    }

    return HttpResponse.json({ text });
  }),
];
