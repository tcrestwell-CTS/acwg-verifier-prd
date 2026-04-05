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

// ── Name match scoring ────────────────────────────────────────────────────────

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

// ── ATTOM Property API ────────────────────────────────────────────────────────
// Endpoint: https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/basicprofile
// Auth: apikey header
// Docs: https://api.developer.attomdata.com/docs

interface AttomProperty {
  summary?: {
    propClass?: string;
    propType?: string;
    propLandUse?: string;
    yearBuilt?: number;
    absenteeInd?: string;
    propertyType?: string;
  };
  assessment?: {
    owner?: {
      owner1?: { fullName?: string; lastName?: string; firstNameAndMi?: string };
      corporateIndicator?: string;
      absenteeOwnerStatus?: string;
    };
  };
  sale?: {
    saleTransDate?: string;
  };
}

interface AttomResponse {
  status?: { code?: number; msg?: string };
  property?: AttomProperty[];
}

export async function checkProperty(input: PropertyInput): Promise<PropertySignals> {
  const apiKey = process.env.PROPERTY_API_KEY;

  if (!apiKey) {
    logger.info("property: PROPERTY_API_KEY not set — stub mode");
    return {
      ownerName: null, ownershipYears: null,
      matchLevel: "unavailable", isCommercial: false, isVacant: false,
      reasons: ["Property lookup not configured"],
    };
  }

  try {
    // ATTOM splits address: address1 = street, address2 = city+state+zip
    const address1 = input.line1;
    const address2 = `${input.city}, ${input.state} ${input.postalCode}`;

    const params = new URLSearchParams({ address1, address2 });

    const res = await fetch(
      `https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/basicprofile?${params}`,
      {
        headers: {
          apikey: apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ATTOM API ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json() as AttomResponse;

    if (!data.property?.length) {
      return {
        ownerName: null, ownershipYears: null,
        matchLevel: "unavailable", isCommercial: false, isVacant: false,
        reasons: ["No property record found for this address"],
      };
    }

    const prop = data.property[0];
    const owner = prop.assessment?.owner;

    // ATTOM returns owner under assessment.owner with fullName field
    const ownerName = owner?.owner1?.fullName ?? null;

    const matchLevel = ownerName
      ? scoreNameMatch(input.submittedName, ownerName)
      : "unavailable";

    // Ownership years from sale transaction date
    let ownershipYears: number | null = null;
    const saleDate = prop.sale?.saleTransDate;
    if (saleDate) {
      const year = parseInt(saleDate.slice(0, 4), 10);
      if (!isNaN(year) && year > 1900) {
        ownershipYears = new Date().getFullYear() - year;
      }
    }

    // Property type
    const propClass = (prop.summary?.propClass ?? "").toLowerCase();
    const propLandUse = (prop.summary?.propLandUse ?? "").toLowerCase();
    const isCommercial = ["commercial", "industrial", "retail", "office", "warehouse"]
      .some((t) => propClass.includes(t) || propLandUse.includes(t));
    const isVacant = propLandUse.includes("vacant");
    const isAbsentee = owner?.absenteeOwnerStatus !== "O";

    const reasons: string[] = [];
    if (matchLevel === "none" && ownerName) {
      reasons.push(`Property owner on record "${ownerName}" — does not match submitted name`);
    } else if (matchLevel === "partial" && ownerName) {
      reasons.push(`Partial name match with property record: ${ownerName}`);
    } else if (matchLevel === "full") {
      reasons.push("✓ Name matches property owner record");
    }
    if (isAbsentee) reasons.push("Property owner does not appear to live at this address");
    if (isVacant) reasons.push("Property recorded as vacant");
    if (isCommercial) reasons.push("Address is a commercial property");

    logger.info("property: ATTOM lookup complete", {
      matchLevel, ownershipYears, isVacant, isCommercial, isAbsentee,
    });

    return { ownerName, ownershipYears, matchLevel, isCommercial, isVacant, reasons };

  } catch (err) {
    logger.error("property: ATTOM lookup failed", { error: String(err) });
    return {
      ownerName: null, ownershipYears: null,
      matchLevel: "unavailable", isCommercial: false, isVacant: false,
      reasons: ["Property lookup failed — continuing without signal"],
    };
  }
}
