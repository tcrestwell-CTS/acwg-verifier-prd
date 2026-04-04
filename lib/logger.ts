type LogLevel = "info" | "warn" | "error" | "debug";

const PII_KEYS = new Set([
  "cardNumber", "pan", "fullCardNumber", "ssn", "password",
  "cvv", "cvc", "securityCode", "rawCard",
]);

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 6 || obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (PII_KEYS.has(k)) {
      out[k] = "[REDACTED]";
    } else if (k === "cardLast4" || k === "bin") {
      // Allow last4 and BIN through — these are safe signals
      out[k] = v;
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? redact(meta) as Record<string, unknown> : {}),
  };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else if (level === "warn") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "development") log("debug", msg, meta);
  },
};
