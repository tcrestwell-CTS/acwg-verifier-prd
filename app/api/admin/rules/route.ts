import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listRulesVersions,
  createDraftRules,
  publishRulesVersion,
  rollbackRules,
  getPublishedRules,
} from "@/lib/services/rulesService";

const RuleSchema = z.object({
  id: z.string(),
  description: z.string(),
  points: z.number().int().min(0).max(100),
  distanceThresholdKm: z.number().optional(),
  riskScoreThreshold: z.number().optional(),
});

const RulesConfigSchema = z.object({
  thresholds: z.object({
    approved: z.number().int().min(0).max(100),
    queued: z.number().int().min(0).max(100),
  }),
  rules: z.array(RuleSchema).min(1),
});

const CreateDraftSchema = z.object({
  rules: RulesConfigSchema,
  description: z.string().optional(),
  actor: z.string().min(1),
});

const ActionSchema = z.object({
  action: z.enum(["publish", "rollback"]),
  id: z.string(),
  actor: z.string().min(1),
});

export async function GET() {
  const [versions, current] = await Promise.all([
    listRulesVersions(),
    getPublishedRules(),
  ]);
  return NextResponse.json({ versions, current });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Determine action type
  const actionParsed = ActionSchema.safeParse(body);
  if (actionParsed.success) {
    const { action, id, actor } = actionParsed.data;
    try {
      const result = action === "publish"
        ? await publishRulesVersion(id, actor)
        : await rollbackRules(id, actor);
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 400 });
    }
  }

  // Otherwise treat as create draft
  const parsed = CreateDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const draft = await createDraftRules(parsed.data);
  return NextResponse.json(draft, { status: 201 });
}
