import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getFeatureSettings, updateFeatureSettings, getFeatureAuditLog } from "@/lib/services/settingsService";
import { requireAuth, getActor } from "@/lib/auth/session";

const UpdateSchema = z.object({
  identityIntelligence: z.boolean().optional(),
  propertyOwnership: z.boolean().optional(),
  deviceIntelligence: z.boolean().optional(),
  phoneRiskPlus: z.boolean().optional(),
  otpStepUp: z.boolean().optional(),
  documentRequest: z.boolean().optional(),
  payment3ds: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const { error } = await requireAuth("superadmin");
  if (error) return error;

  const audit = req.nextUrl.searchParams.get("audit") === "true";
  if (audit) {
    const log = await getFeatureAuditLog(20);
    return NextResponse.json(log);
  }

  const settings = await getFeatureSettings();
  return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth("superadmin");
  if (error) return error;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  const updated = await updateFeatureSettings(parsed.data, getActor(session));
  return NextResponse.json(updated);
}
