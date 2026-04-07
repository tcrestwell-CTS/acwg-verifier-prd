import { logger } from "@/lib/logger";

// ── USPS Address Validation API v3 ───────────────────────────────────────────
// Spec: addresses-v3r2_3.yaml + oauth2_update.yaml
// Base:  https://apis.usps.com  (note: apis not api)
// Token: POST https://apis.usps.com/oauth2/v3/token  (JSON body)
// Addr:  GET  https://apis.usps.com/addresses/v3/address
//
// Env vars required:
//   USPS_CLIENT_ID      — Consumer Key from developer.usps.com
//   USPS_CLIENT_SECRET  — Consumer Secret from developer.usps.com

const USPS_BASE  = "https://apis.usps.com";
const TOKEN_URL  = `${USPS_BASE}/oauth2/v3/token`;
const ADDR_URL   = `${USPS_BASE}/addresses/v3/address`;

// ── Token cache (tokens expire in ~28800s / 8 hours) ─────────────────────────
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string | null> {
  const clientId     = process.env.USPS_CLIENT_ID;
  const clientSecret = process.env.USPS_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  // Return cached token with 5-min buffer
  if (cachedToken && Date.now() < tokenExpiry - 300_000) {
    return cachedToken;
  }

  try {
    // USPS spec: token request accepts application/json OR form-urlencoded
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type:    "client_credentials",
        client_id:     clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn("USPS token request failed", { status: res.status, body: body.slice(0, 200) });
      return null;
    }

    const data = await res.json() as {
      access_token?: string;
      expires_in?:   number;
      error?:        string;
      error_description?: string;
    };

    if (data.error || !data.access_token) {
      logger.warn("USPS token error", { error: data.error, desc: data.error_description });
      return null;
    }

    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in ?? 28800) * 1000;
    logger.info("USPS token acquired", { expiresIn: data.expires_in });
    return cachedToken;

  } catch (err) {
    logger.warn("USPS token fetch error", { error: String(err) });
    return null;
  }
}

// ── Result type ───────────────────────────────────────────────────────────────
export interface UspsAddressResult {
  confirmed:  boolean;              // DPVConfirmation Y or S
  dpvCode:    "Y" | "S" | "D" | "N" | "U";
  cmra:       boolean;              // Commercial Mail Receiving Agency
  vacant:     boolean;              // USPS confirmed vacant
  business:   boolean;              // business address (non-residential)
  poBox:      boolean;              // carrier route starts with B = PO Box route
  normalized?: {
    line1:       string;
    line2?:      string;
    city:        string;
    state:       string;
    postalCode:  string;            // ZIP+4 when available
  };
  notFound?:  boolean;
  error?:     string;
}

// ── Main validation function ──────────────────────────────────────────────────
export async function validateWithUsps(
  line1:  string,
  city:   string,
  state:  string,
  zip:    string,
  line2?: string,
): Promise<UspsAddressResult | null> {

  const token = await getAccessToken();
  if (!token) return null;   // Not configured — caller falls back to Smarty

  try {
    const params = new URLSearchParams({
      streetAddress: line1,
      state:         state.toUpperCase().slice(0, 2),
    });

    if (city)     params.set("city",             city);
    if (zip)      params.set("ZIPCode",           zip.replace(/\D/g, "").slice(0, 5));
    if (line2)    params.set("secondaryAddress",  line2);

    const res = await fetch(`${ADDR_URL}?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept:        "application/json",
      },
      signal: AbortSignal.timeout(6000),
    });

    // 404 = address not found (valid API response, not an error)
    if (res.status === 404) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      logger.info("USPS address not found", { line1, city, state });
      return {
        confirmed: false,
        dpvCode:   "N",
        cmra:      false,
        vacant:    false,
        business:  false,
        poBox:     false,
        notFound:  true,
        error:     body?.error?.message,
      };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn("USPS address API error", { status: res.status, body: body.slice(0, 300) });
      // Token may be expired — clear cache so next call re-fetches
      if (res.status === 401) { cachedToken = null; tokenExpiry = 0; }
      return null;
    }

    // ── Parse response ────────────────────────────────────────────────────
    const data = await res.json() as {
      address?: {
        streetAddress?:           string;
        streetAddressAbbreviation?: string;
        secondaryAddress?:        string;
        city?:                    string;
        cityAbbreviation?:        string;
        state?:                   string;
        ZIPCode?:                 string;
        ZIPPlus4?:                string;
        [key: string]: unknown;
      };
      additionalInfo?: {
        DPVConfirmation?:  string;    // Y=full, S=secondary, D=secondary missing, N=no match
        DPVCMRA?:          string;    // Y = UPS Store / mailbox rental
        DPVVacant?:        string;    // Y = USPS confirmed vacant
        business?:         string;    // Y = business address
        carrierRoute?:     string;    // B### = PO Box route
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };

    const addr = data.address ?? {};
    const info = data.additionalInfo ?? {};

    const dpvRaw = (typeof info.DPVConfirmation === "string" ? info.DPVConfirmation : "U").toUpperCase();
    const dpvCode = (["Y","S","D","N"].includes(dpvRaw) ? dpvRaw : "U") as UspsAddressResult["dpvCode"];

    const cmra     = info.DPVCMRA     === "Y";
    const vacant   = info.DPVVacant   === "Y";
    const business = info.business    === "Y";
    const poBox    = typeof info.carrierRoute === "string" && info.carrierRoute.startsWith("B");

    const zip5   = typeof addr.ZIPCode  === "string" ? addr.ZIPCode  : zip.slice(0, 5);
    const zip4   = typeof addr.ZIPPlus4 === "string" ? addr.ZIPPlus4 : undefined;
    const street = typeof addr.streetAddress === "string" ? addr.streetAddress : line1;
    const sec    = typeof addr.secondaryAddress === "string" ? addr.secondaryAddress : undefined;

    logger.info("USPS validation result", { line1, dpvCode, cmra, vacant, business, poBox });

    return {
      confirmed:  dpvCode === "Y" || dpvCode === "S",
      dpvCode,
      cmra,
      vacant,
      business,
      poBox,
      normalized: {
        line1:      street,
        line2:      sec,
        city:       typeof addr.city  === "string" ? addr.city  : city,
        state:      typeof addr.state === "string" ? addr.state : state,
        postalCode: zip4 ? `${zip5}-${zip4}` : zip5,
      },
    };

  } catch (err) {
    logger.warn("USPS validate error", { error: String(err) });
    return null;
  }
}
