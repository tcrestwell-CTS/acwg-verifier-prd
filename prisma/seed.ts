import { PrismaClient, DecisionStatus } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clean existing data
  await prisma.auditLog.deleteMany();
  await prisma.decision.deleteMany();
  await prisma.verificationResult.deleteMany();
  await prisma.order.deleteMany();

  // ── Order 1: Low Risk (Sarah Mitchell) ───────────────────────────────────
  const order1 = await prisma.order.create({
    data: {
      customerName: "Sarah Mitchell",
      email: "sarah.mitchell@gmail.com",
      phone: "+14045550182",
      billingAddress: { line1: "142 Peachtree St NW", city: "Atlanta", state: "GA", postalCode: "30303", country: "US" },
      shippingAddress: { line1: "142 Peachtree St NW", city: "Atlanta", state: "GA", postalCode: "30303", country: "US" },
      items: [{ sku: "TRV-001", name: "Caribbean Cruise Deposit", qty: 1, price: 500 }],
      paymentMeta: { cardLast4: "4242", bin: "424242", brand: "Visa" },
      context: { ip: "75.148.22.100", userAgent: "Mozilla/5.0" },
    },
  });

  await prisma.verificationResult.create({
    data: {
      orderId: order1.id,
      address: { dpv: "Y", deliverable: true, residential: false, distanceKm: 0, normalized: { line1: "142 PEACHTREE ST NW", city: "ATLANTA", state: "GA", postalCode: "30303", country: "US" }, reasons: ["Address confirmed deliverable"] },
      phone: { carrier: "AT&T", type: "mobile", active: true, riskScore: 12, e164: "+14045550182", reasons: ["Active mobile number"] },
      email: { disposable: false, mxValid: true, domainRisk: "low", reasons: ["Domain has valid MX records"] },
      payment: { avs: "Y", cvv: "M", binCountry: "US", binType: "credit", reasons: ["AVS match", "CVV match"] },
      ip: { country: "US", proxy: false, vpn: false, distanceToShipKm: 8, reasons: ["IP matches shipping area"] },
      overall: { score: 0, decision: "approved", reasons: [] },
    },
  });

  await prisma.decision.create({
    data: { orderId: order1.id, status: DecisionStatus.approved, reasons: ["All checks passed"], decidedBy: "System", decidedAt: new Date() },
  });

  // ── Order 2: Medium Risk (Derek Okafor) ──────────────────────────────────
  const order2 = await prisma.order.create({
    data: {
      customerName: "Derek Okafor",
      email: "d.okafor89@outlook.com",
      phone: "+17705550934",
      billingAddress: { line1: "500 Commerce St", city: "Nashville", state: "TN", postalCode: "37201", country: "US" },
      shippingAddress: { line1: "8820 Sunset Blvd", city: "Los Angeles", state: "CA", postalCode: "90069", country: "US" },
      items: [{ sku: "HST-022", name: "All-Inclusive Resort Package", qty: 2, price: 1200 }],
      paymentMeta: { cardLast4: "1117", bin: "411742", brand: "Mastercard" },
      context: { ip: "104.28.15.92" },
    },
  });

  await prisma.verificationResult.create({
    data: {
      orderId: order2.id,
      address: { dpv: "Y", deliverable: true, residential: false, distanceKm: 3150, reasons: ["Billing/shipping 3,150 km apart"] },
      phone: { carrier: "T-Mobile", type: "mobile", active: true, riskScore: 28, e164: "+17705550934", reasons: ["Active mobile number"] },
      email: { disposable: false, mxValid: true, domainRisk: "low", reasons: ["Legitimate provider"] },
      payment: { avs: "P", cvv: "M", binCountry: "US", binType: "credit", reasons: ["AVS partial match"] },
      ip: { country: "US", proxy: false, vpn: false, distanceToShipKm: 120, reasons: ["IP near shipping"] },
      overall: { score: 40, decision: "queued", reasons: ["Billing/shipping distance exceeds threshold", "AVS partial match"] },
    },
  });

  await prisma.decision.create({
    data: { orderId: order2.id, status: DecisionStatus.queued, reasons: ["Distance exceeds threshold"], decidedBy: "System", decidedAt: new Date() },
  });

  // ── Order 3: High Risk (Alex Rivera) ─────────────────────────────────────
  const order3 = await prisma.order.create({
    data: {
      customerName: "Alex Rivera",
      email: "user_7291@tempmail.io",
      phone: "+18005550100",
      billingAddress: { line1: "123 Fake Street", city: "Miami", state: "FL", postalCode: "33101", country: "US" },
      shippingAddress: { line1: "999 Ocean Dr", city: "Miami Beach", state: "FL", postalCode: "33139", country: "US" },
      items: [{ sku: "GRP-501", name: "Group Charter Deposit", qty: 1, price: 5000 }],
      paymentMeta: { cardLast4: "0000", bin: "512345", brand: "Mastercard" },
      context: { ip: "185.220.101.52" },
    },
  });

  await prisma.verificationResult.create({
    data: {
      orderId: order3.id,
      address: { dpv: "N", deliverable: false, residential: false, distanceKm: 12, reasons: ["Address not in USPS database"] },
      phone: { type: "voip", active: false, riskScore: 91, reasons: ["VoIP", "Disconnected"] },
      email: { disposable: true, mxValid: false, domainRisk: "high", reasons: ["Disposable domain"] },
      payment: { avs: "N", cvv: "N", binCountry: "US", binType: "prepaid", reasons: ["AVS failed", "CVV failed"] },
      ip: { country: "NL", proxy: true, vpn: false, distanceToShipKm: 8900, reasons: ["Proxy detected"] },
      overall: { score: 95, decision: "denied", reasons: ["Non-deliverable address", "Disposable email", "AVS+CVV failure", "Proxy IP"] },
    },
  });

  await prisma.decision.create({
    data: { orderId: order3.id, status: DecisionStatus.queued, reasons: ["Flagged for review"], decidedBy: "System", decidedAt: new Date() },
  });

  console.log(`✅ Seeded 3 orders`);

  // ── Default superadmin user ───────────────────────────────────────────────
  const defaultPassword = process.env.ADMIN_SEED_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await hash(defaultPassword, 12);

  await prisma.adminUser.upsert({
    where: { email: "admin@acwg.net" },
    update: {},
    create: {
      email: "admin@acwg.net",
      name: "ACWG Admin",
      passwordHash,
      role: "superadmin",
      active: true,
    },
  });

  console.log(`✅ Admin user: admin@acwg.net / ${defaultPassword}`);
  console.log("⚠️  Change this password immediately after first login");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
