"use client";

import type { VerificationResult } from "@/lib/schemas";

interface PlaybookAction {
  priority: "required" | "recommended";
  action: string;
  script?: string;
}

function derivePlaybook(
  verification: VerificationResult,
  requiresOtp: boolean,
  requiresDoc: boolean
): PlaybookAction[] {
  const actions: PlaybookAction[] = [];
  const { address, phone, email, payment, overall } = verification;
  const dist = address.distanceKm ?? 0;
  const overall_ = overall as { score?: number; decision?: string; reasons?: string[] };

  // ── OTP requirement ─────────────────────────────────────────────────────
  if (requiresOtp) {
    actions.push({
      priority: "required",
      action: "Send SMS verification code to customer's phone",
      script: `"I need to verify your identity. I'm sending a code to the phone number on file. Please read it back to me when you receive it."`,
    });
  }

  // ── Document verification ───────────────────────────────────────────────
  if (requiresDoc) {
    actions.push({
      priority: "required",
      action: "Request government-issued photo ID",
      script: `"For orders of this size, we require a quick ID verification. I'll send you a secure link to upload a photo of your ID and the last 4 digits of your card. This only takes 2 minutes."`,
    });
  }

  // ── AVS mismatch ────────────────────────────────────────────────────────
  if (payment.avs === "N" || payment.avs === "P") {
    actions.push({
      priority: "required",
      action: "Verbally confirm full billing address",
      script: `"Can you please confirm the full billing address on your card, including street number and ZIP code?"`,
    });
  }

  // ── CVV issue ───────────────────────────────────────────────────────────
  if (payment.cvv === "N" || payment.cvv === "U") {
    actions.push({
      priority: "required",
      action: "Re-confirm card security code (CVV)",
      script: `"The security code on your card didn't verify. Can you double-check the 3-digit code on the back of the card?"`,
    });
  }

  // ── VoIP phone ──────────────────────────────────────────────────────────
  if (phone.type === "voip") {
    actions.push({
      priority: "required",
      action: "Confirm a mobile number for verification",
      script: `"I see you're calling from an internet-based number. Do you have a mobile number we can reach you at? We'll need to send a verification code."`,
    });
  }

  // ── Disposable email ────────────────────────────────────────────────────
  if (email.disposable) {
    actions.push({
      priority: "required",
      action: "Request a personal or business email address",
      script: `"The email address provided appears to be temporary. Can I get a personal or business email address for your order confirmation?"`,
    });
  }

  // ── Large shipping/billing distance ─────────────────────────────────────
  if (dist > 400) {
    actions.push({
      priority: "required",
      action: "Confirm reason for out-of-region shipping",
      script: `"I notice the shipping address is in a different area than your billing address. Can you tell me more about where this is being shipped?"`,
    });
  } else if (dist > 50) {
    actions.push({
      priority: "recommended",
      action: "Confirm shipping address is intentional",
      script: `"Just confirming — you'd like this shipped to [shipping address], correct?"`,
    });
  }

  // USPS DPV check not used — ACWG uses third-party delivery

  // ── First-time customer with high order ─────────────────────────────────
  if (overall_.score && overall_.score > 20) {
    actions.push({
      priority: "recommended",
      action: "Confirm if customer is a returning buyer",
    });
  }

  // ── Prepaid card ────────────────────────────────────────────────────────
  if (payment.binType === "prepaid") {
    actions.push({
      priority: "recommended",
      action: "Suggest credit or debit card for large orders",
      script: `"We accept prepaid cards, but for large orders we typically prefer a credit or debit card. Would you like to use a different payment method?"`,
    });
  }

  return actions;
}

interface RepPlaybookProps {
  verification: VerificationResult;
  requiresOtp?: boolean;
  requiresDoc?: boolean;
}

export function RepPlaybook({ verification, requiresOtp = false, requiresDoc = false }: RepPlaybookProps) {
  const actions = derivePlaybook(verification, requiresOtp, requiresDoc);

  const required = actions.filter((a) => a.priority === "required");
  const recommended = actions.filter((a) => a.priority === "recommended");

  if (actions.length === 0) {
    return (
      <div className="card p-4 border border-green-200 bg-green-50">
        <p className="text-sm font-semibold text-green-800">✓ No required actions — proceed with order</p>
        <p className="text-xs text-green-600 mt-1">All signals are within acceptable thresholds.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
        <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
          📋 Action Checklist
          {required.length > 0 && (
            <span className="badge badge-fail">{required.length} Required</span>
          )}
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">Complete all required actions before processing</p>
      </div>

      <div className="divide-y divide-slate-100">
        {required.map((action, i) => (
          <details key={i} className="group">
            <summary className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-red-50 transition-colors list-none">
              <div className="mt-0.5 w-5 h-5 rounded-full border-2 border-red-400 flex-shrink-0 group-open:bg-red-400 transition-colors" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">{action.action}</p>
                <span className="badge badge-fail text-xs mt-1">Required</span>
              </div>
              <svg className="w-4 h-4 text-slate-400 mt-0.5 group-open:rotate-180 transition-transform flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            {action.script && (
              <div className="px-4 pb-3 ml-8">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-blue-700 mb-1 uppercase tracking-wide">Script</p>
                  <p className="text-sm text-blue-900 italic">{action.script}</p>
                </div>
              </div>
            )}
          </details>
        ))}

        {recommended.map((action, i) => (
          <details key={i} className="group">
            <summary className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-amber-50 transition-colors list-none">
              <div className="mt-0.5 w-5 h-5 rounded-full border-2 border-amber-400 flex-shrink-0 group-open:bg-amber-400 transition-colors" />
              <div className="flex-1">
                <p className="text-sm text-slate-700">{action.action}</p>
                <span className="badge badge-warn text-xs mt-1">Recommended</span>
              </div>
              {action.script && (
                <svg className="w-4 h-4 text-slate-400 mt-0.5 group-open:rotate-180 transition-transform flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </summary>
            {action.script && (
              <div className="px-4 pb-3 ml-8">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1 uppercase tracking-wide">Script</p>
                  <p className="text-sm text-amber-900 italic">{action.script}</p>
                </div>
              </div>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}
