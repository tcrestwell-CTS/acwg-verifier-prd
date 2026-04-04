import { logger } from "@/lib/logger";

export interface DeviceSignals {
  fingerprintId: string | null;
  riskScore: number;          // 0–100
  isBot: boolean;
  isEmulator: boolean;
  isKnownDevice: boolean;
  browserFamily: string | null;
  reasons: string[];
}

interface DeviceInput {
  ip: string;
  userAgent?: string;
  fingerprintToken?: string; // client-side fingerprint token if collected
}

/**
 * Device Intelligence stub.
 *
 * In production: wire to FingerprintJS Pro, ThreatMetrix, or Sift.
 * Set DEVICE_INTEL_API_KEY and DEVICE_INTEL_ENDPOINT in env.
 */
export async function checkDevice(input: DeviceInput): Promise<DeviceSignals> {
  const apiKey = process.env.DEVICE_INTEL_API_KEY;

  if (!apiKey) {
    logger.info("device: not configured — returning stub signals");
    return stubSignals(input);
  }

  try {
    const res = await fetch("https://api.fpjs.io/events", {
      method: "POST",
      headers: {
        "Auth-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId: input.fingerprintToken,
        ip: input.ip,
        userAgent: input.userAgent,
      }),
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) throw new Error(`Device API ${res.status}`);

    const data = await res.json() as {
      visitorId?: string;
      bot?: { probability?: number };
      vpn?: { result?: boolean };
    };

    const botProbability = data.bot?.probability ?? 0;

    return {
      fingerprintId: data.visitorId ?? null,
      riskScore: Math.round(botProbability * 100),
      isBot: botProbability > 0.8,
      isEmulator: false,
      isKnownDevice: !!data.visitorId,
      browserFamily: null,
      reasons: [],
    };
  } catch (err) {
    logger.error("device: check failed", { error: String(err) });
    return stubSignals(input);
  }
}

function stubSignals(input: DeviceInput): DeviceSignals {
  const ua = (input.userAgent ?? "").toLowerCase();
  const isHeadless = ua.includes("headless") || ua.includes("phantom") || ua.includes("selenium");

  return {
    fingerprintId: null,
    riskScore: isHeadless ? 85 : 10,
    isBot: isHeadless,
    isEmulator: false,
    isKnownDevice: false,
    browserFamily: ua.includes("chrome") ? "Chrome" : ua.includes("firefox") ? "Firefox" : null,
    reasons: isHeadless
      ? ["Headless browser detected in user agent"]
      : ["Device API not configured — stub signals used"],
  };
}
