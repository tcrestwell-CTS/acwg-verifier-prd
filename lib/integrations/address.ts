import { logger } from "@/lib/logger";
import type { Address } from "@/lib/schemas";

export interface AddressCheckResult {
  dpv: "Y" | "N" | "S" | "D" | "U";
  deliverable: boolean;
  apartmentNeeded?: boolean;
  residential: boolean;
  poBox?: boolean;         // detected via regex on address line
  cmra?: boolean;          // Commercial Mail Receiving Agency (UPS Store, etc.) — from Smarty
  vacant?: boolean;        // USPS confirmed vacant address
  distanceKm?: number;
  normalized?: Address;
  reasons: string[];
}

// ── Haversine distance ────────────────────────────────────────────────────────

function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Smarty adapter ────────────────────────────────────────────────────────────

async function callSmarty(address: Address): Promise<{
  dpvMatchCode?: string;
  dpvVacant?: string;
  dpvNoStat?: string;
  rdi?: string;
  components?: { zipCode?: string; plus4Code?: string };
  metadata?: { latitude?: number; longitude?: number };
  normalized?: Address;
  dpvCmra?: string;
} & { notFound?: boolean }> {
  const authId = process.env.SMARTY_AUTH_ID;
  const authToken = process.env.SMARTY_AUTH_TOKEN;

  if (!authId || !authToken) {
    logger.warn("Smarty credentials not configured — using stub");
    return { dpvMatchCode: "Y", rdi: "Residential" };
  }

  const params = new URLSearchParams({
    "auth-id": authId,
    "auth-token": authToken,
    street: address.line1,
    city: address.city,
    state: address.state,
    zipcode: address.postalCode,
    candidates: "1",
  });

  const res = await fetch(
    `https://us-street.api.smartystreets.com/street-address?${params}`
  );

  if (!res.ok) {
    throw new Error(`Smarty API error: ${res.status}`);
  }

  const data = (await res.json()) as Array<{
    deliverability?: string;
    dpv_match_code?: string;
    dpv_vacant?: string;
    dpv_no_stat?: string;
    dpv_cmra?: string;
    metadata?: { rdi?: string; latitude?: number; longitude?: number };
    components?: {
      primary_number?: string;
      street_name?: string;
      street_suffix?: string;
      city_name?: string;
      state_abbreviation?: string;
      zipcode?: string;
      plus4_code?: string;
    };
  }>;

  if (!data || data.length === 0) {
    // Address not found in USPS database — likely fake or doesn't exist
    logger.warn("Address not found in Smarty database", { address });
    return { dpvMatchCode: "N", notFound: true };
  }

  const result = data[0];
  const c = result.components;

  return {
    dpvMatchCode: result.dpv_match_code ?? "U",
    dpvVacant: result.dpv_vacant,
    dpvNoStat: result.dpv_no_stat,
    dpvCmra: result.dpv_cmra,
    rdi: result.metadata?.rdi,
    metadata: result.metadata,
    normalized: c
      ? {
          line1: `${c.primary_number ?? ""} ${c.street_name ?? ""} ${c.street_suffix ?? ""}`.trim(),
          city: c.city_name ?? address.city,
          state: c.state_abbreviation ?? address.state,
          postalCode: c.plus4_code
            ? `${c.zipcode}-${c.plus4_code}`
            : (c.zipcode ?? address.postalCode),
          country: address.country ?? "US",
        }
      : undefined,
  };
}


// ── PO Box / CMRA detection ───────────────────────────────────────────────────

const PO_BOX_REGEX = /\b(p\.?\s*o\.?\s*box|post\s+office\s+box|pob|po\s+box)\b/i;

function isPoBox(line1: string): boolean {
  return PO_BOX_REGEX.test(line1);
}

// ── Public adapter ────────────────────────────────────────────────────────────

