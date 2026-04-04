import { NextRequest, NextResponse } from "next/server";
import {
  getDecisionMetrics,
  getQueueAgingMetrics,
  getRiskDistribution,
  exportDecisionsCsv,
} from "@/lib/services/reportingService";
import { getChargebackSummary } from "@/lib/services/chargebackService";
import { getJobMetrics } from "@/lib/queue/jobQueue";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const days = parseInt(searchParams.get("days") ?? "30", 10);
  const format = searchParams.get("format");

  if (format === "csv") {
    const csv = await exportDecisionsCsv(days);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="acwg-decisions-${days}d.csv"`,
      },
    });
  }

  const [decisions, aging, riskDist, chargebacks, jobs] = await Promise.all([
    getDecisionMetrics(days),
    getQueueAgingMetrics(),
    getRiskDistribution(days),
    getChargebackSummary(),
    getJobMetrics(),
  ]);

  return NextResponse.json({ decisions, aging, riskDistribution: riskDist, chargebacks, jobs });
}
