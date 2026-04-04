import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createExperiment,
  startExperiment,
  endExperiment,
  getExperimentResults,
} from "@/lib/experiments/rulesExperiment";
import { db } from "@/lib/db";

const CreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  controlId: z.string().min(1),
  treatmentId: z.string().min(1),
  rolloutPct: z.number().int().min(0).max(100),
  actor: z.string().min(1),
});

const ActionSchema = z.object({
  action: z.enum(["start", "end", "results"]),
  id: z.string().min(1),
  actor: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const results = await getExperimentResults(id);
    return NextResponse.json(results);
  }
  const experiments = await db.rulesExperiment.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(experiments);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const actionParsed = ActionSchema.safeParse(body);
  if (actionParsed.success) {
    const { action, id, actor } = actionParsed.data;
    try {
      if (action === "start") return NextResponse.json(await startExperiment(id, actor ?? "admin"));
      if (action === "end") return NextResponse.json(await endExperiment(id, actor ?? "admin"));
      if (action === "results") return NextResponse.json(await getExperimentResults(id));
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 400 });
    }
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const experiment = await createExperiment(parsed.data);
  return NextResponse.json(experiment, { status: 201 });
}
