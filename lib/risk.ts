import type { VerificationResult } from "./schemas";

export interface RiskBreakdown {
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

export function computeRisk(v: VerificationResult): RiskBreakdown {
  let score = 0;
  const reasons: string[] = [];
  const components = { address: 0, phone: 0, email: 0, payment: 0, ip: 0 };

  // Address checks
  if (v.address.dpv !== "Y") {
    components.address += 20;
    reasons.push("Address not fully deliverable (DPV non-Y)");
  }
  if (v.address.apartmentNeeded) {
    components.address += 5;
    reasons.push("Apartment/unit number appears missing from address");
  }

  // Shipping vs billing distance
  if (
    v.address.distanceKm !== undefined &&
    v.address.distanceKm > 500
  ) {
    components.address += 15;
    reasons.push(
      `Billing and shipping addresses are ${Math.round(v.address.distanceKm)} km apart`
    );
  }

  // Phone checks
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
    reasons.push("Phone carrier risk score elevated");
  }

  // Email checks
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

  // Payment checks
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

  // IP checks
  if (v.ip.proxy || v.ip.vpn) {
    components.ip += 15;
    reasons.push(
      `IP address routes through a ${v.ip.vpn ? "VPN" : "proxy"} — location masked`
    );
  }
  if (v.ip.distanceToShipKm !== undefined && v.ip.distanceToShipKm > 800) {
    components.ip += 10;
    reasons.push(
      `IP geolocation is ${Math.round(v.ip.distanceToShipKm)} km from shipping address`
    );
  }

  score = Math.min(
    100,
    components.address + components.phone + components.email + components.payment + components.ip
  );

  const decision: "approved" | "queued" | "denied" =
    score <= 25 ? "approved" : score <= 60 ? "queued" : "denied";

  return { score, decision, reasons, components };
}

export function scoreColor(score: number): string {
  if (score <= 25) return "text-green-600";
  if (score <= 60) return "text-amber-600";
  return "text-red-600";
}

export function scoreBg(score: number): string {
  if (score <= 25) return "bg-green-50 border-green-200";
  if (score <= 60) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

export function decisionBadgeClass(decision: string): string {
  switch (decision) {
    case "approved":
      return "bg-green-100 text-green-800 border-green-200";
    case "queued":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "denied":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export const APPROVAL_REASONS = [
  "Address verified and deliverable",
  "Identity confirmed via OTP",
  "Identity confirmed via phone call",
  "AVS full match — billing address confirmed",
  "CVV verified",
  "Returning customer — prior order history clean",
  "Customer verbally confirmed billing address",
  "Customer verbally confirmed card details",
  "Photo ID reviewed and verified",
  "Manager override — approved after review",
  "Low risk score — all signals within threshold",
];

export const PHONE_OVERRIDE_REASONS = [
  "Customer confirmed identity verbally",
  "Customer confirmed billing address verbally",
  "Customer confirmed card CVV verbally",
  "Manager authorized phone approval",
  "Customer is known/trusted — verified by rep",
  "Discrepancy explained and resolved on call",
];

export const DENIAL_REASONS = [
  "Address undeliverable or does not exist",
  "Billing/shipping mismatch exceeds threshold",
  "Phone number invalid or high risk",
  "Disposable email address detected",
  "AVS/CVV check failed",
  "IP routed through proxy/VPN",
  "Order pattern matches known fraud signature",
  "Customer identity cannot be verified",
  "Prepaid card not accepted for this order type",
  "Exceeds velocity limit for customer",
];
