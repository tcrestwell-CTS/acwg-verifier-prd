// Phone: normalize to E.164 (US only for now)
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw; // return as-is if unknown format
}

// State: ensure 2-letter uppercase
export function normalizeState(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 2);
}

// ZIP: strip anything after a space
export function normalizeZip(raw: string): string {
  return raw.trim().split(" ")[0];
}

// Currency
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents);
}

// Date
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

// Risk score label
export function scoreLabel(score: number): string {
  if (score <= 25) return "Low Risk";
  if (score <= 60) return "Medium Risk";
  return "High Risk";
}

// Truncate
export function truncate(s: string, n = 40): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
