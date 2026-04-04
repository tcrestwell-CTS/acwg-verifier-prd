import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { initiateOtp, verifyOtp, getOtpStatus } from "@/lib/services/otpService";
import { rateLimit } from "@/lib/middleware/rateLimit";

const otpLimiter = rateLimit({ windowMs: 60_000, maxRequests: 5 });

const InitiateSchema = z.object({
  orderId: z.string().min(1),
  phone: z.string().min(10),
  actor: z.string().min(1),
});

const VerifySchema = z.object({
  attemptId: z.string().min(1),
  code: z.string().length(6),
  actor: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
  const status = await getOtpStatus(orderId);
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  const limited = otpLimiter(req);
  if (limited) return limited;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify flow
  const verifyParsed = VerifySchema.safeParse(body);
  if (verifyParsed.success) {
    try {
      const result = await verifyOtp(
        verifyParsed.data.attemptId,
        verifyParsed.data.code,
        verifyParsed.data.actor
      );
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 400 });
    }
  }

  // Initiate flow
  const parsed = InitiateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const result = await initiateOtp(parsed.data.orderId, parsed.data.phone, parsed.data.actor);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
