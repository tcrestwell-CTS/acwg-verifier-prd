import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runRetentionJob, listRetentionRuns } from "@/lib/jobs/retentionJob";

const RunSchema = z.object({
  policy: z.enum(["90d", "180d", "365d"]),
  dryRun: z.boolean().default(true),
  actor: z.string().min(1),
});

export async function GET() {
  const runs = await listRetentionRuns(50);
  return NextResponse.json(runs);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await runRetentionJob(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
