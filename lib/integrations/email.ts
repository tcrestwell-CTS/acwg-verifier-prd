import { logger } from "@/lib/logger";
import dns from "dns/promises";

export interface EmailCheckResult {
  disposable?: boolean;
  mxValid?: boolean;
  smtpExists?: boolean | null;
  domainRisk: "low" | "medium" | "high";
  reasons: string[];
}

// ── Extended disposable domain list ──────────────────────────────────────────
// Top 100+ known disposable providers — updated regularly
const DISPOSABLE_DOMAINS = new Set([
  // Classic disposables
  "tempmail.io", "mailinator.com", "guerrillamail.com", "10minutemail.com",
  "throwaway.email", "fakeinbox.com", "trashmail.com", "yopmail.com",
  "sharklasers.com", "guerrillamail.info", "spam4.me", "maildrop.cc",
  "spamgourmet.com", "spamgourmet.net", "dispostable.com", "trashmail.at",
  "trashmail.io", "trashmail.me", "temp-mail.org", "getnada.com",
  "moakt.com", "mintemail.com", "tempinbox.com", "throwam.com",
  "tempsky.com", "spambox.us", "mailnesia.com", "filzmail.com",
  "mytemp.email", "tempr.email",
  // Additional high-volume disposables
  "guerrillamail.biz", "guerrillamail.de", "guerrillamail.net",
  "guerrillamail.org", "grr.la", "spam.la", "weg-werf-email.de",
  "wegwerfmail.de", "wegwerfmail.net", "wegwerfmail.org",
  "mailnull.com", "spamgob.com", "spamhole.com", "spamoff.de",
  "spaml.de", "spamspot.com", "spamthis.co.uk", "spamtrail.com",
  "speed.1s.fr", "supergreatmail.com", "suremail.info", "svk.jp",
  "sweetxxx.de", "tafmail.com", "tagyourself.com", "teewars.org",
  "teleworm.com", "teleworm.us", "tempalias.com", "tempe-mail.com",
  "tempemail.co.za", "tempemail.com", "tempemail.net", "tempinbox.co.uk",
  "tempmail.eu", "tempmailer.com", "tempmailer.de", "tempomail.fr",
  "temporarily.de", "temporaryemail.net", "temporaryforwarding.com",
  "temporaryinbox.com", "temporarymailaddress.com", "thankyou2010.com",
  "thecloudindex.com", "thetimezone.com", "throwam.com", "throwam.net",
  "tilien.com", "tmail.com", "tmailinator.com", "toiea.com",
  "tradermail.info", "trash-amil.com", "trash-mail.at", "trash-mail.cf",
  "trash-mail.ga", "trash-mail.ml", "trash-mail.tk", "trash2009.com",
  "trash2010.com", "trash2011.com", "trashdevil.com", "trashdevil.de",
  "trashemail.de", "trashimail.com", "trashmailer.com", "trbvm.com",
  "trommlermail.de", "turual.com", "twinmail.de", "tyldd.com",
  "uggsrock.com", "umail.net", "uroid.com", "username.e4ward.com",
  "veryrealemail.com", "viditag.com", "viralplays.com", "vomoto.com",
  "vpn.st", "vsimcard.com", "vubby.com", "walala.org", "wasteland.rr.nu",
  "watch-harry-potter.com", "webemail.me", "webm4il.info",
  "weg-werf-email.de", "wh4f.org", "whyspam.me", "willhackforfood.biz",
  "wilemail.com", "winemaven.info", "wronghead.com", "www.e4ward.com",
  "wuzupmail.net", "xagloo.com", "xemaps.com", "xents.com",
  "xmaily.com", "xoxy.net", "xyzfree.net", "yapped.net", "yeah.net",
  "yep.it", "yogamaven.com", "yopmail.fr", "yopmail.pp.ua",
  "yourdomain.com", "yuurok.com", "z1p.biz", "za.com", "zehnminutenmail.de",
  "zippymail.info", "zoaxe.com", "zoemail.net", "zoemail.org",
  "zomg.info", "zxcv.com", "zxcvbnm.com", "zzz.com",
  // More common ones
  "getairmail.com", "fakemail.net", "mailexpire.com", "spamfree24.org",
  "mt2014.com", "mt2015.com", "mt2016.com", "mt2017.com",
  "discard.email", "discardmail.com", "discardmail.de",
  "spamgourmet.com", "spamgourmet.net", "spamgourmet.org",
  "inboxkitten.com", "tempmail.ninja", "harakirimail.com",
  "notmailinator.com", "mailsac.com", "mailseal.de",
]);

