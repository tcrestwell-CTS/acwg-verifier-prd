import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.IDENTITY_INTEL_API_KEY ?? "";
  if (!apiKey) return NextResponse.json({ error: "IDENTITY_INTEL_API_KEY not set" });

  const testPhone = "+14235550100";
  const testEmail = "tim@crestwellgetaways.com";

  const [phone, email] = await Promise.all([
    fetch(
      `https://ipqualityscore.com/api/json/phone/${apiKey}/${encodeURIComponent(testPhone)}?strictness=1&allow_landlines=true`
    ).then((r) => r.json()).catch((e) => ({ error: String(e) })),

    fetch(
      `https://ipqualityscore.com/api/json/email/${apiKey}/${encodeURIComponent(testEmail)}?strictness=1`
    ).then((r) => r.json()).catch((e) => ({ error: String(e) })),
  ]);

  return NextResponse.json({ phone, email });
}
