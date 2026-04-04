import { logger } from "@/lib/logger";
import dns from "dns/promises";

export interface EmailCheckResult {
  disposable?: boolean;
  mxValid?: boolean;
  domainRisk: "low" | "medium" | "high";
  reasons: string[];
}

// Well-known disposable domain providers
const DISPOSABLE_DOMAINS = new Set([
  "tempmail.io", "mailinator.com", "guerrillamail.com", "10minutemail.com",
  "throwaway.email", "fakeinbox.com", "trashmail.com", "yopmail.com",
  "sharklasers.com", "guerrillamailblock.com", "grr.la", "guerrillamail.info",
  "spam4.me", "maildrop.cc", "spamgourmet.com", "spamgourmet.net",
  "dispostable.com", "trashmail.at", "trashmail.io", "trashmail.me",
  "temp-mail.org", "getnada.com", "moakt.com", "mintemail.com",
  "tempinbox.com", "throwam.com", "tempsky.com", "spambox.us",
  "mailnesia.com", "filzmail.com", "mytemp.email", "tempr.email",
]);

// High-risk TLDs
const HIGH_RISK_TLDS = new Set([".ru", ".cn", ".tk", ".ml", ".ga", ".cf", ".gq"]);

export async function checkEmail(email: string): Promise<EmailCheckResult> {
  const reasons: string[] = [];
  const parts = email.toLowerCase().split("@");

  if (parts.length !== 2 || !parts[1]) {
    return { disposable: false, mxValid: false, domainRisk: "high", reasons: ["Invalid email format"] };
  }

  const domain = parts[1];

  // Check disposable
  const isDisposable = DISPOSABLE_DOMAINS.has(domain) ||
    Array.from(DISPOSABLE_DOMAINS).some((d) => domain.endsWith(`.${d}`));

  // Check MX records
  let mxValid = false;
  try {
    const mxRecords = await dns.resolveMx(domain);
    mxValid = mxRecords.length > 0;
  } catch {
    mxValid = false;
    logger.debug("MX lookup failed", { domain });
  }

  // Check TLD risk
  const tld = "." + domain.split(".").slice(-1)[0];
  const highRiskTld = HIGH_RISK_TLDS.has(tld);

  // Known reputable providers
  const reputableDomains = new Set([
    "gmail.com", "yahoo.com", "outlook.com", "hotmail.com",
    "icloud.com", "me.com", "aol.com", "protonmail.com",
    "live.com", "msn.com",
  ]);
  const isReputable = reputableDomains.has(domain);

  // Determine domain risk
  let domainRisk: "low" | "medium" | "high" = "low";
  if (isDisposable || !mxValid || highRiskTld) {
    domainRisk = "high";
  } else if (!isReputable && !mxValid) {
    domainRisk = "medium";
  }

  // Build reasons
  if (isDisposable) reasons.push(`Disposable email domain: ${domain}`);
  if (!mxValid) reasons.push(`Domain ${domain} has no valid MX records`);
  if (highRiskTld) reasons.push(`High-risk TLD detected: ${tld}`);
  if (reasons.length === 0) {
    reasons.push(
      isReputable
        ? `Reputable email provider: ${domain}`
        : `Domain has valid MX records`
    );
  }

  return { disposable: isDisposable, mxValid, domainRisk, reasons };
}