// ── SMTP mailbox verification ────────────────────────────────────────────────
// Connects to the domain's mail server and checks if the mailbox actually exists
// Uses RCPT TO command — no email is sent
// Some major providers (Gmail, Outlook) block RCPT probing — falls back gracefully

import net from "net";

async function smtpVerify(email: string, domain: string): Promise<{
  exists: boolean | null;  // null = server blocked probe
  reason: string;
}> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ exists: null, reason: "SMTP timeout — server did not respond" });
    }, 6000);

    let buffer = "";
    let step = 0;
    const socket = net.createConnection(25, domain);
    socket.setTimeout(6000);

    const send = (cmd: string) => socket.write(cmd + "
");

    const cleanup = () => {
      clearTimeout(timeout);
      socket.destroy();
    };

    socket.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("
");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const code = parseInt(line.slice(0, 3), 10);

        if (step === 0 && code === 220) {
          step = 1;
          send("EHLO acwg-verifier.crestwellgetaways.com");
        } else if (step === 1 && (code === 250 || code === 220)) {
          step = 2;
          send("MAIL FROM:<verify@crestwellgetaways.com>");
        } else if (step === 2 && code === 250) {
          step = 3;
          send(`RCPT TO:<${email}>`);
        } else if (step === 3) {
          cleanup();
          if (code === 250 || code === 251) {
            resolve({ exists: true, reason: "Mailbox confirmed by mail server" });
          } else if (code === 550 || code === 551 || code === 553 || code === 554) {
            resolve({ exists: false, reason: `Mailbox does not exist (SMTP ${code})` });
          } else if (code === 421 || code === 450 || code === 451 || code === 452) {
            resolve({ exists: null, reason: `Server temporarily unavailable (SMTP ${code})` });
          } else {
            // 550-series with catch-all, or server blocked probe
            resolve({ exists: null, reason: `Server blocked SMTP probe (code ${code})` });
          }
        } else if (code >= 500 && step < 3) {
          cleanup();
          resolve({ exists: null, reason: "Server rejected connection" });
        }
      }
    });

    socket.on("error", (err: Error) => {
      cleanup();
      // Port 25 blocked (Vercel blocks outbound port 25) — try IPQS instead
      resolve({ exists: null, reason: `SMTP unavailable: ${err.message.slice(0, 60)}` });
    });

    socket.on("timeout", () => {
      cleanup();
      resolve({ exists: null, reason: "SMTP connection timed out" });
    });
  });
}

// ── IPQS email check (uses same API key as identity intelligence) ─────────────

interface IPQSEmailResponse {
  success?: boolean;
  fraud_score?: number;
  valid?: boolean;
  disposable?: boolean;
  smtp_score?: number;
  overall_score?: number;
  recent_abuse?: boolean;
  leaked?: boolean;
  suspect?: boolean;
  domain_velocity?: string;
  message?: string;
}

async function checkViaIPQS(email: string): Promise<IPQSEmailResponse | null> {
  const apiKey = process.env.IDENTITY_INTEL_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://ipqualityscore.com/api/json/email/${apiKey}/${encodeURIComponent(email)}?strictness=1&timeout=7`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    return await res.json() as IPQSEmailResponse;
  } catch {
    return null;
  }
}

// ── High-risk TLDs ────────────────────────────────────────────────────────────

