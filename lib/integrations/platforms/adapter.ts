/**
 * Platform Adapter Interface
 *
 * All ecommerce platform adapters implement this interface.
 * This allows the webhook pipeline and write-back service to be
 * platform-agnostic.
 */

export interface NormalizedPlatformOrder {
  externalId: string;        // platform-native order ID
  platform: string;          // "shopify" | "woocommerce"
  customerName: string;
  email: string;
  phone?: string;
  billingAddress: {
    line1: string; line2?: string; city: string;
    state: string; postalCode: string; country: string;
  };
  shippingAddress: {
    line1: string; line2?: string; city: string;
    state: string; postalCode: string; country: string;
  };
  items: Array<{ sku: string; name: string; qty: number; price: number }>;
  paymentMeta: { cardLast4?: string; bin?: string; brand?: string };
  context: { ip?: string; userAgent?: string };
  totalPrice: number;
  currency: string;
  rawPayload?: Record<string, unknown>;
}

export interface WritebackResult {
  success: boolean;
  platform: string;
  action: string;
  error?: string;
}

export interface PlatformAdapter {
  name: string;

  /** Verify that an incoming webhook payload is authentic */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean;

  /** Parse a raw webhook body into a normalized order */
  parseWebhookOrder(
    rawBody: string,
    eventType: string
  ): NormalizedPlatformOrder | null;

  /** Write a decision back to the platform (tags, notes, metafields) */
  writeDecisionBack(opts: {
    externalOrderId: string;
    decision: "approved" | "queued" | "denied";
    score: number;
    reasons: string[];
  }): Promise<WritebackResult>;
}
