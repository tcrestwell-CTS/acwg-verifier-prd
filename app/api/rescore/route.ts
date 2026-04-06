import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";

// ── POST /api/rescore ─────────────────────────────────────────────────────────
// Re-runs risk scoring after Stripe AVS/CVV result is known.
// Adjusts the score and decision, then updates the DB order record.

interface RescoreBody {
  orderId: string;
  avs: "Y" | "N" | "P" | "U";
  cvv: "M" | "N" | "U";
  last4?: string;
  brand?: string;
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth("reviewer");
  if (error) return error;

  const body = await req.json() as RescoreBody;
  const { orderId, avs, cvv, last4, brand } = body;

  if (!orderId || !avs || !cvv) {
    return NextResponse.json({ error: "orderId, avs, cvv required" }, { status: 400 });
  }

  try {
    // Load the existing verification result
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { verification: true },
    });

    if (!order?.verification) {
      return NextResponse.json({ error: "Order or verification not found" }, { status: 404 });
    }

    const existing = order.verification.overall as {
      score: number;
      decision: string;
      reasons: string[];
      hardStop: boolean;
      requiresOtp: boolean;
      requiresDocVerification: boolean;
    };

    // Calculate AVS/CVV score delta
    let delta = 0;
    const newReasons: string[] = [];
    let hardStop = existing.hardStop;
    let hardStopReason: string | null = null;

    // Remove any previous AVS/CVV reasons from existing score
    // (they were "U" = unavailable before, now we have real values)
    const prevAvsScore = existing.reasons.some(r => r.includes("AVS unavailable")) ? 5
      : existing.reasons.some(r => r.includes("AVS mismatch") || r.includes("does not match card")) ? 20
      : existing.reasons.some(r => r.includes("partial match") || r.includes("street mismatch")) ? 10
      : 0;
    delta -= prevAvsScore; // Remove old AVS score

    // Apply real AVS score
    if (avs === "Y") {
      newReasons.push("✓ AVS full match — billing address confirmed by card issuer");
    } else if (avs === "N") {
      delta += 20;
      newReasons.push("AVS mismatch — billing address does not match card issuer records");
      // Hard stop if cross-region shipping was also flagged
      const crossRegion = existing.reasons.some(r =>
        r.includes("km apart") || r.includes("cross-region") || r.includes("shipping distance")
      );
      if (crossRegion) {
        hardStop = true;
        hardStopReason = "AVS mismatch combined with cross-region shipping — hard stop";
      }
    } else if (avs === "P") {
      delta += 10;
      newReasons.push("AVS partial match — ZIP matched but street address did not");
    } else {
      delta += 5;
      newReasons.push("AVS unavailable — card issuer did not return address verification");
    }

    // CVV
    if (cvv === "M") {
      newReasons.push("✓ CVV matched — security code confirmed");
    } else if (cvv === "N") {
      delta += 25;
      hardStop = true;
      hardStopReason = "CVV mismatch — security code did not match card records";
      newReasons.push("CVV mismatch — security code rejected by card issuer");
    } else {
      newReasons.push("CVV not verified by card issuer");
    }

    if (last4) newReasons.push(`Card: ${brand ?? "Unknown"} ending ${last4}`);

    // Rebuild score and decision
    const rawScore = Math.max(0, Math.min(100, existing.score + delta));
    const score = hardStop ? 100 : rawScore;
    const decision = hardStop ? "denied"
      : score >= 60 ? "denied"
      : score >= 26 ? "queued"
      : "approved";

    // Merge reasons — remove old AVS/CVV reasons, add new ones
    const filteredReasons = existing.reasons.filter(r =>
      !r.includes("AVS") &&
      !r.includes("CVV") &&
      !r.includes("billing address not confirmed") &&
      !r.includes("Billing address") &&
      !r.includes("billing address partially") &&
      !r.includes("card issuer") &&
      !r.includes("security code")
    );
    const reasons = [...filteredReasons, ...newReasons];

    const newOverall = {
      ...existing,
      score,
      decision,
      reasons,
      hardStop,
      hardStopReason: hardStop ? (hardStopReason ?? existing.reasons.find(r => r.includes("hard stop"))) : null,
      avsResult: avs,
      cvvResult: cvv,
      cardLast4: last4,
      cardBrand: brand,
      rescored: true,
      rescoredAt: new Date().toISOString(),
      rescoredBy: session?.user?.email,
    };

    // Update DB
    await db.verification.update({
      where: { orderId },
      data: { overall: newOverall as object },
    });

    await writeAuditLog({
      action: "rescore",
      actor: session?.user?.email ?? "system",
      orderId,
      details: { avs, cvv, scoreDelta: delta, newScore: score, newDecision: decision },
    });

    logger.info("rescore complete", { orderId, avs, cvv, delta, score, decision });

    return NextResponse.json({
      score,
      decision,
      reasons,
      hardStop,
      hardStopReason,
      avsResult: avs,
      cvvResult: cvv,
      scoreDelta: delta,
    });

  } catch (err) {
    logger.error("rescore failed", { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
