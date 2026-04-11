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
      const sgKey = process.env.SENDGRID_API_KEY;
      if (sgKey) {
        await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sgKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: managerEmail }] }],
            from: { email: "noreply@acwgverifier.com", name: "ACWG Fraud Portal" },
            subject: `🔔 Manager Review Required — ${customerName} (Score: ${score}/100)`,
            content: [{
              type: "text/html",
              value: `
                <h2>Manager Approval Required</h2>
                <p>An order requires your review before it can be processed.</p>
                <table style="border-collapse:collapse;width:100%">
                  <tr><td style="padding:8px;border:1px solid #ddd"><strong>Customer</strong></td><td style="padding:8px;border:1px solid #ddd">${customerName}</td></tr>
                  <tr><td style="padding:8px;border:1px solid #ddd"><strong>Order Amount</strong></td><td style="padding:8px;border:1px solid #ddd">$${Number(orderAmount).toLocaleString()}</td></tr>
                  <tr><td style="padding:8px;border:1px solid #ddd"><strong>Risk Score</strong></td><td style="padding:8px;border:1px solid #ddd">${score}/100</td></tr>
                  <tr><td style="padding:8px;border:1px solid #ddd"><strong>Risk Signals</strong></td><td style="padding:8px;border:1px solid #ddd">${reasons.slice(0,5).join('<br>')}</td></tr>
                  <tr><td style="padding:8px;border:1px solid #ddd"><strong>Override Code</strong></td><td style="padding:8px;border:1px solid #ddd;font-size:24px;font-weight:bold;letter-spacing:4px">${code}</td></tr>
                </table>
                <p style="margin-top:16px">Provide the override code to the rep to allow processing, or review directly in the <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://acwg-verifier-prd.vercel.app'}/orders/queue">Review Queue</a>.</p>
              `,
            }],
          }),
        });
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
