import { logger } from "@/lib/logger";

export interface PhoneIntelSignals {
  simSwapRecent: boolean;
  simSwapDaysAgo: number | null;
  lineType: "mobile" | "landline" | "voip" | "unknown";
  ownershipMatch: boolean | null;
  carrierName: string | null;
  fraudScore: number;
  active: boolean;
  recentAbuse: boolean;
  reasons: string[];
}

interface PhoneIntelInput {
  phone: string;       // E.164
  submittedName: string;
}

// ── IPQS Phone Validation API ─────────────────────────────────────────────────
// Endpoint: https://ipqualityscore.com/api/json/phone/{key}/{phone}
// Auth: API key in URL path
// Returns: fraud_score, line_type, carrier, active, risky, name (reverse lookup)
// Docs: https://www.ipqualityscore.com/documentation/phone-number-validation-api/overview

interface IPQSPhoneResponse {
  success?: boolean;
  message?: string;
  fraud_score?: number;
  valid?: boolean;
  active?: boolean;
  line_type?: string;
  carrier?: string;
  risky?: boolean;
  recent_abuse?: boolean;
  do_not_call?: boolean;
  name?: string;
  leaked?: boolean;
  prepaid?: boolean;
  spammer?: boolean;
}

function normalizeForMatch(s: string): string {
  return s.toUpperCase().replace(/[^A-Z\s]/g, "").trim();
}

function checkNameMatch(submittedName: string, ownerName: string): boolean {
  if (!ownerName || ownerName === "N/A" || ownerName.toLowerCase() === "unknown") {
    return false;
  }
  const owner = normalizeForMatch(ownerName);
  const parts = normalizeForMatch(submittedName).split(/\s+/).filter(Boolean);
  return parts.some((p) => owner.includes(p));
}

function mapLineType(ipqsType: string): PhoneIntelSignals["lineType"] {
  const t = ipqsType.toLowerCase();
  if (t.includes("mobile") || t.includes("wireless") || t.includes("cellular")) return "mobile";
  if (t.includes("landline") || t.includes("fixed")) return "landline";
  if (t.includes("voip") || t.includes("virtual")) return "voip";
  return "unknown";
}

export async function checkPhoneIntel(input: PhoneIntelInput): Promise<PhoneIntelSignals> {
  // Reuse the same IPQS key as identity intelligence
  const apiKey = process.env.IDENTITY_INTEL_API_KEY;

  if (!apiKey) {
    logger.info("phone-intel: IDENTITY_INTEL_API_KEY not set — stub mode");
    return {
      simSwapRecent: false, simSwapDaysAgo: null,
      lineType: "unknown", ownershipMatch: null,
      carrierName: null, fraudScore: 0, active: true,
      recentAbuse: false,
      reasons: ["Phone intelligence not configured"],
    };
  }

  try {
    const params = new URLSearchParams({
      strictness: "1",
      allow_landlines: "true",
    });

    const res = await fetch(
      `https://ipqualityscore.com/api/json/phone/${apiKey}/${encodeURIComponent(input.phone)}?${params}`,
      { signal: AbortSignal.timeout(4000) }
    );

    if (!res.ok) throw new Error(`IPQS phone API ${res.status}`);

    const data = await res.json() as IPQSPhoneResponse;

    if (!data.success) {
      logger.warn("phone-intel: IPQS returned error", { message: data.message });
      return {
        simSwapRecent: false, simSwapDaysAgo: null,
        lineType: "unknown", ownershipMatch: null,
        carrierName: null, fraudScore: 0, active: true,
        recentAbuse: false,
        reasons: ["Phone intelligence check failed"],
      };
    }

    const fraudScore = data.fraud_score ?? 0;
    const lineType = mapLineType(data.line_type ?? "");
    const active = data.active ?? true;
    const recentAbuse = data.recent_abuse ?? false;
    const carrierName = data.carrier ?? null;

    // IPQS doesn't directly expose SIM swap timestamps but flags risky/recent_abuse
    // which correlates with SIM swap activity
    const simSwapRecent = recentAbuse && fraudScore > 75;

    // Owner name match from reverse phone lookup
    const ownerName = data.name ?? null;
    const ownershipMatch = ownerName && ownerName !== "N/A"
      ? checkNameMatch(input.submittedName, ownerName)
      : null;

    const reasons: string[] = [];
    if (fraudScore >= 75) reasons.push(`Phone fraud score elevated (${fraudScore}/100)`);
    if (data.risky) reasons.push("Phone flagged as high-risk by carrier intelligence");
    if (recentAbuse) reasons.push("Phone associated with recent abuse or fraud");
    if (lineType === "voip") reasons.push("Phone is VoIP — harder to verify ownership");
    if (!active) reasons.push("Phone appears inactive or disconnected");
    if (data.do_not_call) reasons.push("Phone is on Do Not Call registry");
    if (data.prepaid) reasons.push("Phone is a prepaid number");
    if (data.spammer) reasons.push("Phone number flagged as spam caller");
    if (data.leaked) reasons.push("Phone found in data breach records");
    if (simSwapRecent) reasons.push("Possible recent SIM swap activity detected");
    if (ownershipMatch === true && ownerName) {
      reasons.push(`✓ Phone owner matches: ${ownerName}`);
    } else if (ownershipMatch === false && ownerName && ownerName !== "N/A") {
      reasons.push(`Phone owner on record "${ownerName}" — does not match submitted name`);
    }

    logger.info("phone-intel: IPQS check complete", {
      fraudScore, lineType, active, simSwapRecent, ownershipMatch,
    });

    return {
      simSwapRecent,
      simSwapDaysAgo: null, // IPQS free tier doesn't return exact date
      lineType,
      ownershipMatch,
      carrierName,
      fraudScore,
      active,
      recentAbuse,
      reasons,
    };

  } catch (err) {
    logger.error("phone-intel: IPQS check failed", { error: String(err) });
    return {
      simSwapRecent: false, simSwapDaysAgo: null,
      lineType: "unknown", ownershipMatch: null,
      carrierName: null, fraudScore: 0, active: true,
      recentAbuse: false,
      reasons: ["Phone intelligence check failed — continuing without signal"],
    };
  }
}
