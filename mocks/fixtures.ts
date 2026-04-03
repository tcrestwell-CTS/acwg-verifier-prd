import type { OrderRecord } from "@/lib/schemas";

export const LOW_RISK_ORDER: OrderRecord = {
  id: "ord_001",
  createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  currentStatus: "approved",
  order: {
    customer: { firstName: "Sarah", lastName: "Mitchell" },
    contact: { email: "sarah.mitchell@gmail.com", phone: "+14045550182" },
    billingAddress: {
      line1: "142 Peachtree St NW",
      city: "Atlanta",
      state: "GA",
      postalCode: "30303",
      country: "US",
    },
    shippingAddress: {
      line1: "142 Peachtree St NW",
      city: "Atlanta",
      state: "GA",
      postalCode: "30303",
      country: "US",
    },
    items: [
      { sku: "TRV-001", name: "Caribbean Cruise Deposit", qty: 1, price: 500 },
    ],
    paymentMeta: { cardLast4: "4242", bin: "424242", brand: "Visa" },
    context: { ip: "75.148.22.100" },
  },
  verification: {
    address: {
      dpv: "Y",
      deliverable: true,
      residential: false,
      distanceKm: 0,
      normalized: {
        line1: "142 PEACHTREE ST NW",
        city: "ATLANTA",
        state: "GA",
        postalCode: "30303",
        country: "US",
      },
      reasons: ["Address confirmed deliverable"],
    },
    phone: {
      carrier: "AT&T",
      type: "mobile",
      active: true,
      riskScore: 12,
      e164: "+14045550182",
      reasons: ["Active mobile number"],
    },
    email: {
      disposable: false,
      mxValid: true,
      domainRisk: "low",
      reasons: ["Domain has valid MX records", "Not a disposable provider"],
    },
    payment: {
      avs: "Y",
      cvv: "M",
      binCountry: "US",
      binType: "credit",
      reasons: ["AVS match", "CVV match"],
    },
    ip: {
      country: "US",
      proxy: false,
      vpn: false,
      distanceToShipKm: 8,
      reasons: ["IP geolocation matches shipping area"],
    },
    overall: { score: 0, decision: "approved", reasons: [] },
  },
  history: [
    {
      status: "approved",
      reasons: ["All checks passed"],
      decidedBy: "System Auto-Approve",
      decidedAt: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
    },
  ],
};

export const MEDIUM_RISK_ORDER: OrderRecord = {
  id: "ord_002",
  createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  currentStatus: "queued",
  order: {
    customer: { firstName: "Derek", lastName: "Okafor" },
    contact: { email: "d.okafor89@outlook.com", phone: "+17705550934" },
    billingAddress: {
      line1: "500 Commerce St",
      city: "Nashville",
      state: "TN",
      postalCode: "37201",
      country: "US",
    },
    shippingAddress: {
      line1: "8820 Sunset Blvd",
      city: "Los Angeles",
      state: "CA",
      postalCode: "90069",
      country: "US",
    },
    items: [
      {
        sku: "HST-022",
        name: "All-Inclusive Resort Package",
        qty: 2,
        price: 1200,
      },
    ],
    paymentMeta: { cardLast4: "1117", bin: "411742", brand: "Mastercard" },
    context: { ip: "104.28.15.92" },
  },
  verification: {
    address: {
      dpv: "Y",
      deliverable: true,
      residential: false,
      distanceKm: 3150,
      normalized: {
        line1: "8820 SUNSET BLVD",
        city: "LOS ANGELES",
        state: "CA",
        postalCode: "90069",
        country: "US",
      },
      reasons: ["Billing/shipping addresses are 3,150 km apart"],
    },
    phone: {
      carrier: "T-Mobile",
      type: "mobile",
      active: true,
      riskScore: 28,
      e164: "+17705550934",
      reasons: ["Active mobile number"],
    },
    email: {
      disposable: false,
      mxValid: true,
      domainRisk: "low",
      reasons: ["Outlook.com is a legitimate provider"],
    },
    payment: {
      avs: "P",
      cvv: "M",
      binCountry: "US",
      binType: "credit",
      reasons: ["AVS partial match — ZIP matched but street did not"],
    },
    ip: {
      country: "US",
      proxy: false,
      vpn: false,
      distanceToShipKm: 120,
      reasons: ["IP near Los Angeles — consistent with shipping"],
    },
    overall: {
      score: 40,
      decision: "queued",
      reasons: [
        "Billing/shipping addresses are 3,150 km apart",
        "AVS partial match",
      ],
    },
  },
  history: [
    {
      status: "queued",
      reasons: ["Billing/shipping distance exceeds threshold", "AVS partial"],
      decidedBy: "System",
      decidedAt: new Date(Date.now() - 1000 * 60 * 88).toISOString(),
    },
  ],
};

export const HIGH_RISK_ORDER: OrderRecord = {
  id: "ord_003",
  createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  currentStatus: "queued",
  order: {
    customer: { firstName: "Alex", lastName: "Rivera" },
    contact: {
      email: "user_7291@tempmail.io",
      phone: "+18005550100",
    },
    billingAddress: {
      line1: "123 Fake Street",
      city: "Miami",
      state: "FL",
      postalCode: "33101",
      country: "US",
    },
    shippingAddress: {
      line1: "999 Ocean Dr",
      city: "Miami Beach",
      state: "FL",
      postalCode: "33139",
      country: "US",
    },
    items: [
      {
        sku: "GRP-501",
        name: "Group Charter Deposit",
        qty: 1,
        price: 5000,
      },
    ],
    paymentMeta: { cardLast4: "0000", bin: "512345", brand: "Mastercard" },
    context: { ip: "185.220.101.52" },
  },
  verification: {
    address: {
      dpv: "N",
      deliverable: false,
      residential: false,
      distanceKm: 12,
      reasons: [
        "Address not found in USPS database",
        "DPV code N — non-deliverable",
      ],
    },
    phone: {
      type: "voip",
      active: false,
      riskScore: 91,
      reasons: ["VoIP number", "Appears disconnected", "High risk score (91)"],
    },
    email: {
      disposable: true,
      mxValid: false,
      domainRisk: "high",
      reasons: [
        "Disposable email domain (tempmail.io)",
        "No valid MX records",
      ],
    },
    payment: {
      avs: "N",
      cvv: "N",
      binCountry: "US",
      binType: "prepaid",
      reasons: [
        "AVS failed — address does not match",
        "CVV failed",
        "Prepaid card BIN",
      ],
    },
    ip: {
      country: "NL",
      proxy: true,
      vpn: false,
      distanceToShipKm: 8900,
      reasons: [
        "IP originates from Netherlands",
        "Known Tor exit node / proxy",
        "IP is 8,900 km from shipping address",
      ],
    },
    overall: {
      score: 95,
      decision: "denied",
      reasons: [
        "Address non-deliverable",
        "Disposable email",
        "AVS + CVV failure",
        "Proxy IP from Netherlands",
        "VoIP disconnected phone",
      ],
    },
  },
  history: [
    {
      status: "queued",
      reasons: ["Flagged for manual review"],
      decidedBy: "System",
      decidedAt: new Date(Date.now() - 1000 * 60 * 13).toISOString(),
    },
  ],
};

export const MOCK_ORDERS: OrderRecord[] = [
  LOW_RISK_ORDER,
  MEDIUM_RISK_ORDER,
  HIGH_RISK_ORDER,
];
