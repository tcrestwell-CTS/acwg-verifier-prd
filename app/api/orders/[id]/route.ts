import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const order = await db.order.findUnique({
      where: { id: params.id },
      include: {
        verification: true,
        decisions: { orderBy: { decidedAt: "asc" } },
        auditLogs: { orderBy: { createdAt: "asc" }, take: 50 },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const latestDecision = order.decisions[order.decisions.length - 1];
    const currentStatus = latestDecision?.status ?? "queued";

    // Shape into the OrderRecord format the frontend expects
    const billing = order.billingAddress as Record<string, string>;
    const shipping = order.shippingAddress as Record<string, string>;
    const paymentMeta = order.paymentMeta as Record<string, string>;
    const context = order.context as Record<string, string>;
    const items = order.items as Array<{ sku: string; name: string; qty: number; price: number }>;

    const nameParts = order.customerName.split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ");

    return NextResponse.json({
      id: order.id,
      createdAt: order.createdAt.toISOString(),
      currentStatus,
      order: {
        customer: { firstName, lastName },
        contact: { email: order.email, phone: order.phone },
        billingAddress: billing,
        shippingAddress: shipping,
        items,
        paymentMeta,
        context,
      },
      verification: order.verification
        ? {
            address: order.verification.address,
            phone: order.verification.phone,
            email: order.verification.email,
            payment: order.verification.payment,
            ip: order.verification.ip,
            overall: order.verification.overall,
          }
        : null,
      history: order.decisions.map((d) => ({
        status: d.status,
        reasons: d.reasons as string[],
        notes: d.notes,
        decidedBy: d.decidedBy,
        decidedAt: d.decidedAt.toISOString(),
      })),
    });
  } catch (err) {
    logger.error("Failed to fetch order", { orderId: params.id, error: String(err) });
    return NextResponse.json({ error: "Failed to load order" }, { status: 500 });
  }
}
