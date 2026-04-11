import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const { error } = await requireAuth("reviewer");
  if (error) return error;

  const { orderId, score, reasons, customerName, orderAmount } = await req.json();
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  try {
    // Generate a simple manager override code — 6 alphanumeric chars
    const code = Math.random().toString(36).toUpperCase().slice(2, 8);

    // Store the escalation in audit log with the code
    await writeAuditLog({
      orderId,
      actor: "system",
      action: "manager_escalation",
      payload: {
        score,
        customerName,
        orderAmount,
        overrideCode: code,  // manager uses this to approve
        reasons: reasons.slice(0, 5),
        escalatedAt: new Date().toISOString(),
      },
    });

    // Send email notification if configured
    const managerEmail = process.env.MANAGER_EMAIL;
    if (managerEmail) {
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from:    "ACWG Fraud Portal <noreply@acwg-verifier-prd.vercel.app>",
            to:      [managerEmail],
            subject: `🔔 Manager Review Required — ${customerName} (Score: ${score}/100)`,
            html: `
              <h2 style="color:#1e3a8a">Manager Approval Required</h2>
              <p>An order requires your review before it can be processed.</p>
              <table style="border-collapse:collapse;width:100%;max-width:500px">
                <tr><td style="padding:8px;border:1px solid #ddd"><strong>Customer</strong></td><td style="padding:8px;border:1px solid #ddd">${customerName}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd"><strong>Order Amount</strong></td><td style="padding:8px;border:1px solid #ddd">$${Number(orderAmount).toLocaleString()}</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd"><strong>Risk Score</strong></td><td style="padding:8px;border:1px solid #ddd;color:#b91c1c;font-weight:bold">${score}/100</td></tr>
                <tr><td style="padding:8px;border:1px solid #ddd"><strong>Risk Signals</strong></td><td style="padding:8px;border:1px solid #ddd">${reasons.slice(0,5).join('<br>')}</td></tr>
                <tr style="background:#fef9c3"><td style="padding:8px;border:1px solid #ddd"><strong>Override Code</strong></td><td style="padding:12px;border:1px solid #ddd;font-size:28px;font-weight:bold;letter-spacing:6px;font-family:monospace">${code}</td></tr>
              </table>
              <p style="margin-top:16px">Share the override code with the rep to allow processing, or review directly in the <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://acwg-verifier-prd.vercel.app'}/orders/queue">Review Queue</a>.</p>
            `,
          }),
        }).catch(e => logger.warn("Resend email failed", { error: String(e) }));
      }

      // Also try Twilio SMS to manager if phone is set
      const managerPhone = process.env.MANAGER_PHONE;
      const twilioSid   = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom  = process.env.TWILIO_PHONE_NUMBER;
      if (managerPhone && twilioSid && twilioToken && twilioFrom) {
        await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To:   managerPhone,
              From: twilioFrom,
              Body: `ACWG: Manager review needed for ${customerName} (Score ${score}/100). Override code: ${code}`,
            }),
          }
        ).catch(() => {}); // non-fatal
      }
    }

    logger.info("Manager escalation created", { orderId, score, code: code.slice(0, 2) + "****" });

    return NextResponse.json({ ok: true, notified: !!managerEmail });
  } catch (err) {
    logger.error("Manager escalation failed", { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
