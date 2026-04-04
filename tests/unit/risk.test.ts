import { computeRisk } from "@/lib/risk";
import type { VerificationResult } from "@/lib/schemas";

const baseVerification: VerificationResult = {
  address: {
    dpv: "Y",
    deliverable: true,
    residential: true,
    distanceKm: 0,
    reasons: [],
  },
  phone: { type: "mobile", active: true, riskScore: 10, reasons: [] },
  email: { disposable: false, mxValid: true, domainRisk: "low", reasons: [] },
  payment: { avs: "Y", cvv: "M", binCountry: "US", binType: "credit", reasons: [] },
  ip: { country: "US", proxy: false, vpn: false, distanceToShipKm: 15, reasons: [] },
  overall: { score: 0, decision: "approved", reasons: [] },
};

describe("computeRisk", () => {
  it("returns score 0 and approved for a clean order", () => {
    const result = computeRisk(baseVerification);
    expect(result.score).toBe(0);
    expect(result.decision).toBe("approved");
    expect(result.reasons).toHaveLength(0);
  });

  it("adds +20 for non-Y DPV", () => {
    const v: VerificationResult = {
      ...baseVerification,
      address: { ...baseVerification.address, dpv: "N", deliverable: false },
    };
    const result = computeRisk(v);
    expect(result.components.address).toBeGreaterThanOrEqual(20);
    expect(result.decision).toBe("approved"); // score 20 is still ≤ 25 → approved
  });

  it("adds +15 for billing/shipping distance > 500km", () => {
    const v: VerificationResult = {
      ...baseVerification,
      address: { ...baseVerification.address, distanceKm: 3000 },
    };
    const result = computeRisk(v);
    expect(result.components.address).toBeGreaterThanOrEqual(15);
    expect(result.reasons.some((r) => r.includes("km apart"))).toBe(true);
  });

  it("adds +10 for VoIP phone", () => {
    const v: VerificationResult = {
      ...baseVerification,
      phone: { ...baseVerification.phone, type: "voip" },
    };
    const result = computeRisk(v);
    expect(result.components.phone).toBeGreaterThanOrEqual(10);
  });

  it("adds +15 for disposable email", () => {
    const v: VerificationResult = {
      ...baseVerification,
      email: { ...baseVerification.email, disposable: true },
    };
    const result = computeRisk(v);
    expect(result.components.email).toBeGreaterThanOrEqual(15);
  });

  it("adds +25 for AVS N failure", () => {
    const v: VerificationResult = {
      ...baseVerification,
      payment: { ...baseVerification.payment, avs: "N" },
    };
    const result = computeRisk(v);
    expect(result.components.payment).toBeGreaterThanOrEqual(25);
  });

  it("adds +15 for proxy IP", () => {
    const v: VerificationResult = {
      ...baseVerification,
      ip: { ...baseVerification.ip, proxy: true },
    };
    const result = computeRisk(v);
    expect(result.components.ip).toBeGreaterThanOrEqual(15);
  });

  it("maps score > 60 to denied", () => {
    const v: VerificationResult = {
      ...baseVerification,
      address: { ...baseVerification.address, dpv: "N", deliverable: false },
      email: { ...baseVerification.email, disposable: true },
      payment: { ...baseVerification.payment, avs: "N", cvv: "N" },
      ip: { ...baseVerification.ip, proxy: true },
    };
    const result = computeRisk(v);
    expect(result.score).toBeGreaterThan(60);
    expect(result.decision).toBe("denied");
  });

  it("caps score at 100", () => {
    const v: VerificationResult = {
      address: { dpv: "N", deliverable: false, residential: false, distanceKm: 9999, reasons: [] },
      phone: { type: "voip", active: false, riskScore: 95, reasons: [] },
      email: { disposable: true, mxValid: false, domainRisk: "high", reasons: [] },
      payment: { avs: "N", cvv: "N", binType: "prepaid", reasons: [] },
      ip: { proxy: true, vpn: true, distanceToShipKm: 9999, country: "NL", reasons: [] },
      overall: { score: 0, decision: "denied", reasons: [] },
    };
    const result = computeRisk(v);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
