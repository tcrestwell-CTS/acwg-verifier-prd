import { db } from "./db";
import { logger } from "./logger";

export async function writeAuditLog(opts: {
  orderId?: string;
  actor: string;
  action: string;
  payload: Record<string, unknown>;
}) {
  try {
    await db.auditLog.create({
      data: {
        orderId: opts.orderId ?? null,
        actor: opts.actor,
        action: opts.action,
        payload: opts.payload,
      },
    });
  } catch (err) {
    // Audit failures should never crash the main flow
    logger.error("Failed to write audit log", {
      error: String(err),
      action: opts.action,
      orderId: opts.orderId,
    });
  }
}
