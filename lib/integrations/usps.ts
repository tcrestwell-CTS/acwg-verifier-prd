import { logger } from "@/lib/logger";

// ── USPS Address Validation API (REST v3) ─────────────────────────────────────
// Docs: https://developer.usps.com/apis
// Requires: USPS_CLIENT_ID and USPS_CLIENT_SECRET from developer.usps.com
//
// Key signals returned:
//   dpv_confirmation: Y=confirmed, S=secondary needed, D=secondary missing, N=not found
//   dpv_cmra:         Y = Commercial Mail Receiving Agency (UPS Store, Mailboxes Etc.)
//   dpv_vacant:       Y = USPS confirmed no one at address
//   business:         Y = business address

const USPS_BASE = "https://api.usps.com";

// Token cache — USPS tokens are valid for ~8 hours
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.USPS_CLIENT_ID;
  const clientSecret = process.env.USPS_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < tokenExpiry - 300_000) {
    return cachedToken;
  }

  try {
    const res = await fetch(`${USPS_BASE}/oauth2/v3/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "addresses",
      }),
    });

    if (!res.ok) {
      logger.warn("USPS token request failed", { status: res.status });
      return null;
    }

    const data = await res.json() as {
      access_token?: string;
      expires_in?: number;
    };

    if (!data.access_token) return null;

    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in ?? 28800) * 1000;
    return cachedToken;

  } catch (err) {
    logger.warn("USPS token error", { error: String(err) });
    return null;
  }
}

export interface UspsAddressResult {
  confirmed: boolean;            // dpv_confirmation === "Y" or "S"
  dpvCode: "Y" | "S" | "D" | "N" | "U";
  cmra: boolean;                 // UPS Store / mailbox rental
  vacant: boolean;               // USPS confirmed vacant
  business: boolean;             // business address
  poBox: boolean;                // PO Box route type
  normalized?: {
    line1: string;
    city: string;
    state: string;
    postalCode: string;
  };
  error?: string;
}

export async function validateWithUsps(
  line1: string,
  city: string,
  state: string,
  zip: string
): Promise<UspsAddressResult | null> {
  const token = await getAccessToken();
  if (!token) return null; // USPS not configured — caller falls back to Smarty

  try {
    const params = new URLSearchParams({
      streetAddress: line1,
      city,
      state,
      ZIPCode: zip.slice(0, 5), // 5-digit only
    });

    const res = await fetch(
      `${USPS_BASE}/addresses/v3/address?${params}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(6000),
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn("USPS address API error", { status: res.status, body: body.slice(0, 200) });
      return null;
    }

    const data = await res.json() as {
      address?: {
        streetAddress?: string;
        streetAddressSuffix?: string;
        city?: string;
        state?: string;
        ZIPCode?: string;
        ZIPPlus4?: string;
      };
      additionalInfo?: {
        DPVConfirmation?: string;
        DPVCMRA?: string;
        DPVVacant?: string;
        business?: string;
        carrierRoute?: string;
      };
      error?: { code?: string; description?: string };
    };

    if (data.error) {
      logger.warn("USPS address not found", { error: data.error });
      return {
        confirmed: false,
        dpvCode: "N",
        cmra: false,
        vacant: false,
        business: false,
        poBox: false,
        error: data.error.description,
      };
    }

    const info = data.additionalInfo ?? {};
    const addr = data.address ?? {};

    const dpvRaw = (info.DPVConfirmation ?? "U").toUpperCase();
    const dpvCode = (["Y","S","D","N"].includes(dpvRaw) ? dpvRaw : "U") as UspsAddressResult["dpvCode"];
    const cmra    = info.DPVCMRA === "Y";
    const vacant  = info.DPVVacant === "Y";
    const business = info.business === "Y";
    // Carrier routes starting with 'B' are PO Box routes
    const poBox   = (info.carrierRoute ?? "").startsWith("B");

    const zip5 = addr.ZIPCode ?? zip.slice(0, 5);
    const zip4 = addr.ZIPPlus4;

    logger.info("USPS validation result", {
      line1, dpvCode, cmra, vacant, business, poBox,
    });

    return {
      confirmed: dpvCode === "Y" || dpvCode === "S",
      dpvCode,
      cmra,
      vacant,
      business,
      poBox,
      normalized: {
        line1: [addr.streetAddress, addr.streetAddressSuffix].filter(Boolean).join(" "),
        city: addr.city ?? city,
        state: addr.state ?? state,
        postalCode: zip4 ? `${zip5}-${zip4}` : zip5,
      },
    };

  } catch (err) {
    logger.warn("USPS validate error", { error: String(err) });
    return null;
  }
}
