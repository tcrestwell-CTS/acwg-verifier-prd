import { NextRequest, NextResponse } from "next/server";
import { ShopifyAdapter } from "@/lib/integrations/platforms/shopify";
import { processWebhookEvent } from "@/lib/services/webhookService";

const adapter = new ShopifyAdapter();

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-shopify-hmac-sha256") ?? "";
  const eventType = req.headers.get("x-shopify-topic") ?? "";
  const idempotencyKey = req.headers.get("x-shopify-webhook-id") ?? undefined;
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET ?? "";

  if (!secret) {
    return NextResponse.json({ error: "Shopify webhook secret not configured" }, { status: 503 });
  }

  const rawBody = await req.text();

  const result = await processWebhookEvent({
    adapter,
    eventType,
    rawBody,
    signature,
    secret,
    idempotencyKey,
  });

  if (result.status === "invalid") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Always return 200 to Shopify — processing happens async
  return NextResponse.json({ received: true, status: result.status });
}
