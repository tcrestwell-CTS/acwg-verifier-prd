import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createChargeback,
  listChargebacks,
  updateChargebackStatus,
} from "@/lib/services/chargebackService";

const CreateSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().optional(),
  chargebackDate: z.string().transform((v) => new Date(v)),
  notes: z.string().optional(),
  actor: z.string().min(1),
});

const UpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["investigating", "won", "lost", "resolved"]),
  resolution: z.string().optional(),
  actor: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status") ?? undefined;
  const orderId = searchParams.get("orderId") ?? undefined;
  const records = await listChargebacks({ status, orderId });
  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Check if it's an update
  const updateParsed = UpdateSchema.safeParse(body);
  if (updateParsed.success) {
    const result = await updateChargebackStatus(updateParsed.data);
    return NextResponse.json(result);
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const record = await createChargeback(parsed.data);
    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
