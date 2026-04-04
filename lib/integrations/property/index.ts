import { logger } from "@/lib/logger";

export interface PropertySignals {
  ownerName: string | null;
  ownershipYears: number | null;
  matchLevel: "full" | "partial" | "none" | "unavailable";
  isCommercial: boolean;
  isVacant: boolean;
  reasons: string[];
}

interface PropertyInput {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  submittedName: string;
}

// ── CoreLogic OAuth token (cached in-process) ─────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getCoreLogicToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const key = process.env.PROPERTY_API_KEY!;
  const secret = process.env.PROPERTY_API_SECRET!;
  const credentials = Buffer.from(`${key}:${secret}`).toString("base64");

  const res = await fetch("https://property.corelogicapi.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CoreLogic token exchange failed ${res.status}: ${text}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

// ── Name match scoring ────────────────────────────────────────────────────

function scoreNameMatch(
  submittedName: string,
  ownerName: string
): PropertySignals["matchLevel"] {
  const normalize = (s: string) =>
    s.toUpperCase().replace(/[^A-Z\s]/g, "").trim();
  const submitted = normalize(submittedName);
  const owner = normalize(ownerName);
  const parts = submitted.split(/\s+/).filter(Boolean);
  const matched = parts.filter((p) => owner.includes(p));
  if (matched.length === parts.length) return "full";
  if (matched.length >= 1) return "partial";
  return "none";
}

// ── Main adapter ──────────────────────────────────────────────────────────

export async function checkProperty(input: PropertyInput): Promise<PropertySignals> {
  const key = process.env.PROPERTY_API_KEY;
  const secret = process.env.PROPERTY_API_SECRET;

  if (!key || !secret) {
    logger.info("property: CoreLogic credentials not set — stub mode");
    return {
      ownerName: null, ownershipYears: null,
      matchLevel: "unavailable", isCommercial: false, isVacant: false,
      reasons: ["Property lookup not configured"],
    };
  }

  try {
    const token = await getCoreLogicToken();

    // CoreLogic v2 property search
    const res = await fetch("https://property.corelogicapi.com/v2/properties/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        searchParameters: {
          address: {
            streetAddress: input.line1,
            city: input.city,
            state: input.state,
            postalCode: input.postalCode,
          },
        },
        resultFields: [
          "ownerInfo",
          "propertyType",
          "saleHistory",
          "vacancyIndicator",
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`CoreLogic search ${res.status}: ${text}`);
    }

    const data = await res.json() as {
      properties?: Array<{
        ownerInfo?: {
          owner1FullName?: string;
          owner2FullName?: string;
        };
        propertyType?: string;
        saleHistory?: Array<{ saleDate?: string }>;
        vacancyIndicator?: string;
      }>;
    };

    const prop = data.properties?.[0];

    if (!prop) {
      return {
        ownerName: null, ownershipYears: null,
        matchLevel: "unavailable", isCommercial: false, isVacant: false,
        reasons: ["No property record found for this address"],
      };
    }

    const ownerName = prop.ownerInfo?.owner1FullName ?? null;
    const matchLevel = ownerName
      ? scoreNameMatch(input.submittedName, ownerName)
      : "unavailable";

    // Most recent sale → ownership estimate
    const sales = prop.saleHistory ?? [];
    const lastSale = sales.sort((a, b) =>
      new Date(b.saleDate ?? 0).getTime() - new Date(a.saleDate ?? 0).getTime()
    )[0];
    const ownershipYears = lastSale?.saleDate
      ? new Date().getFullYear() - new Date(lastSale.saleDate).getFullYear()
      : null;

    const propType = (prop.propertyType ?? "").toLowerCase();
    const isCommercial = propType.includes("commercial") ||
      propType.includes("industrial") || propType.includes("retail");
    const isVacant = (prop.vacancyIndicator ?? "").toLowerCase() === "y";

    const reasons: string[] = [];
    if (matchLevel === "none" && ownerName) {
      reasons.push(`Record owner "${ownerName}" does not match submitted name`);
    } else if (matchLevel === "partial" && ownerName) {
      reasons.push(`Partial name match with property record: ${ownerName}`);
    }
    if (isVacant) reasons.push("Property recorded as vacant");
    if (isCommercial) reasons.push("Address is a commercial property");

    logger.info("property: CoreLogic lookup complete", {
      matchLevel,
      ownershipYears,
      isVacant,
      isCommercial,
    });

    return { ownerName, ownershipYears, matchLevel, isCommercial, isVacant, reasons };

  } catch (err) {
    logger.error("property: CoreLogic failed", { error: String(err) });
    return {
      ownerName: null, ownershipYears: null,
      matchLevel: "unavailable", isCommercial: false, isVacant: false,
      reasons: ["Property lookup failed — continuing without signal"],
    };
  }
}
