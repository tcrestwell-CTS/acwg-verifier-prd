import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const statusParam = searchParams.get("status");

  const validStatuses = ["approved", "queued", "denied"];
  const statusFilter =
    statusParam && validStatuses.includes(statusParam) ? statusParam : null;

  try {
    const orders = await db.order.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        verification: {
          select: { overall: true, createdAt: true },
        },
        decisions: {
          orderBy: { decidedAt: "desc" },
          take: 1,
        },
      },
    });

    // Filter by current status (latest decision)
    const filtered = orders.filter((o) => {
      if (!statusFilter) return true;
      const latestDecision = o.decisions[0];
      if (!latestDecision) return statusFilter === "queued";
      return latestDecision.status === statusFilter;
    });

    const result = filtered.map((o) => {
      const overall = o.verification?.overall as {
        score?: number;
        decision?: string;
        reasons?: string[];
      } | null;
      const latestDecision = o.decisions[0];
      const currentStatus = latestDecision?.status ?? "queued";

      return {
        id: o.id,
        createdAt: o.createdAt.toISOString(),
        customerName: o.customerName,
        email: o.email,
        phone: o.phone,
        currentStatus,
        overall: {
          score: overall?.score ?? 0,
          decision: overall?.decision ?? "queued",
          reasons: (overall?.reasons as string[]) ?? [],
        },
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Failed to list orders", { error: message });
    return NextResponse.json({ error: "Failed to load orders", detail: message }, { status: 500 });
  }
}