export async function checkAddress(
  shipping: Address,
  billing: Address
): Promise<AddressCheckResult> {
  const reasons: string[] = [];

  try {
    const [shipResult, billResult] = await Promise.all([
      callSmarty(shipping),
      callSmarty(billing),
    ]);

    const dpvCode = (shipResult.dpvMatchCode ?? "U") as "Y" | "N" | "S" | "D" | "U";
    // Deliverable: confirmed by DPV code, OR address normalized successfully (Smarty found it)
    const deliverable = dpvCode === "Y" || dpvCode === "S" || (dpvCode === "U" && !!shipResult.normalized);
    const residential = shipResult.rdi === "Residential";
    const apartmentNeeded = dpvCode === "S" || dpvCode === "D";
    const addressNotFound = shipResult.notFound === true;
    const billNotFound = billResult.notFound === true;

    // PO Box detection — regex on raw input
    const shipPoBox = isPoBox(shipping.line1) || (shipping.line2 ? isPoBox(shipping.line2) : false);
    const billPoBox = isPoBox(billing.line1) || (billing.line2 ? isPoBox(billing.line2) : false);
    const poBox = shipPoBox || billPoBox;

    // CMRA — Smarty confirms this is a mail forwarding business (UPS Store, Mailboxes Etc.)
    const shipCmra = shipResult.dpvCmra === "Y";
    const billCmra = billResult.dpvCmra === "Y";
    const cmra = shipCmra || billCmra;

    // Vacant — USPS confirmed no one lives or operates there
    const vacant = shipResult.dpvVacant === "Y";

    // Flag non-existent addresses — even with 3rd party delivery, the address must exist
    if (addressNotFound) reasons.push("Shipping address does not exist — not found in address database");
    if (billNotFound) reasons.push("Billing address does not exist — not found in address database");
    if (!addressNotFound && apartmentNeeded) reasons.push("Apartment or unit number appears missing");

    // PO Box / CMRA / Vacant flags
    if (shipPoBox) reasons.push("Shipping address is a PO Box — cannot deliver carpet to a PO Box");
    if (billPoBox) reasons.push("Billing address is a PO Box");
    if (shipCmra) reasons.push("Shipping address is a commercial mail receiving agency (UPS Store / mailbox rental)");
    if (billCmra) reasons.push("Billing address is a commercial mail receiving agency — not a residence or business");
    if (vacant) reasons.push("Shipping address is confirmed vacant by USPS");

    // Estimate distance using lat/lon if available
    let distanceKm: number | undefined;
    const shipMeta = shipResult.metadata;
    const billMeta = billResult.metadata;

    if (
      shipMeta?.latitude && shipMeta?.longitude &&
      billMeta?.latitude && billMeta?.longitude
    ) {
      distanceKm = haversineKm(
        billMeta.latitude, billMeta.longitude,
        shipMeta.latitude, shipMeta.longitude
      );
    } else {
      // Fallback: compare state/ZIP to estimate distance
      const sameState = shipping.state === billing.state;
      const sameZip = shipping.postalCode.slice(0, 3) === billing.postalCode.slice(0, 3);
      if (sameZip) distanceKm = 0;
      else if (sameState) distanceKm = 80;
      else distanceKm = 800; // conservative cross-state estimate
    }

    if (distanceKm > 500) {
      reasons.push(
        `Billing and shipping addresses are ~${Math.round(distanceKm).toLocaleString()} km apart`
      );
    }

    if (reasons.length === 0) reasons.push("Address verified and deliverable");

    return {
      dpv: dpvCode,
      deliverable,
      apartmentNeeded,
      residential,
      poBox,
      cmra,
      vacant,
      distanceKm,
      normalized: shipResult.normalized ?? {
        line1: shipping.line1.toUpperCase(),
        line2: shipping.line2?.toUpperCase(),
        city: shipping.city.toUpperCase(),
        state: shipping.state.toUpperCase(),
        postalCode: shipping.postalCode,
        country: shipping.country ?? "US",
      },
      reasons,
    };
  } catch (err) {
    logger.error("Address check failed", { error: String(err) });
    return {
      dpv: "U",
      deliverable: false,
      residential: false,
      reasons: ["Address verification service unavailable — manual review recommended"],
    };
  }
}
