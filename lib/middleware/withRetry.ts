import { logger } from "@/lib/logger";

interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  label?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { attempts = 3, baseDelayMs = 300, label = "operation" } = opts;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        const delay = baseDelayMs * 2 ** (attempt - 1); // exponential backoff
        logger.warn(`${label} failed (attempt ${attempt}/${attempts}), retrying in ${delay}ms`, {
          error: String(err),
        });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
