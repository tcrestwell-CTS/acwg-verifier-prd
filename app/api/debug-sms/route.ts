import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Temp: no auth for SMS connectivity test

  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    return NextResponse.json({
      ok: false,
      missing: {
        TWILIO_ACCOUNT_SID:  !sid,
        TWILIO_AUTH_TOKEN:   !token,
        TWILIO_PHONE_NUMBER: !from,
      },
    });
  }

  const { to } = await req.json();
  if (!to) return NextResponse.json({ error: "to required" }, { status: 400 });

  const body = new URLSearchParams({
    To:   to,
    From: from,
    Body: "ACWG Verifier test — Twilio SMS is working ✓",
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  const data = await res.json() as {
    sid?: string;
    status?: string;
    error_code?: number;
    error_message?: string;
  };

  return NextResponse.json({
    ok:            res.ok,
    messageSid:    data.sid,
    status:        data.status,
    error_code:    data.error_code    ?? null,
    error_message: data.error_message ?? null,
    from,
    to,
  });
}
