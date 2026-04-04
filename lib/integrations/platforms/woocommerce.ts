import { createHmac, timingSafeEqual } from "crypto";
import { logger } from "@/lib/logger";
import type { PlatformAdapter, NormalizedPlatformOrder, WritebackResult } from "./adapter";

interface WooAddress {
  first_name?: string; last_name?: string;
  address_1?: string; address_2?: string;
  city?: string; state?: string; postcode?: string;
  country?: string; phone?: string; email?: string;
}

interface WooLineItem {
  sku?: string; name?: string; quantity?: number; price?: number;
}

interface WooOrder {
  id?: number;
  billing?: WooAddress;
  shipping?: WooAddress;
  line_items?: WooLineItem[];
  total?: string;
  currency?: string;
  customer_ip_address?: string;
  customer_user_agent?: string;
  payment_method?: string;
}

export class WooCommerceAdapter implements PlatformAdapter {
  name = "woocommerce";

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

  parseWebhookOrder(rawBody: string, _eventType: string): NormalizedPlatformOrder | null {
    let data: WooOrder;
    try {
      data = JSON.parse(rawBody) as WooOrder;
    } catch {
      logger.error("WooCommerce webhook parse failed");
      return null;
    }

    const billing = data.billing ?? {};
    const shipping = data.shipping ?? billing;

    return {
      externalId: String(data.id ?? ""),
      platform: "woocommerce",
      customerName: `${billing.first_name ?? ""} ${billing.last_name ?? ""}`.trim(),
      email: billing.email ?? "",
      phone: billing.phone ?? undefined,
      billingAddress: {
        line1: billing.address_1 ?? "",
        line2: billing.address_2 ?? undefined,
        city: billing.city ?? "",
        state: billing.state ?? "",
        postalCode: billing.postcode ?? "",
        country: billing.country ?? "US",
      },
      shippingAddress: {
        line1: shipping.address_1 ?? "",
        line2: shipping.address_2 ?? undefined,
        city: shipping.city ?? "",
        state: shipping.state ?? "",
        postalCode: shipping.postcode ?? "",
        country: shipping.country ?? "US",
      },
      items: (data.line_items ?? []).map((li) => ({
        sku: li.sku ?? "unknown",
        name: li.name ?? "Item",
        qty: li.quantity ?? 1,
        price: li.price ?? 0,
      })),
      paymentMeta: { brand: data.payment_method },
      context: {
        ip: data.customer_ip_address ?? undefined,
        userAgent: data.customer_user_agent ?? undefined,
      },
      totalPrice: parseFloat(data.total ?? "0"),
      currency: data.currency ?? "USD",
    };
  }

  async writeDecisionBack(opts: {
    externalOrderId: string;
    decision: "approved" | "queued" | "denied";
    score: number;
    reasons: string[];
  }): Promise<WritebackResult> {
    const siteUrl = process.env.WOO_SITE_URL;
    const consumerKey = process.env.WOO_CONSUMER_KEY;
    const consumerSecret = process.env.WOO_CONSUMER_SECRET;

    if (!siteUrl || !consumerKey || !consumerSecret) {
      logger.warn("WooCommerce write-back not configured — stub mode");
      return { success: true, platform: "woocommerce", action: "stub" };
    }

    const note = `ACWG Fraud Score: ${opts.score}/100 — ${opts.decision.toUpperCase()}. ${opts.reasons.slice(0, 2).join("; ")}`;

    try {
      const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
      const res = await fetch(
        `${siteUrl}/wp-json/wc/v3/orders/${opts.externalOrderId}/notes`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ note, customer_note: false }),
        }
      );

      if (!res.ok) throw new Error(`WooCommerce API ${res.status}`);
      return { success: true, platform: "woocommerce", action: "note" };
    } catch (err) {
      logger.error("WooCommerce write-back failed", { error: String(err) });
      return { success: false, platform: "woocommerce", action: "note", error: String(err) };
    }
  }
}
