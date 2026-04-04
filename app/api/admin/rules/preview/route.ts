import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { previewRules } from "@/lib/services/rulesService";

const PreviewSchema = z.object({
  rulesVersionId: z.string().min(1),
  sampleVerification: z.object({
    address: z.object({
      dpv: z.enum(["Y", "N", "S", "D", "U"]),
      deliverable: z.boolean(),
      residential: z.boolean(),
      distanceKm: z.number().optional(),
      apartmentNeeded: z.boolean().optional(),
      reasons: z.array(z.string()),
    }),
    phone: z.object({
      type: z.enum(["mobile", "landline", "voip"]).optional(),
      active: z.boolean().optional(),
      riskScore: z.number().optional(),
      reasons: z.array(z.string()),
    }),
    email: z.object({
      disposable: z.boolean().optional(),
      mxValid: z.boolean().optional(),
      domainRisk: z.enum(["low", "medium", "high"]).optional(),
      reasons: z.array(z.string()),
    }),
    payment: z.object({
      avs: z.enum(["Y", "N", "P", "U"]).optional(),
      cvv: z.enum(["M", "N", "U"]).optional(),
      binType: z.enum(["debit", "credit", "prepaid", "unknown"]).optional(),
      reasons: z.array(z.string()),
    }),
    ip: z.object({
      country: z.string().optional(),
      proxy: z.boolean().optional(),
      vpn: z.boolean().optional(),
      distanceToShipKm: z.number().optional(),
      reasons: z.array(z.string()),
    }),
  }),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PreviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await previewRules(parsed.data as never);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
