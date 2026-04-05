import { logger } from "@/lib/logger";

export interface IdentitySignals {
  confidence: number;        // 0–100 (higher = more confident it's a real person)
  nameAddressMatch: boolean;
  emailLinked: boolean;
  phoneLinked: boolean;
  fraudScore: number;        // 0–100 (higher = more risky)
  reasons: string[];
}

interface IdentityInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  billingAddress: {
    line1: string;
    city: string;
    state: string;
    postalCode: string;
  };
}

// ── IPQS Identity Verification API ───────────────────────────────────────────
// Combines phone validation + email validation + identity checks
// Endpoint: https://ipqualityscore.com/api/json/phone/{key}/{phone}
//           https://ipqualityscore.com/api/json/email/{key}/{email}
// Auth: API key in URL path (no OAuth needed)
// Docs: https://www.ipqualityscore.com/documentation/phone-number-validation-api/overview

interface IPQSPhoneResponse {
  success?: boolean;
  message?: string;
  fraud_score?: number;
  valid?: boolean;
  line_type?: string;       // "mobile", "landline", "VOIP", "toll_free", etc.
  carrier?: string;
  active?: boolean;
  active_status?: string;
  risky?: boolean;
  recent_abuse?: boolean;
  do_not_call?: boolean;
  name?: string;            // owner name from reverse lookup
  leaked?: boolean;
}

interface IPQSEmailResponse {
  success?: boolean;
  fraud_score?: number;
  valid?: boolean;
  disposable?: boolean;
  smtp_score?: number;      // -1 (invalid) to 3 (excellent)
  overall_score?: number;
  first_name?: string;
  generic?: boolean;
  common?: boolean;
  recent_abuse?: boolean;
  leaked?: boolean;
  suspect?: boolean;
  domain_velocity?: string;
}

function normalizePhoneName(name: string | undefined): string {
  if (!name || name === "N/A" || name.toLowerCase() === "unknown") return "";
  return name.toUpperCase().replace(/[^A-Z\s]/g, "").trim();
}

function scoreNameMatch(
  submittedFirst: string,
  submittedLast: string,
  phoneOwnerName: string
): boolean {
  const normalize = (s: string) =>
    s.toUpperCase().replace(/[^A-Z\s]/g, "").trim();
  const owner = normalize(phoneOwnerName);
  if (!owner) return false;
  const first = normalize(submittedFirst);
  const last = normalize(submittedLast);
  return owner.includes(last) || owner.includes(first);
}

export async function checkIdentity(input: IdentityInput): Promise<IdentitySignals> {
  const apiKey = process.env.IDENTITY_INTEL_API_KEY;

  if (!apiKey) {
    logger.info("identity: IDENTITY_INTEL_API_KEY not set — stub mode");
    return {
      confidence: 50,
      nameAddressMatch: false,
      emailLinked: false,
      phoneLinked: false,
      fraudScore: 0,
      reasons: ["Identity intelligence not configured"],
    };
  }

  const reasons: string[] = [];

  // Run phone and email checks in parallel
  const [phoneResult, emailResult] = await Promise.all([
    // Phone lookup with reverse name lookup
    fetch(
      `https://ipqualityscore.com/api/json/phone/${apiKey}/${encodeURIComponent(input.phone)}?strictness=1&allow_landlines=true`,
      { signal: AbortSignal.timeout(4000) }
    ).then((r) => r.json() as Promise<IPQSPhoneResponse>).catch((err) => {
      logger.error("identity: IPQS phone check failed", { error: String(err) });
      return null;
    }),

    // Email reputation check
    fetch(
      `https://ipqualityscore.com/api/json/email/${apiKey}/${encodeURIComponent(input.email)}?strictness=1`,
      { signal: AbortSignal.timeout(4000) }
    ).then((r) => r.json() as Promise<IPQSEmailResponse>).catch((err) => {
      logger.error("identity: IPQS email check failed", { error: String(err) });
      return null;
    }),
  ]);

  // ── Phone signals ─────────────────────────────────────────────────────────

  const phoneFraudScore = phoneResult?.fraud_score ?? 0;
  const phoneActive = phoneResult?.active ?? true;
  const phoneLineType = (phoneResult?.line_type ?? "").toLowerCase();
  const phoneOwnerName = normalizePhoneName(phoneResult?.name);

  const phoneLinked = phoneActive && !phoneResult?.risky && phoneFraudScore < 75;
  const nameMatch = phoneOwnerName
    ? scoreNameMatch(input.firstName, input.lastName, phoneOwnerName)
    : false;

  if (phoneResult?.risky) reasons.push("Phone number flagged as high-risk by IPQS");
  if (phoneResult?.recent_abuse) reasons.push("Phone number associated with recent abuse");
  if (phoneResult?.do_not_call) reasons.push("Phone number is on Do Not Call registry");
  if (!phoneActive) reasons.push("Phone number appears inactive or disconnected");
  if (phoneLineType === "voip") reasons.push("Phone is VoIP — harder to verify ownership");
  if (phoneResult?.leaked) reasons.push("Phone number found in data breach records");
  if (phoneOwnerName && nameMatch) reasons.push(`✓ Phone owner name matches: ${phoneOwnerName}`);
  else if (phoneOwnerName && !nameMatch) reasons.push(`Phone owner on record is "${phoneOwnerName}" — does not match submitted name`);

  // ── Email signals ─────────────────────────────────────────────────────────

  const emailFraudScore = emailResult?.fraud_score ?? 0;
  const emailLinked = !emailResult?.disposable && !emailResult?.suspect && emailFraudScore < 75;

  if (emailResult?.disposable) reasons.push("Email is a disposable/throwaway address");
  if (emailResult?.recent_abuse) reasons.push("Email associated with recent abuse or fraud");
  if (emailResult?.leaked) reasons.push("Email found in data breach records");
  if (emailResult?.suspect) reasons.push("Email domain flagged as suspicious");

  // ── Overall confidence + fraud score ─────────────────────────────────────

  const combinedFraudScore = Math.round(
    (phoneFraudScore * 0.6) + (emailFraudScore * 0.4)
  );

  // Confidence = inverse of fraud score + boosts for positive signals
  let confidence = Math.max(0, 100 - combinedFraudScore);
  if (nameMatch) confidence = Math.min(100, confidence + 10);
  if (emailLinked && phoneLinked) confidence = Math.min(100, confidence + 5);

  logger.info("identity: IPQS check complete", {
    phoneFraudScore,
    emailFraudScore,
    combinedFraudScore,
    confidence,
    nameMatch,
    phoneLinked,
    emailLinked,
  });

  return {
    confidence,
    nameAddressMatch: nameMatch,
    emailLinked,
    phoneLinked,
    fraudScore: combinedFraudScore,
    reasons,
  };
}
