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
  submittedName: string; // cardholder name to match against
}

/**
 * Property Ownership stub.
 *
 * In production: wire to ATTOM Data, CoreLogic, or similar property data API.
 * Set PROPERTY_API_KEY and PROPERTY_API_ENDPOINT in env.
 */
export async function checkProperty(input: PropertyInput): Promise<PropertySignals> {
  const apiKey = process.env.PROPERTY_API_KEY;
  const endpoint = process.env.PROPERTY_API_ENDPOINT;

  if (!apiKey || !endpoint) {
    logger.info("property: not configured — returning stub signals");
    return {
      ownerName: null,
      ownershipYears: null,
      matchLevel: "unavailable",
      isCommercial: false,
      isVacant: false,
      reasons: ["Property API not configured — stub signals used"],
    };
  }

  try {
    const res = await fetch(
      `${endpoint}?address=${encodeURIComponent(`${input.line1}, ${input.city}, ${input.state} ${input.postalCode}`)}`,
      {
        headers: { "X-API-Key": apiKey },
        signal: AbortSignal.timeout(3000),
      }
    );

    if (!res.ok) throw new Error(`Property API ${res.status}`);

    const data = await res.json() as {
      ownerName?: string;
      ownershipYears?: number;
      isCommercial?: boolean;
      isVacant?: boolean;
    };

    const ownerName = data.ownerName ?? null;
    const submittedUpper = input.submittedName.toUpperCase();
    const ownerUpper = (ownerName ?? "").toUpperCase();

    let matchLevel: PropertySignals["matchLevel"] = "none";
    if (ownerName) {
      const nameParts = submittedUpper.split(" ");
      const allMatch = nameParts.every((p) => ownerUpper.includes(p));
      const anyMatch = nameParts.some((p) => ownerUpper.includes(p));
      if (allMatch) matchLevel = "full";
      else if (anyMatch) matchLevel = "partial";
    }

    return {
      ownerName,
      ownershipYears: data.ownershipYears ?? null,
      matchLevel,
      isCommercial: data.isCommercial ?? false,
      isVacant: data.isVacant ?? false,
      reasons: [],
    };
  } catch (err) {
    logger.error("property: check failed", { error: String(err) });
    return {
      ownerName: null, ownershipYears: null,
      matchLevel: "unavailable", isCommercial: false, isVacant: false,
      reasons: ["Property lookup failed — continuing without signal"],
    };
  }
}
