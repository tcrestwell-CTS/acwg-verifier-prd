import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requestDocument,
  reviewDocument,
  getDocumentRequests,
} from "@/lib/services/documentService";

const RequestSchema = z.object({
  orderId: z.string().min(1),
  type: z.enum(["government_id", "proof_of_address", "bank_statement", "selfie", "other"]),
  notes: z.string().optional(),
  actor: z.string().min(1),
});

const ReviewSchema = z.object({
  requestId: z.string().min(1),
  outcome: z.enum(["accepted", "rejected"]),
  reviewNotes: z.string().optional(),
  actor: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
  const requests = await getDocumentRequests(orderId);
  return NextResponse.json(requests);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Review flow
  const reviewParsed = ReviewSchema.safeParse(body);
  if (reviewParsed.success) {
    try {
      const result = await reviewDocument(reviewParsed.data);
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 400 });
    }
  }

  // Request flow
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const result = await requestDocument(parsed.data);
  return NextResponse.json(result, { status: 201 });
}
