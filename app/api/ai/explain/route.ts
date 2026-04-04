import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateRepExplanation } from "@/lib/services/claudeService";
import { aiLimiter } from "@/lib/middleware/rateLimit";
import { logger } from "@/lib/logger";

const BodySchema = z.object({
  input: z.object({
    order: z.any(),
    verification: z.any(),
  }),
});

export async function POST(req: NextRequest) {
  const rateLimitResponse = aiLimiter(req);
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing input" }, { status: 400 });
  }

  try {
    const text = await generateRepExplanation(
      parsed.data.input.order,
      parsed.data.input.verification
    );
    return NextResponse.json({ text });
  } catch (err) {
    logger.error("AI explain route failed", { error: String(err) });
    return NextResponse.json({ error: "Failed to generate explanation" }, { status: 500 });
  }
}
