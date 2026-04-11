import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth("reviewer");
  if (error) return error;

  const { orderId, managerCode } = await req.json();
  if (!orderId || !managerCode) {
    return NextResponse.json({ error: "orderId and managerCode required" }, { status: 400 });
  }

  try {
    // Find the escalation audit log for this order
    const escalation = await db.auditLog.findFirst({
      where: {
        orderId,
        action: "manager_escalation",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!escalation) {
      return NextResponse.json({ error: "No escalation found for this order" }, { status: 404 });
    }

    const payload = escalation.payload as { overrideCode?: string; overrideUsed?: boolean };

    if (payload.overrideUsed) {
      return NextResponse.json({ error: "Override code has already been used" }, { status: 400 });
    }

    if (!payload.overrideCode || payload.overrideCode !== managerCode.toUpperCase()) {
      await writeAuditLog({
        orderId,
        actor: (session as { user?: { email?: string } } | null)?.user?.email ?? "rep",
        action: "manager_override_failed",
        payload: { attempt: managerCode.slice(0, 2) + "****" },
      });
      return NextResponse.json({ error: "Invalid override code" }, { status: 401 });
    }

    // Mark override as used
    await db.auditLog.update({
      where: { id: escalation.id },
      data: { payload: { ...payload, overrideUsed: true, overrideUsedAt: new Date().toISOString() } as object },
    });

    await writeAuditLog({
      orderId,
      actor: (session as { user?: { email?: string } } | null)?.user?.email ?? "rep",
      action: "manager_override_granted",
      payload: { note: "Manager override code accepted — order cleared for processing" },
    });

    logger.info("Manager override granted", { orderId });
    return NextResponse.json({ ok: true, overrideGranted: true });

  } catch (err) {
    logger.error("Manager override check failed", { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
