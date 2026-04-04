import { NextRequest, NextResponse } from "next/server";
import { WooCommerceAdapter } from "@/lib/integrations/platforms/woocommerce";
import { processWebhookEvent } from "@/lib/services/webhookService";

const adapter = new WooCommerceAdapter();

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-wc-webhook-signature") ?? "";
  const eventType = req.headers.get("x-wc-webhook-topic") ?? "order.created";
  const deliveryId = req.headers.get("x-wc-webhook-delivery-id") ?? undefined;
  const secret = process.env.WOO_WEBHOOK_SECRET ?? "";

  if (!secret) {
    return NextResponse.json({ error: "WooCommerce webhook secret not configured" }, { status: 503 });
  }

  const rawBody = await req.text();

  const result = await processWebhookEvent({
    adapter,
    eventType,
    rawBody,
    signature,
    secret,
    idempotencyKey: deliveryId ? `woo:${deliveryId}` : undefined,
  });

  if (result.status === "invalid") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ received: true, status: result.status });
}