const HIGH_RISK_TLDS = new Set([".ru", ".cn", ".tk", ".ml", ".ga", ".cf", ".gq", ".pw", ".top", ".xyz"]);

const REPUTABLE_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "me.com", "aol.com", "protonmail.com", "live.com", "msn.com",
  "comcast.net", "att.net", "verizon.net", "sbcglobal.net", "bellsouth.net",
  "charter.net", "cox.net", "earthlink.net",
]);

// ── Main email check ──────────────────────────────────────────────────────────

export async function checkEmail(email: string): Promise<EmailCheckResult> {
  const reasons: string[] = [];
  const parts = email.toLowerCase().trim().split("@");

  if (parts.length !== 2 || !parts[1]) {
    return { disposable: false, mxValid: false, domainRisk: "high", reasons: ["Invalid email format"] };
  }

  const domain = parts[1];
  const tld = "." + domain.split(".").slice(-1)[0];
  const highRiskTld = HIGH_RISK_TLDS.has(tld);
  const isReputable = REPUTABLE_DOMAINS.has(domain);

  // 1. Check local disposable list first (fast, free)
  const isDisposableLocal = DISPOSABLE_DOMAINS.has(domain) ||
    Array.from(DISPOSABLE_DOMAINS).some((d) => domain.endsWith(`.${d}`));

  // 2. Check MX records
  let mxValid = false;
  try {
    const mxRecords = await dns.resolveMx(domain);
    mxValid = mxRecords.length > 0;
  } catch {
    mxValid = false;
  }

  // 3. SMTP mailbox verification (only if MX is valid — no point checking if domain has no mail server)
  let smtpExists: boolean | null = null;
  let smtpReason = "";
  if (mxValid && !isDisposableLocal) {
    const smtpResult = await smtpVerify(email, domain);
    smtpExists = smtpResult.exists;
    smtpReason = smtpResult.reason;
    logger.info("email: SMTP check", { email, exists: smtpExists, reason: smtpReason });
  }

  // 4. IPQS check for deeper analysis (if configured)
  const ipqs = await checkViaIPQS(email);

  const isDisposable = isDisposableLocal || (ipqs?.disposable ?? false);
  const fraudScore = ipqs?.fraud_score ?? 0;
  const recentAbuse = ipqs?.recent_abuse ?? false;
  const suspect = ipqs?.suspect ?? false;
  const leaked = ipqs?.leaked ?? false;

  // No MX records = domain doesn't exist = fake email
  if (!mxValid) {
    reasons.push(`Email domain "${domain}" has no mail server — address cannot receive mail`);
  }
  // SMTP mailbox check
  if (smtpExists === false) {
    reasons.push(`Mailbox "${email}" does not exist — confirmed by mail server`);
  } else if (smtpExists === true) {
    reasons.push(`✓ Mailbox confirmed by mail server`);
  }
  if (isDisposable) reasons.push(`Disposable/throwaway email domain: ${domain}`);
  if (highRiskTld) reasons.push(`High-risk top-level domain: ${tld}`);
  if (recentAbuse) reasons.push("Email address associated with recent fraud or abuse");
  if (suspect) reasons.push("Email flagged as suspicious by fraud intelligence");
  if (leaked) reasons.push("Email found in data breach records");
  if (fraudScore >= 75) reasons.push(`Email fraud score: ${fraudScore}/100`);

  // Determine domain risk
  let domainRisk: "low" | "medium" | "high" = "low";
  if (isDisposable || !mxValid || highRiskTld || fraudScore >= 75 || suspect || smtpExists === false) {
    domainRisk = "high";
  } else if (!isReputable || recentAbuse || fraudScore >= 50) {
    domainRisk = "medium";
  }

  if (reasons.length === 0) {
    reasons.push(isReputable
      ? `Reputable email provider: ${domain}`
      : `Email domain verified (valid MX records)`);
  }

  logger.info("email check complete", { domain, mxValid, isDisposable, fraudScore, domainRisk });

  return { disposable: isDisposable, mxValid, smtpExists, domainRisk, reasons };
}
