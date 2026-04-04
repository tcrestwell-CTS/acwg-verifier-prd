import rulesConfig from "@/config/risk-rules.json";
import type { VerificationResult } from "@/lib/schemas";

export interface RiskResult {
  score: number;
  decision: "approved" | "queued" | "denied";
  reasons: string[];
  components: {
    address: number;
    phone: number;
    email: number;
    payment: number;
    ip: number;
  };
}

const { thresholds } = rulesConfig;

export function runRiskEngine(v: Omit<VerificationResult, "overall">): RiskResult {
  const reasons: string[] = [];
  const components = { address: 0, phone: 0, email: 0, payment: 0, ip: 0 };

  // ── Address ──────────────────────────────────────────────────────────────
  if (v.address.dpv !== "Y") {
    components.address += 20;
    reasons.push("Address not fully deliverable (DPV non-Y)");
  }
  if (v.address.apartmentNeeded) {
    components.address += 5;
    reasons.push("Apartment or unit number missing from address");
  }
  if (v.address.distanceKm !== undefined && v.address.distanceKm > 500) {
    components.address += 15;
    reasons.push(
      `Billing/shipping addresses are ${Math.round(v.address.distanceKm).toLocaleString()} km apart`
    );
  }

  // ── Phone ─────────────────────────────────────────────────────────────────
  if (v.phone.type === "voip") {
    components.phone += 10;
    reasons.push("Phone number is VoIP — harder to verify ownership");
  }
  if (v.phone.active === false) {
    components.phone += 10;
    reasons.push("Phone number appears inactive or disconnected");
  }
  if (v.phone.riskScore !== undefined && v.phone.riskScore > 70) {
    components.phone += 10;
    reasons.push(`Phone carrier risk score elevated (${v.phone.riskScore}/100)`);
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  if (v.email.disposable === true) {
    components.email += 15;
    reasons.push("Email address uses a disposable/throwaway domain");
  }
  if (v.email.mxValid === false) {
    components.email += 10;
    reasons.push("Email domain has no valid MX records");
  }
  if (v.email.domainRisk === "high") {
    components.email += 10;
    reasons.push("Email domain flagged as high risk");
  }

  // ── Payment ───────────────────────────────────────────────────────────────
  if (v.payment.avs === "N" || v.payment.avs === "U") {
    components.payment += 25;
    reasons.push(
      `AVS mismatch (${v.payment.avs}) — billing address doesn't match card records`
    );
  }
  if (v.payment.cvv === "N" || v.payment.cvv === "U") {
    components.payment += 10;
    reasons.push(`CVV check failed (${v.payment.cvv})`);
  }
  if (v.payment.binType === "prepaid") {
    components.payment += 10;
    reasons.push("Card BIN indicates a prepaid card — higher chargeback risk");
  }

  // ── IP ────────────────────────────────────────────────────────────────────
  if (v.ip.proxy || v.ip.vpn) {
    components.ip += 15;
    reasons.push(
      `IP address routes through a ${v.ip.vpn ? "VPN" : "proxy"} — location masked`
    );
  }
  if (v.ip.distanceToShipKm !== undefined && v.ip.distanceToShipKm > 800) {
    components.ip += 10;
    reasons.push(
      `IP geolocation is ${Math.round(v.ip.distanceToShipKm).toLocaleString()} km from shipping address`
    );
  }

  const score = Math.min(
    100,
    components.address +
      components.phone +
      components.email +
      components.payment +
      components.ip
  );

  const decision: "approved" | "queued" | "denied" =
    score <= thresholds.approved
      ? "approved"
      : score <= thresholds.queued
      ? "queued"
      : "denied";

  return { score, decision, reasons, components };
}
