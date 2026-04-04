import { logger } from "@/lib/logger";

export interface IdentitySignals {
  confidence: number;           // 0–100
  nameAddressMatch: boolean;
  emailLinked: boolean;
  phoneLinked: boolean;
  reasons: string[];
}

interface IdentityInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  billingAddress: {
    line1: string; city: string; state: string; postalCode: string;
  };
}

/**
 * Identity Intelligence stub.
 *
 * In production: wire to LexisNexis ThreatMetrix, Socure, or SEON.
 * Set IDENTITY_INTEL_API_KEY and IDENTITY_INTEL_ENDPOINT in env.
 *
 * Returns conservative safe defaults when not configured.
 */
export async function checkIdentity(input: IdentityInput): Promise<IdentitySignals> {
  const apiKey = process.env.IDENTITY_INTEL_API_KEY;
  const endpoint = process.env.IDENTITY_INTEL_ENDPOINT;

  if (!apiKey || !endpoint) {
    logger.info("identity: not configured — returning stub signals");
    return stubSignals(input);
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        address: input.billingAddress,
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) throw new Error(`Identity API ${res.status}`);

    const data = await res.json() as {
      confidence?: number;
      nameAddressMatch?: boolean;
      emailLinked?: boolean;
      phoneLinked?: boolean;
    };

    return {
      confidence: data.confidence ?? 50,
      nameAddressMatch: data.nameAddressMatch ?? false,
      emailLinked: data.emailLinked ?? false,
      phoneLinked: data.phoneLinked ?? false,
      reasons: [],
    };
  } catch (err) {
    logger.error("identity: check failed — using stub", { error: String(err) });
    return stubSignals(input);
  }
}

function stubSignals(input: IdentityInput): IdentitySignals {
  // Basic heuristic stubs until real API is wired
  const hasFullName = input.firstName.length > 1 && input.lastName.length > 1;
  const isRealEmail = !input.email.includes("temp") && !input.email.includes("fake");

  return {
    confidence: hasFullName && isRealEmail ? 60 : 30,
    nameAddressMatch: hasFullName,
    emailLinked: isRealEmail,
    phoneLinked: false,
    reasons: ["Identity API not configured — stub signals used"],
  };
}
