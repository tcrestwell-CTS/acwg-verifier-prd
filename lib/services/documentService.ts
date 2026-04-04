import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { writeAuditLog } from "@/lib/audit";
import { flags } from "@/lib/featureFlags";
import { randomUUID } from "crypto";

type DocRequestType = "government_id" | "proof_of_address" | "bank_statement" | "selfie" | "other";

// ── Generate secure upload token ──────────────────────────────────────────────

function generateUploadToken(requestId: string): string {
  // In production: sign this with a secret + expiry using JWT or similar
  // For now: base64-encode the requestId with a random nonce
  const nonce = randomUUID().replace(/-/g, "");
  return Buffer.from(`${requestId}:${nonce}`).toString("base64url");
}

// ── Request a document ────────────────────────────────────────────────────────

export async function requestDocument(opts: {
  orderId: string;
  type: DocRequestType;
  notes?: string;
  actor: string;
}) {
  if (!flags.documentEscalation) {
    return { stubbed: true, message: "Document escalation disabled (FEATURE_DOCUMENT_ESCALATION=false)" };
  }

  const request = await db.documentRequest.create({
    data: {
      orderId: opts.orderId,
      type: opts.type,
      status: "pending",
      requestedBy: opts.actor,
      notes: opts.notes ?? null,
    },
  });

  const uploadToken = generateUploadToken(request.id);
  const uploadUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/escalation/documents/${request.id}/upload?token=${uploadToken}`;

  await db.documentRequest.update({
    where: { id: request.id },
    data: { uploadUrl },
  });

  await writeAuditLog({
    orderId: opts.orderId,
    actor: opts.actor,
    action: "document:requested",
    payload: { requestId: request.id, type: opts.type },
  });

  logger.info("Document requested", { requestId: request.id, type: opts.type, orderId: opts.orderId });

  return { requestId: request.id, uploadUrl, type: opts.type, status: "pending" };
}

// ── Mark document uploaded (called after file received) ───────────────────────

export async function markDocumentUploaded(requestId: string, fileName: string) {
  // Sanitize filename — strip path components
  const safeName = fileName.replace(/[/\\]/g, "_").slice(0, 100);

  const updated = await db.documentRequest.update({
    where: { id: requestId },
    data: { status: "uploaded", fileName: safeName },
  });

  logger.info("Document uploaded", { requestId, fileName: safeName });
  return updated;
}

// ── Review a document ─────────────────────────────────────────────────────────

export async function reviewDocument(opts: {
  requestId: string;
  outcome: "accepted" | "rejected";
  reviewNotes?: string;
  actor: string;
}) {
  const updated = await db.documentRequest.update({
    where: { id: opts.requestId },
    data: {
      status: opts.outcome,
      reviewedBy: opts.actor,
      reviewNotes: opts.reviewNotes ?? null,
    },
  });

  await writeAuditLog({
    orderId: updated.orderId,
    actor: opts.actor,
    action: `document:${opts.outcome}`,
    payload: { requestId: opts.requestId },
  });

  return updated;
}

// ── Get document requests for an order ────────────────────────────────────────

export async function getDocumentRequests(orderId: string) {
  return db.documentRequest.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, type: true, status: true, requestedBy: true,
      notes: true, fileName: true, reviewedBy: true, reviewNotes: true,
      createdAt: true, updatedAt: true,
      // Never expose uploadUrl in list queries — only return it on creation
      uploadUrl: false,
    },
  });
}
