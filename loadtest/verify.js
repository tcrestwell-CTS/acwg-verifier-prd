/**
 * k6 Load Test — POST /api/verify
 *
 * Install k6: https://k6.io/docs/get-started/installation/
 * Run: k6 run loadtest/verify.js --env BASE_URL=https://acwg-verifier-prd.vercel.app
 *
 * Performance targets:
 *   p95 < 1200ms
 *   p99 < 2500ms
 *   error rate < 1%
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const errorRate = new Rate("error_rate");
const verifyDuration = new Trend("verify_duration", true);
const successCount = new Counter("verify_success");

export const options = {
  stages: [
    { duration: "30s", target: 10 },   // Ramp up
    { duration: "60s", target: 25 },   // Sustained load
    { duration: "30s", target: 50 },   // Peak (2x expected)
    { duration: "30s", target: 0 },    // Ramp down
  ],
  thresholds: {
    verify_duration: ["p(95)<1200", "p(99)<2500"],
    error_rate: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

const PAYLOADS = [
  // Clean order
  {
    customer: { firstName: "Sarah", lastName: "Mitchell" },
    contact: { email: "sarah@gmail.com", phone: "+14045550182" },
    billingAddress: { line1: "142 Peachtree St NW", city: "Atlanta", state: "GA", postalCode: "30303", country: "US" },
    shippingAddress: { line1: "142 Peachtree St NW", city: "Atlanta", state: "GA", postalCode: "30303", country: "US" },
    items: [{ sku: "TRV-001", name: "Carpet Sample", qty: 1, price: 50 }],
    paymentMeta: { cardLast4: "4242", bin: "424242", brand: "Visa" },
    context: { ip: "75.148.22.100" },
  },
  // Medium risk — cross-state shipping
  {
    customer: { firstName: "Derek", lastName: "Okafor" },
    contact: { email: "derek@outlook.com", phone: "+17705550934" },
    billingAddress: { line1: "500 Commerce St", city: "Nashville", state: "TN", postalCode: "37201", country: "US" },
    shippingAddress: { line1: "8820 Sunset Blvd", city: "Los Angeles", state: "CA", postalCode: "90069", country: "US" },
    items: [{ sku: "FLR-022", name: "Hardwood Flooring", qty: 2, price: 1200 }],
    paymentMeta: { cardLast4: "1117", bin: "411742", brand: "Mastercard" },
    context: { ip: "104.28.15.92" },
  },
  // High risk
  {
    customer: { firstName: "Alex", lastName: "Rivera" },
    contact: { email: "user@tempmail.io", phone: "+18005550100" },
    billingAddress: { line1: "123 Fake St", city: "Miami", state: "FL", postalCode: "33101", country: "US" },
    shippingAddress: { line1: "123 Fake St", city: "Miami", state: "FL", postalCode: "33101", country: "US" },
    items: [{ sku: "GRP-501", name: "Commercial Carpet", qty: 10, price: 5000 }],
    paymentMeta: { cardLast4: "0000", bin: "512345", brand: "Mastercard" },
    context: { ip: "185.220.101.52" },
  },
];

export default function () {
  const payload = PAYLOADS[Math.floor(Math.random() * PAYLOADS.length)];

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/verify`, JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    timeout: "10s",
  });
  const duration = Date.now() - start;

  verifyDuration.add(duration);

  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
    "has verification": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.verification !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (ok) {
    successCount.add(1);
    errorRate.add(0);
  } else {
    errorRate.add(1);
    console.log(`FAIL ${res.status}: ${res.body?.slice(0, 200)}`);
  }

  sleep(0.5); // Think time
}
