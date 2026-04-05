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

// ── Estated Property API v4 ───────────────────────────────────────────────────
// Endpoint: https://apis.estated.com/v4/property
// Auth: ?token=YOUR_TOKEN (single key, no OAuth)
// Docs: https://estated.com/developers/docs/v4/property/overview
// Now part of ATTOM Data — existing keys remain valid

interface EstatedResponse {
  data?: {
    owner?: {
      name?: string;
      second_name?: string;
      owner_occupied?: string;
    };
    parcel?: {
      land_use?: string;
      county_land_use_code?: string;
    };
    deeds?: Array<{
      recording_date?: string;
      document_type?: string;
    }>;
  };
  warnings?: Array<{ code?: string; message?: string }>;
  error?: { code?: string; title?: string; description?: string };
  metadata?: { timestamp?: string };
}

export async function checkProperty(input: PropertyInput): Promise<PropertySignals> {
  // Support both Estated and Melissa keys via the same env var
  // Set PROPERTY_API_KEY to your Estated token
  const token = process.env.PROPERTY_API_KEY;
  const sandbox = process.env.NODE_ENV !== "production" || process.env.PROPERTY_API_SANDBOX === "true";

  if (!token) {
    logger.info("property: PROPERTY_API_KEY not set — stub mode");
    return {
      ownerName: null, ownershipYears: null,
      matchLevel: "unavailable", isCommercial: false, isVacant: false,
      reasons: ["Property lookup not configured"],
    };
  }

  const baseUrl = sandbox && process.env.NODE_ENV !== "production"
    ? "https://sandbox.estated.com/v4/property"
    : "https://apis.estated.com/v4/property";

  try {
    const params = new URLSearchParams({
      token,
      street_address: input.line1,
      city: input.city,
      state: input.state,
      zip_code: input.postalCode,
    });

    const res = await fetch(`${baseUrl}?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      throw new Error(`Estated API ${res.status}: ${await res.text()}`);
    }

    const data = await res.json() as EstatedResponse;

    // API-level error
    if (data.error) {
      logger.warn("property: Estated error", { code: data.error.code, desc: data.error.description });
      return {
        ownerName: null, ownershipYears: null,
        matchLevel: "unavailable", isCommercial: false, isVacant: false,
        reasons: ["Property not found for this address"],
      };
    }

    // No record found
    if (!data.data?.owner && (data.warnings?.length ?? 0) > 0) {
      return {
        ownerName: null, ownershipYears: null,
        matchLevel: "unavailable", isCommercial: false, isVacant: false,
        reasons: ["No property record found for this address"],
      };
    }

    const owner = data.data?.owner;
    const ownerName = owner?.name ?? null;
    const matchLevel = ownerName
      ? scoreNameMatch(input.submittedName, ownerName)
      : "unavailable";

    // Ownership years from most recent deed
    let ownershipYears: number | null = null;
    const deeds = data.data?.deeds ?? [];
    const latestDeed = deeds.sort((a, b) =>
      (b.recording_date ?? "").localeCompare(a.recording_date ?? "")
    )[0];
    if (latestDeed?.recording_date) {
      const year = parseInt(latestDeed.recording_date.slice(0, 4), 10);
      if (!isNaN(year) && year > 1900) {
        ownershipYears = new Date().getFullYear() - year;
      }
    }

    // Commercial/vacant from land use
    const landUse = (data.data?.parcel?.land_use ?? "").toLowerCase();
    const isCommercial = ["commercial", "industrial", "retail", "office", "warehouse"]
      .some((t) => landUse.includes(t));
    const isVacant = landUse.includes("vacant");
    const isOwnerOccupied = owner?.owner_occupied === "YES";

    const reasons: string[] = [];
    if (matchLevel === "none" && ownerName) {
      reasons.push(`Property owner on record "${ownerName}" — does not match submitted name`);
    } else if (matchLevel === "partial" && ownerName) {
      reasons.push(`Partial name match with property record: ${ownerName}`);
    } else if (matchLevel === "full") {
      reasons.push(`✓ Name matches property owner record`);
    }
    if (!isOwnerOccupied && ownerName) {
      reasons.push("Property does not appear to be owner-occupied");
    }
    if (isVacant) reasons.push("Property recorded as vacant");
    if (isCommercial) reasons.push("Address is a commercial property");

    logger.info("property: Estated lookup complete", {
      matchLevel, ownershipYears, isVacant, isCommercial, isOwnerOccupied,
    });

    return { ownerName, ownershipYears, matchLevel, isCommercial, isVacant, reasons };

  } catch (err) {
    logger.error("property: Estated lookup failed", { error: String(err) });
    return {
      ownerName: null, ownershipYears: null,
      matchLevel: "unavailable", isCommercial: false, isVacant: false,
      reasons: ["Property lookup failed — continuing without signal"],
    };
  }
}
