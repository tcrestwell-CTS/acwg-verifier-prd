import { createHmac, timingSafeEqual } from "crypto";
import { logger } from "@/lib/logger";
import type { PlatformAdapter, NormalizedPlatformOrder, WritebackResult } from "./adapter";

interface ShopifyAddress {
  address1?: string;
  address2?: string;
  city?: string;
  province_code?: string;
  zip?: string;
  country_code?: string;
  phone?: string;
}

interface ShopifyLineItem {
  sku?: string;
  title?: string;
  quantity?: number;
  price?: string;
}

interface ShopifyOrder {
  id?: number;
  email?: string;
  phone?: string;
  billing_address?: ShopifyAddress;
  shipping_address?: ShopifyAddress;
  line_items?: ShopifyLineItem[];
  total_price?: string;
  currency?: string;
  customer?: { first_name?: string; last_name?: string };
  payment_details?: { credit_card_company?: string; credit_card_number?: string };
  browser_ip?: string;
  client_details?: { user_agent?: string };
}

export class ShopifyAdapter implements PlatformAdapter {
  name = "shopify";

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    try {
      const expected = createHmac("sha256", secret)
        .update(payload, "utf8")
        .digest("base64");
      const expectedBuf = Buffer.from(expected);
      const receivedBuf = Buffer.from(signature);
      if (expectedBuf.length !== receivedBuf.length) return false;
      return timingSafeEqual(expectedBuf, receivedBuf);
    } catch {
      return false;
    }
  }

  parseWebhookOrder(rawBody: string, eventType: string): NormalizedPlatformOrder | null {
    if (!eventType.startsWith("orders/")) return null;

    let data: ShopifyOrder;
    try {
      data = JSON.parse(rawBody) as ShopifyOrder;
    } catch {
      logger.error("Shopify webhook parse failed");
      return null;
    }

    const billing = data.billing_address ?? {};
    const shipping = data.shipping_address ?? billing;
    const customer = data.customer ?? {};
    const last4 = data.payment_details?.credit_card_number?.slice(-4);

    return {
      externalId: String(data.id ?? ""),
      platform: "shopify",
      customerName: `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim(),
      email: data.email ?? "",
      phone: data.phone ?? billing.phone ?? undefined,
      billingAddress: {
        line1: billing.address1 ?? "",
        line2: billing.address2 ?? undefined,
        city: billing.city ?? "",
        state: billing.province_code ?? "",
        postalCode: billing.zip ?? "",
        country: billing.country_code ?? "US",
      },
      shippingAddress: {
        line1: shipping.address1 ?? "",
        line2: shipping.address2 ?? undefined,
        city: shipping.city ?? "",
        state: shipping.province_code ?? "",
        postalCode: shipping.zip ?? "",
        country: shipping.country_code ?? "US",
      },
      items: (data.line_items ?? []).map((li) => ({
        sku: li.sku ?? "unknown",
        name: li.title ?? "Item",
        qty: li.quantity ?? 1,
        price: parseFloat(li.price ?? "0"),
      })),
      paymentMeta: {
        cardLast4: last4,
        brand: data.payment_details?.credit_card_company,
      },
      context: {
        ip: data.browser_ip ?? undefined,
        userAgent: data.client_details?.user_agent ?? undefined,
      },
      totalPrice: parseFloat(data.total_price ?? "0"),
      currency: data.currency ?? "USD",
    };
  }

  async writeDecisionBack(opts: {
    externalOrderId: string;
    decision: "approved" | "queued" | "denied";
    score: number;
    reasons: string[];
  }): Promise<WritebackResult> {
    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!shopDomain || !accessToken) {
      logger.warn("Shopify write-back not configured — stub mode");
      return { success: true, platform: "shopify", action: "stub" };
    }

    const tag = `acwg:${opts.decision}`;
    const note = `ACWG Fraud Score: ${opts.score}/100 — ${opts.decision.toUpperCase()}`;

    try {
      const res = await fetch(
        `https://${shopDomain}/admin/api/2024-04/orders/${opts.externalOrderId}.json`,
        {
          method: "PUT",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            order: { id: opts.externalOrderId, tags: tag, note },
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Shopify API ${res.status}: ${await res.text()}`);
      }

      return { success: true, platform: "shopify", action: "tag+note" };
    } catch (err) {
      logger.error("Shopify write-back failed", { error: String(err) });
      return { success: false, platform: "shopify", action: "tag+note", error: String(err) };
    }
  }
}
