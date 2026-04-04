import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import type { OrderPayload, VerificationResult } from "@/lib/schemas";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

function buildRepPrompt(
  order: OrderPayload,
  verification: VerificationResult
): string {
  const { overall, address, phone, email, payment, ip } = verification;
  const signals = overall.reasons.join("\n- ");

  return `You are a fraud analysis assistant for a travel agency. Summarize the following order verification results for an internal sales rep.

Order: ${order.customer.firstName} ${order.customer.lastName}, ${order.items.map((i) => i.name).join(", ")}
Risk Score: ${overall.score}/100 | Decision: ${overall.decision.toUpperCase()}

Verification signals:
- ${signals || "No risk signals detected"}

Address: DPV=${address.dpv}, deliverable=${address.deliverable}${address.distanceKm ? `, billing/shipping distance=${Math.round(address.distanceKm)}km` : ""}
Phone: type=${phone.type ?? "unknown"}, active=${phone.active ?? "unknown"}
Email: disposable=${email.disposable ?? false}, mxValid=${email.mxValid ?? "unknown"}
Payment: AVS=${payment.avs ?? "U"}, CVV=${payment.cvv ?? "U"}, binType=${payment.binType ?? "unknown"}
IP: country=${ip.country ?? "unknown"}, proxy=${ip.proxy ?? false}

Provide a concise bullet-point summary (4-6 bullets max) explaining the key risk findings to the rep. Use plain English. Do not repeat raw field values — explain what they mean in practical terms. Do not make the final decision — that is the rep's job.`;
}

function buildCustomerPrompt(
  order: OrderPayload,
  verification: VerificationResult
): string {
  const firstName = order.customer.firstName;
  const decision = verification.overall.decision;

  return `You are a customer service agent for a travel agency called Crestwell Getaways. Write a brief, polite email to a customer named ${firstName} regarding their order.

Decision: ${decision}

Rules:
- Do NOT mention fraud, fraud detection, or risk scores
- Do NOT accuse the customer of wrongdoing
- Keep it under 100 words
- ${decision === "approved" ? "Confirm the order and express excitement about their trip" : decision === "queued" ? "Let them know their booking is being reviewed and give a 1 business day timeline. Offer a phone number to call" : "Politely explain we could not process the order and ask them to contact us to resolve it"}
- Sign off as 'The Crestwell Getaways Team'

Write only the email body, no subject line.`;
}

function deterministicRepFallback(verification: VerificationResult): string {
  const { score, decision, reasons } = verification.overall;
  const bullets =
    reasons.length > 0
      ? reasons.map((r) => `• ${r}`).join("\n")
      : "• No significant risk signals detected — order appears clean";

  return [
    `Risk Score: ${score}/100 — ${decision.toUpperCase()}`,
    "",
    "Key findings:",
    bullets,
    "",
    `Recommendation: ${
      decision === "approved"
        ? "All signals within acceptable thresholds. Safe to process."
        : decision === "queued"
        ? "One or more signals require human verification before charging."
        : "Multiple high-risk signals detected. Do not process without customer identity verification."
    }`,
  ].join("\n");
}

function deterministicCustomerFallback(
  order: OrderPayload,
  decision: string
): string {
  const name = order.customer.firstName;
  if (decision === "approved") {
    return `Hi ${name},\n\nThank you for choosing Crestwell Getaways! Your reservation is confirmed and you'll receive a full confirmation shortly. We can't wait to help you plan an incredible trip!\n\nThe Crestwell Getaways Team`;
  }
  if (decision === "queued") {
    return `Hi ${name},\n\nThank you for your booking! We're completing a quick review step before finalizing your reservation — this typically takes less than one business day. Feel free to reach us at (800) 555-0100 if you'd like to speak with someone sooner.\n\nThe Crestwell Getaways Team`;
  }
  return `Hi ${name},\n\nThank you for your interest in Crestwell Getaways. Unfortunately we were unable to complete your booking as submitted. Please contact our team at (800) 555-0100 or visit us so we can help you complete your reservation.\n\nThe Crestwell Getaways Team`;
}

export async function generateRepExplanation(
  order: OrderPayload,
  verification: VerificationResult
): Promise<string> {
  const ai = getClient();
  if (!ai) {
    logger.info("ANTHROPIC_API_KEY not set — using deterministic fallback for rep explanation");
    return deterministicRepFallback(verification);
  }

  try {
    const response = await ai.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      messages: [{ role: "user", content: buildRepPrompt(order, verification) }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    logger.info("Claude rep explanation generated", { orderId: verification.overall.decision });
    return text;
  } catch (err) {
    logger.error("Claude rep explanation failed", { error: String(err) });
    return deterministicRepFallback(verification);
  }
}

export async function generateCustomerMessage(
  order: OrderPayload,
  verification: VerificationResult
): Promise<string> {
  const ai = getClient();
  if (!ai) {
    logger.info("ANTHROPIC_API_KEY not set — using deterministic fallback for customer message");
    return deterministicCustomerFallback(order, verification.overall.decision);
  }

  try {
    const response = await ai.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      messages: [{ role: "user", content: buildCustomerPrompt(order, verification) }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    return text;
  } catch (err) {
    logger.error("Claude customer message failed", { error: String(err) });
    return deterministicCustomerFallback(order, verification.overall.decision);
  }
}
