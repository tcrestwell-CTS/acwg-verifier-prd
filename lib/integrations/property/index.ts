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

// ── Melissa Property API ──────────────────────────────────────────────────────
// Endpoint: https://property.melissadata.net/v4/WEB/LookupProperty
// Auth: License key as `id` query param (no OAuth needed)
// Docs: https://wiki.melissadata.com/index.php?title=Property_V4:LookupProperty

interface MelissaPropertyResponse {
  Version?: string;
  TransmissionResults?: string;
  TotalRecords?: string;
  Records?: Array<{
    RecordID?: string;
    Results?: string;
    Owner?: {
      Name1Full?: string;
      Name2Full?: string;
      CorporateOwner?: string;
    };
    ParsedPropertyAddress?: {
      AddressLine1?: string;
      City?: string;
      State?: string;
      PostalCode?: string;
    };
    Values?: {
      AssessedValueTotal?: string;
      MarketValueTotal?: string;
    };
    CurrentDeed?: {
      SaleDate?: string;
      SalePrice?: string;
    };
    Parcel?: {
      LandUseCode?: string;
      PropertyIndicatorCode?: string;
    };
  }>;
}

export async function checkProperty(input: PropertyInput): Promise<PropertySignals> {
  const licenseKey = process.env.PROPERTY_API_KEY;

  if (!licenseKey) {
    logger.info("property: Melissa API key not set — stub mode");
    return {
      ownerName: null, ownershipYears: null,
      matchLevel: "unavailable", isCommercial: false, isVacant: false,
      reasons: ["Property lookup not configured"],
    };
  }

  try {
    const params = new URLSearchParams({
      id: licenseKey,
      a1: input.line1,
      city: input.city,
      state: input.state,
      zip: input.postalCode,
      cols: "GrpPropertyAddress,GrpOwner,GrpValues,GrpCurrentDeed,GrpParcel",
      format: "JSON",
    });

    const res = await fetch(
      `https://property.melissadata.net/v4/WEB/LookupProperty?${params}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) {
      throw new Error(`Melissa Property API ${res.status}`);
    }

    const data = await res.json() as MelissaPropertyResponse;
    const record = data.Records?.[0];

    if (!record) {
      return {
        ownerName: null, ownershipYears: null,
        matchLevel: "unavailable", isCommercial: false, isVacant: false,
        reasons: ["No property record found for this address"],
      };
    }

    // Result codes — AS = address found, AE = address error
    const resultCodes = record.Results ?? "";
    if (resultCodes.includes("AE") || resultCodes.includes("GE")) {
      return {
        ownerName: null, ownershipYears: null,
        matchLevel: "unavailable", isCommercial: false, isVacant: false,
        reasons: ["Address not found in Melissa property database"],
      };
    }

    const ownerName = record.Owner?.Name1Full ??
      record.Owner?.CorporateOwner ?? null;

    const matchLevel = ownerName
      ? scoreNameMatch(input.submittedName, ownerName)
      : "unavailable";

    // Estimate ownership years from deed sale date
    let ownershipYears: number | null = null;
    const saleDate = record.CurrentDeed?.SaleDate;
    if (saleDate && saleDate.length >= 4) {
      const saleYear = parseInt(saleDate.slice(0, 4), 10);
      if (!isNaN(saleYear) && saleYear > 1900) {
        ownershipYears = new Date().getFullYear() - saleYear;
      }
    }

    // Property type — Melissa land use codes
    const landUse = (record.Parcel?.LandUseCode ?? "").toLowerCase();
    const propIndicator = (record.Parcel?.PropertyIndicatorCode ?? "").toLowerCase();
    const isCommercial = ["commercial", "industrial", "retail", "office"]
      .some((t) => landUse.includes(t) || propIndicator.includes(t));

    const isCorporate = !!record.Owner?.CorporateOwner;
    const isVacant = landUse.includes("vacant");

    const reasons: string[] = [];
    if (matchLevel === "none" && ownerName) {
      reasons.push(`Property owner on record "${ownerName}" — does not match submitted name`);
    } else if (matchLevel === "partial" && ownerName) {
      reasons.push(`Partial name match with property record: ${ownerName}`);
    }
    if (isVacant) reasons.push("Property recorded as vacant");
    if (isCommercial) reasons.push("Address is a commercial property");
    if (isCorporate && matchLevel !== "full") {
      reasons.push("Property is corporate-owned — name match not possible");
    }

    logger.info("property: Melissa lookup complete", {
      matchLevel, ownershipYears, isVacant, isCommercial,
    });

    return { ownerName, ownershipYears, matchLevel, isCommercial, isVacant, reasons };

  } catch (err) {
    logger.error("property: Melissa lookup failed", { error: String(err) });
    return {
      ownerName: null, ownershipYears: null,
      matchLevel: "unavailable", isCommercial: false, isVacant: false,
      reasons: ["Property lookup failed — continuing without signal"],
    };
  }
}
