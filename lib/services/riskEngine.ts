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

  // Even with 3rd party delivery, the address must actually exist
  if (v.address.dpv === "N" && !v.address.deliverable) {
    components.address += 35;
    reasons.push("Address does not exist in USPS database — likely fake or invalid");
    requiresOtp = true;
  } else if (v.address.dpv === "U" && !v.address.normalized) {
    // Only penalize U if the address also failed to normalize — U alone means
    // Smarty couldn't confirm but the address may still be valid
    components.address += 10;
    reasons.push("Address could not be fully verified — manual confirmation recommended");
  } else if (v.address.apartmentNeeded) {
    components.address += 5;
    reasons.push("Apartment or unit number may be missing from address");
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
    requiresOtp = true;
    requiresDocVerification = dist > 100;
  }
  if (v.phone.active === false) {
    // Check if it's a non-existent number (high risk score) vs just inactive
    if (v.phone.riskScore !== undefined && v.phone.riskScore >= 80) {
      components.phone += 30;
      reasons.push("Phone number does not exist in carrier database — likely fake");
      requiresOtp = true;
    } else {
      components.phone += 15;
      reasons.push("Phone number appears inactive or disconnected");
    }
  }
  if (v.phone.riskScore !== undefined && v.phone.riskScore > 70 && v.phone.active !== false) {
    components.phone += 10;
    reasons.push(`Phone carrier risk score elevated (${v.phone.riskScore}/100)`);
  }

  // ── Email checks ────────────────────────────────────────────────────────

  if (v.email.mxValid === false) {
    // Domain has no mail server — address cannot exist
    components.email += 30;
    reasons.push("Email domain has no mail server — address is invalid or fake");
    requiresOtp = true;
  } else if (
    (v.email as { smtpExists?: boolean | null }).smtpExists === false ||
    (v.email as { mailboxValid?: boolean }).mailboxValid === false
  ) {
    // Mailbox confirmed not to exist — either by SMTP probe or IPQS validation
    components.email += 25;
    reasons.push("Email mailbox does not exist — confirmed by mail server");
    requiresOtp = true;
  } else if (v.email.disposable === true) {
    components.email += 20;
    reasons.push("Email is a disposable/throwaway address — cannot verify identity");
    requiresOtp = true;
  } else if (v.email.domainRisk === "high") {
    components.email += 15;
    reasons.push("Email domain flagged as high risk by fraud intelligence");
  } else if (v.email.domainRisk === "medium") {
    components.email += 5;
    reasons.push("Email domain risk elevated");
  }

  // Email age — recently created addresses are high risk
  const firstSeen = (v.email as { firstSeenDaysAgo?: number | null }).firstSeenDaysAgo;
  if (firstSeen !== null && firstSeen !== undefined) {
    if (firstSeen <= 1) {
      components.email += 30;
      reasons.push("Email created today or yesterday — extremely suspicious for a purchase");
      requiresOtp = true;
    } else if (firstSeen <= 7) {
      components.email += 20;
      reasons.push(`Email address only ${firstSeen} days old — created very recently`);
      requiresOtp = true;
    } else if (firstSeen <= 30) {
      components.email += 10;
      reasons.push(`Email address ${firstSeen} days old — less than one month`);
    }
  }

  // ── Payment checks ──────────────────────────────────────────────────────

  if (v.payment.avs === "N") {
    components.payment += 25;
    reasons.push("AVS mismatch — billing address does not match card issuer records");
  } else if (v.payment.avs === "P") {
    components.payment += 10;
    reasons.push("AVS partial match — ZIP matched but street address did not");
  } else if (v.payment.avs === "U") {
    // Only penalize if card was actually entered — check for cardLast4
    const cardEntered = !!(v.payment as { cardLast4?: string }).cardLast4;
    if (cardEntered) {
      components.payment += 5;
      reasons.push("AVS unavailable — card issuer did not return address verification");
    }
    // No penalty if card was not entered at all
  }
  // CVV U — no penalty, only penalize mismatch (N) which is already a hard stop
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
