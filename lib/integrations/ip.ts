import { logger } from "@/lib/logger";
import type { Address } from "@/lib/schemas";

export interface IpCheckResult {
  country?: string;
  proxy?: boolean;
  vpn?: boolean;
  distanceToShipKm?: number;
  reasons: string[];
}

// Known proxy/Tor IP ranges (simplified — production uses IPQS or MaxMind)
const KNOWN_PROXY_RANGES = [
  "185.220.", "185.107.", "185.100.",  // Common Tor exit nodes
  "104.28.", "172.67.",                // Cloudflare proxies (if not legit)
  "45.142.", "91.108.", "149.154.",    // Known VPN ranges
];

function isKnownProxy(ip: string): boolean {
  return KNOWN_PROXY_RANGES.some((prefix) => ip.startsWith(prefix));
}

// Simple lat/lon lookup via ip-api.com (free, 45 req/min, no key needed)
async function geolocateIp(ip: string): Promise<{
  country?: string;
  lat?: number;
  lon?: number;
  proxy?: boolean;
  hosting?: boolean;
}> {
  if (!ip || ip === "127.0.0.1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return { country: "US" }; // Private/local IP
  }

  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,lat,lon,proxy,hosting`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return {};
    const data = await res.json() as {
      status?: string;
      country?: string;
      countryCode?: string;
      lat?: number;
      lon?: number;
      proxy?: boolean;
      hosting?: boolean;
    };
    if (data.status !== "success") return {};
    return {
      country: data.countryCode,
      lat: data.lat,
      lon: data.lon,
      proxy: data.proxy || data.hosting,
    };
  } catch (err) {
    logger.warn("IP geolocation failed", { ip, error: String(err) });
    return {};
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

// Rough geocoordinates for US state centers (fallback when no lat/lon from IP)
const STATE_COORDS: Record<string, [number, number]> = {
  AL: [32.8, -86.8], AK: [64.2, -153.4], AZ: [34.3, -111.1],
  AR: [34.9, -92.4], CA: [36.8, -119.4], CO: [39.0, -105.5],
  CT: [41.6, -72.7], DE: [39.0, -75.5], FL: [27.8, -81.5],
  GA: [32.2, -82.9], HI: [20.0, -156.0], ID: [44.4, -114.5],
  IL: [40.0, -89.2], IN: [40.3, -86.1], IA: [42.1, -93.5],
  KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.2, -92.1],
  ME: [44.7, -69.4], MD: [39.1, -76.8], MA: [42.3, -71.8],
  MI: [44.3, -85.4], MN: [46.4, -93.1], MS: [32.7, -89.7],
  MO: [38.5, -92.5], MT: [47.0, -110.0], NE: [41.5, -99.9],
  NV: [39.3, -116.6], NH: [43.7, -71.6], NJ: [40.1, -74.5],
  NM: [34.5, -106.2], NY: [42.2, -74.9], NC: [35.6, -79.8],
  ND: [47.5, -100.5], OH: [40.4, -82.8], OK: [35.6, -96.9],
  OR: [43.9, -120.6], PA: [40.6, -77.2], RI: [41.7, -71.5],
  SC: [33.9, -80.9], SD: [44.4, -100.2], TN: [35.9, -86.7],
  TX: [31.1, -97.6], UT: [39.3, -111.1], VT: [44.1, -72.7],
  VA: [37.5, -78.9], WA: [47.4, -120.6], WV: [38.5, -80.8],
  WI: [44.3, -89.6], WY: [42.8, -107.3],
};

export async function checkIp(
  ip: string | undefined,
  shippingAddress: Address
): Promise<IpCheckResult> {
  const reasons: string[] = [];

  if (!ip) {
    return { reasons: ["No IP address provided — geo check skipped"] };
  }

  const geoData = await geolocateIp(ip);
  const isProxyPattern = isKnownProxy(ip);
  const isProxy = geoData.proxy ?? isProxyPattern;
  const country = geoData.country;

  if (isProxy) {
    reasons.push("IP address routes through a known proxy, VPN, or hosting provider");
  }

  // Calculate distance to shipping
  let distanceToShipKm: number | undefined;

  if (geoData.lat && geoData.lon) {
    // Use IP geolocation coordinates
    const stateCoords = STATE_COORDS[shippingAddress.state.toUpperCase()];
    if (stateCoords) {
      distanceToShipKm = haversineKm(
        geoData.lat, geoData.lon,
        stateCoords[0], stateCoords[1]
      );
    }
  } else if (country === "US") {
    // Estimate based on state
    const stateCoords = STATE_COORDS[shippingAddress.state.toUpperCase()];
    if (stateCoords) {
      // Unknown exact location within US — assume moderate distance
      distanceToShipKm = 200;
    }
  } else if (country && country !== "US") {
    // International IP → large distance
    distanceToShipKm = 8000;
    reasons.push(`IP geolocation: ${country} — does not match domestic shipping address`);
  }

  if (distanceToShipKm !== undefined && distanceToShipKm > 800) {
    reasons.push(
      `IP is approximately ${Math.round(distanceToShipKm).toLocaleString()} km from shipping address`
    );
  }

  if (reasons.length === 0) {
    reasons.push("IP geolocation is consistent with shipping region");
  }

  return {
    country,
    proxy: isProxy,
    vpn: false, // separate VPN detection requires a premium API
    distanceToShipKm,
    reasons,
  };
}
