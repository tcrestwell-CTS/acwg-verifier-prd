import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { writeAuditLog } from "@/lib/audit";
import { decisionLimiter } from "@/lib/middleware/rateLimit";

const DecisionInputSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(["approved", "queued", "denied"]),
  reasons: z.array(z.string()).min(1, "At least one reason required"),
  notes: z.string().optional(),
  decidedBy: z.string().min(1),
  decidedAt: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const rateLimitResponse = decisionLimiter(req);
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = DecisionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { orderId, status, decisionType, reasons, notes, decidedBy, decidedAt } = parsed.data;

  // Verify order exists
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  try {
    const decision = await db.decision.create({
      data: {
        orderId,
        status,
        reasons: reasons as string[],
        notes: notes ?? null,
        decidedBy,
        decidedAt: decidedAt ? new Date(decidedAt) : new Date(),
      },
    });

    await writeAuditLog({
      orderId,
      actor: decidedBy,
      action: "decision",
      payload: { status, reasonCount: reasons.length, hasNotes: !!notes },
    });

    logger.info("Decision recorded", { orderId, status, decidedBy });

    return NextResponse.json({ ok: true, decisionId: decision.id });
  } catch (err) {
    logger.error("Decision persist failed", { orderId, error: String(err) });
    return NextResponse.json({ error: "Failed to record decision" }, { status: 500 });
  }
}
