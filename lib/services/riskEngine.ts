import defaultRulesConfig from "@/config/risk-rules.json";
import type { VerificationResult } from "@/lib/schemas";
import type { RulesConfig } from "@/lib/services/rulesService";
import type { VelocityResult } from "@/lib/services/velocityService";

export interface RiskResult {
  score: number;
  decision: "approved" | "queued" | "denied";
  reasons: string[];
  hardStop: boolean;          // hard stops bypass scoring thresholds
  hardStopReason?: string;
  requiresOtp: boolean;       // step-up requirements
  requiresDocVerification: boolean;
  components: {
    address: number;
    phone: number;
    email: number;
    payment: number;
    ip: number;
    velocity: number;
    positive: number;
  };
}

// ── Distance bucket logic (better than raw km) ─────────────────────────────

function addressDistanceScore(distanceKm: number): { points: number; reason: string | null } {
  if (distanceKm === 0)       return { points: 0, reason: null };
  if (distanceKm <= 80)       return { points: 0, reason: null };               // same metro area
  if (distanceKm <= 400)      return { points: 5, reason: "Billing/shipping in different regions" };
  if (distanceKm <= 800)      return { points: 15, reason: `Billing/shipping ~${Math.round(distanceKm)} km apart` };
  return { points: 25, reason: `Billing/shipping ${Math.round(distanceKm).toLocaleString()} km apart — cross-region` };
}

// ── Known high-risk shipping patterns ─────────────────────────────────────

function isHighRiskShippingAddress(address: { line1?: string; city?: string }): boolean {
  const line = (address.line1 ?? "").toLowerCase();
  const city = (address.city ?? "").toLowerCase();

  const freightForwarders = [
    "freight", "forwarding", "shipping co", "mailbox", "mail stop",
    "ups store", "fedex office", "parcel", "storage",
  ];

  return freightForwarders.some((kw) => line.includes(kw) || city.includes(kw));
}

