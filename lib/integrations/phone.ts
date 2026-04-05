import { logger } from "@/lib/logger";

export interface PhoneCheckResult {
  carrier?: string;
  type?: "mobile" | "landline" | "voip";
  active?: boolean;
  riskScore?: number;
  e164?: string;
  reasons: string[];
}

function normalizeToE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}

export async function checkPhone(rawPhone: string): Promise<PhoneCheckResult> {
  const e164 = normalizeToE164(rawPhone);
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    logger.warn("Twilio credentials not configured — using stub");
    return stubPhoneCheck(e164);
  }

  try {
    const encoded = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence,sim_swap`;

    const res = await fetch(url, {
      headers: { Authorization: `Basic ${encoded}` },
    });

    if (!res.ok) {
      if (res.status === 404) {
        // Number does not exist in any carrier database — hard flag
        logger.warn("Phone number not found in carrier database", { phone: e164 });
        return {
          e164,
          type: undefined,
          active: false,
          riskScore: 90,
          reasons: ["Phone number does not exist in carrier database — likely fake or invalid"],
        };
      }
      throw new Error(`Twilio error: ${res.status}`);
    }

    const data = await res.json() as {
      line_type_intelligence?: {
        type?: string;
        carrier_name?: string;
        error_code?: number | null;
        mobile_network_code?: string;
      };
    };

    const lineTypeIntel = data.line_type_intelligence;
    const errorCode = lineTypeIntel?.error_code;
    const lineType = lineTypeIntel?.type ?? "unknown";
    const carrier = lineTypeIntel?.carrier_name;

    // Error code means Twilio couldn't verify the number
    if (errorCode) {
      logger.warn("Phone line type intelligence error", { phone: e164, errorCode });
      return {
        e164,
        active: false,
        riskScore: 75,
        reasons: [`Phone number could not be verified by carrier (error ${errorCode})`],
      };
    }

    const typeMap: Record<string, "mobile" | "landline" | "voip"> = {
      mobile: "mobile",
      landline: "landline",
      voip: "voip",
      fixedVoip: "voip",
      nonFixedVoip: "voip",
    };

    const type = typeMap[lineType] ?? "mobile";
    const isVoip = type === "voip";
    const isUnknown = lineType === "unknown";
    const reasons: string[] = [];

    if (isVoip) reasons.push("Phone number is VoIP — harder to verify subscriber identity");
    else if (isUnknown) reasons.push("Phone line type could not be determined — treat as unverified");
    else reasons.push(`Active ${type} number${carrier ? ` (${carrier})` : ""}`);

    return {
      e164,
      carrier,
      type,
      active: !isVoip && !isUnknown,
      riskScore: isVoip ? 60 : isUnknown ? 50 : 10,
      reasons,
    };
  } catch (err) {
    logger.error("Phone check failed", { error: String(err), phone: e164 });
    return {
      e164,
      reasons: ["Phone verification service unavailable — treating as unverified"],
    };
  }
}

function stubPhoneCheck(e164: string): PhoneCheckResult {
  // Deterministic stubs based on number patterns
  if (e164.startsWith("+1800") || e164.startsWith("+1888") || e164.startsWith("+1877")) {
    return {
      e164,
      type: "voip",
      active: false,
      riskScore: 85,
      reasons: ["VoIP number pattern detected (toll-free)", "Cannot verify active subscriber"],
    };
  }
  return {
    e164,
    type: "mobile",
    active: true,
    carrier: "Unknown (stub)",
    riskScore: 15,
    reasons: ["Phone stub — real Twilio check skipped (no credentials)"],
  };
}

