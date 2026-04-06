import { db } from "@/lib/db";

export interface VelocityResult {
  score: number;
  signals: string[];
  isReturningCustomer: boolean;
  priorOrderCount: number;
  priorFraudCount: number;
  cardOrderCount24h: number;
  cardOrderCount7d: number;
  emailOrderCount24h: number;
  phoneOrderCount24h: number;
  uniqueShippingAddresses7d: number;
  requiresOtp: boolean;
  requiresDocVerification: boolean;
}

interface VelocityInput {
  email: string;
  phone: string;
  cardLast4?: string;
  bin?: string;
  shippingAddress: { line1: string; city: string; state: string; postalCode: string };
  orderTotal: number;
}

const HIGH_VALUE_THRESHOLD = 500;   // orders above this get extra scrutiny
const OTP_THRESHOLD = 5000;         // orders above this require OTP
const CARD_VELOCITY_24H = 3;        // same card 3+ orders in 24h
const CARD_VELOCITY_7D = 8;

export async function checkVelocity(input: VelocityInput): Promise<VelocityResult> {
  const now = new Date();
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const ago7d  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const normalEmail = input.email.toLowerCase().trim();
  const normalPhone = input.phone.replace(/\D/g, "");

  // ── Run all lookups in parallel ───────────────────────────────────────────

  const [
    priorByEmail,
    priorByPhone,
    recentByCard,
    recentEmailOrders,
    recentPhoneOrders,
    deniedOrders,
  ] = await Promise.all([
    // Prior orders by email (30d)
    db.order.findMany({
      where: { email: { equals: normalEmail, mode: "insensitive" }, createdAt: { gte: ago30d } },
      include: { decisions: { orderBy: { decidedAt: "desc" }, take: 1 } },
    }),

    // Prior orders by phone (30d)
    db.order.findMany({
      where: { phone: { contains: normalPhone.slice(-7) }, createdAt: { gte: ago30d } },
      select: { id: true, decisions: { select: { status: true }, orderBy: { decidedAt: "desc" }, take: 1 } },
    }),

    // Orders with same card in 24h and 7d
    input.cardLast4
      ? db.order.findMany({
          where: {
            paymentMeta: { path: ["cardLast4"], equals: input.cardLast4 },
            createdAt: { gte: ago7d },
          },
          select: { id: true, createdAt: true, shippingAddress: true },
        })
      : Promise.resolve([]),

    // Recent orders by email (24h)
    db.order.count({
      where: { email: { equals: normalEmail, mode: "insensitive" }, createdAt: { gte: ago24h } },
    }),

    // Recent orders by phone (24h)
    db.order.count({
      where: { phone: { contains: normalPhone.slice(-7) }, createdAt: { gte: ago24h } },
    }),

    // Denied orders by email (30d)
    db.decision.count({
      where: {
        status: "denied",
        order: { email: { equals: normalEmail, mode: "insensitive" } },
        decidedAt: { gte: ago30d },
      },
    }),
  ]);

  // ── Compute signals ───────────────────────────────────────────────────────

  const score = { value: 0 };
  const signals: string[] = [];

  const priorOrderCount = priorByEmail.length;
  const priorFraudCount = deniedOrders;
  const isReturningCustomer = priorOrderCount > 0;

  // Card velocity
  const cardOrders24h = recentByCard.filter((o) => o.createdAt >= ago24h);
  const cardOrderCount24h = cardOrders24h.length;
  const cardOrderCount7d = recentByCard.length;

  if (cardOrderCount24h >= CARD_VELOCITY_24H) {
    score.value += 30;
    signals.push(`Same card used in ${cardOrderCount24h} orders in the last 24 hours`);
  } else if (cardOrderCount7d >= CARD_VELOCITY_7D) {
    score.value += 15;
    signals.push(`Same card used in ${cardOrderCount7d} orders in the last 7 days`);
  }

  // Unique shipping addresses with same card in 7d
  const uniqueShipping = new Set(
    recentByCard.map((o) => {
      const addr = o.shippingAddress as { postalCode?: string; city?: string };
      return `${addr.city ?? ""}:${addr.postalCode ?? ""}`;
    })
  );
  const uniqueShippingAddresses7d = uniqueShipping.size;

  if (uniqueShippingAddresses7d >= 3) {
    score.value += 20;
    signals.push(`Card has shipped to ${uniqueShippingAddresses7d} different addresses in 7 days`);
  }

  // Email velocity
  const emailOrderCount24h = recentEmailOrders;
  if (emailOrderCount24h >= 3) {
    score.value += 15;
    signals.push(`Email used in ${emailOrderCount24h} orders in the last 24 hours`);
  }

  // Phone velocity
  const phoneOrderCount24h = recentPhoneOrders;
  if (phoneOrderCount24h >= 3) {
    score.value += 10;
    signals.push(`Phone used in ${phoneOrderCount24h} orders in the last 24 hours`);
  }

  // Prior fraud history
  if (priorFraudCount > 0) {
    score.value += 35;
    signals.push(`Email has ${priorFraudCount} previously denied order(s) in the last 30 days`);
  }

  // ── Positive signals (returning customer with good history) ───────────────

  const priorApproved = priorByEmail.filter(
    (o) => o.decisions[0]?.status === "approved"
  ).length;

  if (isReturningCustomer && priorApproved >= 3 && priorFraudCount === 0) {
    score.value -= 20; // trusted returning customer
    signals.push(`Trusted returning customer: ${priorApproved} successful prior orders`);
  } else if (isReturningCustomer && priorFraudCount === 0) {
    score.value -= 10;
    signals.push(`Returning customer with clean history`);
  } else if (!isReturningCustomer) {
    if (input.orderTotal > HIGH_VALUE_THRESHOLD) {
      score.value += 15;
      signals.push(`First-time customer with high-value order ($${input.orderTotal})`);
    }
  }

  // ── Enforcement rules ─────────────────────────────────────────────────────

  const requiresOtp =
    input.orderTotal >= OTP_THRESHOLD ||
    priorFraudCount > 0 ||
    cardOrderCount24h >= 2;

  const requiresDocVerification =
    priorFraudCount > 0 ||
    (cardOrderCount24h >= CARD_VELOCITY_24H && input.orderTotal > HIGH_VALUE_THRESHOLD);

  return {
    score: Math.max(-20, score.value), // cap negative at -20
    signals,
    isReturningCustomer,
    priorOrderCount,
    priorFraudCount,
    cardOrderCount24h,
    cardOrderCount7d,
    emailOrderCount24h,
    phoneOrderCount24h,
    uniqueShippingAddresses7d,
    requiresOtp,
    requiresDocVerification,
  };
}