export function runRiskEngine(
  v: Omit<VerificationResult, "overall">,
  config?: RulesConfig,
  velocity?: VelocityResult,
  shippingAddressRaw?: { line1?: string; city?: string }
): RiskResult {
  const { thresholds } = config ?? defaultRulesConfig;
  const reasons: string[] = [];
  const components = {
    address: 0, phone: 0, email: 0,
    payment: 0, ip: 0, velocity: 0, positive: 0,
  };

  let hardStop = false;
  let hardStopReason: string | undefined;
  let requiresOtp = false;
  let requiresDocVerification = false;

  // ── Hard stops (bypass scoring — immediate deny) ────────────────────────

  // AVS=N AND shipping ≠ billing → hard stop for phone orders
  if (
    v.payment.avs === "N" &&
    v.address.distanceKm !== undefined &&
    v.address.distanceKm > 50
  ) {
    hardStop = true;
    hardStopReason = "AVS mismatch with non-local shipping address — high fraud indicator";
    reasons.push(hardStopReason);
  }

  // CVV=N → hard stop
  if (v.payment.cvv === "N") {
    hardStop = true;
    hardStopReason = hardStopReason
      ? hardStopReason + "; CVV mismatch"
      : "CVV mismatch — card security code failed";
    reasons.push("CVV check failed — do not process");
  }

  // Prior fraud history → hard stop
  if (velocity && velocity.priorFraudCount > 0) {
    hardStop = true;
    hardStopReason = `Customer has ${velocity.priorFraudCount} previously denied order(s)`;
    reasons.push(hardStopReason);
  }

  // ── Address checks ──────────────────────────────────────────────────────

  if (v.address.dpv !== "Y") {
    components.address += 20;
    reasons.push("Address not fully deliverable (DPV non-Y)");
  }
  if (v.address.apartmentNeeded) {
    components.address += 5;
    reasons.push("Apartment or unit number appears missing from address");
  }

  // Improved distance scoring
  const dist = v.address.distanceKm ?? 0;
  const distResult = addressDistanceScore(dist);
  if (distResult.points > 0 && distResult.reason) {
    components.address += distResult.points;
    reasons.push(distResult.reason);
  }

  // High-risk shipping address check
  if (shippingAddressRaw && isHighRiskShippingAddress(shippingAddressRaw)) {
    components.address += 25;
    reasons.push("Shipping address matches known freight forwarder or mailbox pattern");
  }

  // ── Phone checks ────────────────────────────────────────────────────────

  if (v.phone.type === "voip") {
    components.phone += 10;
    reasons.push("Phone number is VoIP — harder to verify ownership");
    requiresOtp = true; // VoIP always requires OTP
    requiresDocVerification = dist > 100; // + doc if cross-region
  }
  if (v.phone.active === false) {
    components.phone += 10;
    reasons.push("Phone number appears inactive or disconnected");
  }
  if (v.phone.riskScore !== undefined && v.phone.riskScore > 70) {
    components.phone += 10;
    reasons.push(`Phone carrier risk score elevated (${v.phone.riskScore}/100)`);
  }

  // ── Email checks ────────────────────────────────────────────────────────

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

  // ── Payment checks ──────────────────────────────────────────────────────

  if (v.payment.avs === "N" || v.payment.avs === "U") {
    components.payment += 25;
    reasons.push(`AVS ${v.payment.avs === "N" ? "mismatch" : "unavailable"} — billing address not confirmed`);
  } else if (v.payment.avs === "P") {
    components.payment += 10;
    reasons.push("AVS partial match — ZIP matched but street address did not");
  }
  if (v.payment.cvv === "U") {
    components.payment += 5; // already hard-stopped if N
    reasons.push("CVV unavailable");
  }
  if (v.payment.binType === "prepaid") {
    components.payment += 10;
    reasons.push("Card BIN indicates a prepaid card — higher chargeback risk");
  }

  // ── IP checks ───────────────────────────────────────────────────────────

  if (v.ip.proxy || v.ip.vpn) {
    components.ip += 15;
    reasons.push(`IP address routes through a ${v.ip.vpn ? "VPN" : "proxy"} — location masked`);
  }
  if (v.ip.distanceToShipKm !== undefined && v.ip.distanceToShipKm > 800) {
    components.ip += 10;
    reasons.push(`IP geolocation is ${Math.round(v.ip.distanceToShipKm).toLocaleString()} km from shipping address`);
  }

  // ── Velocity signals ────────────────────────────────────────────────────

  if (velocity) {
    if (velocity.score > 0) {
      components.velocity += velocity.score;
      velocity.signals.filter((s) => !s.startsWith("Trusted") && !s.startsWith("Returning"))
        .forEach((s) => reasons.push(s));
    }

    // Positive velocity signals
    if (velocity.score < 0) {
      components.positive += velocity.score; // negative = good
      velocity.signals.filter((s) => s.startsWith("Trusted") || s.startsWith("Returning"))
        .forEach((s) => reasons.push(`✓ ${s}`));
    }

    // First-time + high value
    if (!velocity.isReturningCustomer) {
      components.velocity += 15;
      reasons.push("First-time customer — no prior order history");
    }

    // Inherit OTP/doc requirements from velocity
    if (velocity.requiresOtp) requiresOtp = true;
    if (velocity.requiresDocVerification) requiresDocVerification = true;
  }

  // ── OTP enforcement rules ───────────────────────────────────────────────

  // Require OTP when shipping ≠ billing (distance > 50km)
  if (dist > 50) requiresOtp = true;

  // ── Score + decision ────────────────────────────────────────────────────

  const rawScore =
    components.address +
    components.phone +
    components.email +
    components.payment +
    components.ip +
    components.velocity +
    components.positive;

  const score = Math.min(100, Math.max(0, rawScore));

  let decision: "approved" | "queued" | "denied";
  if (hardStop) {
    decision = "denied";
  } else if (score <= thresholds.approved) {
    decision = requiresOtp || requiresDocVerification ? "queued" : "approved";
  } else if (score <= thresholds.queued) {
    decision = "queued";
  } else {
    decision = "denied";
  }

  return {
    score,
    decision,
    reasons,
    hardStop,
    hardStopReason,
    requiresOtp,
    requiresDocVerification,
    components,
  };
}
