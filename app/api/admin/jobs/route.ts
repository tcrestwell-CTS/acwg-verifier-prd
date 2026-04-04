import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processNext, getFailedJobs, getJobMetrics } from "@/lib/queue/jobQueue";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const view = searchParams.get("view") ?? "metrics";

  if (view === "failed") {
    const jobs = await getFailedJobs(100);
    return NextResponse.json(jobs);
  }

  if (view === "pending") {
    const jobs = await db.queueJob.findMany({
      where: { status: { in: ["pending", "running"] } },
      orderBy: { runAt: "asc" },
      take: 100,
    });
    return NextResponse.json(jobs);
  }

  const metrics = await getJobMetrics();
  return NextResponse.json(metrics);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, jobId } = body as { action?: string; jobId?: string };

  if (action === "process_next") {
    const processed = await processNext();
    return NextResponse.json({ processed });
  }

  if (action === "retry" && jobId) {
    await db.queueJob.update({
      where: { id: jobId },
      data: { status: "pending", runAt: new Date(), lastError: null },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "discard" && jobId) {
    await db.queueJob.update({
      where: { id: jobId },
      data: { status: "dead_letter" },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
