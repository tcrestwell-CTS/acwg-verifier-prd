import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.PROPERTY_API_KEY ?? "";
  const secret = process.env.PROPERTY_API_SECRET ?? "";

  const results: Record<string, unknown> = {
    key_set: !!key,
    secret_set: !!secret,
    key_prefix: key.slice(0, 8),
  };

  if (!key || !secret) {
    return NextResponse.json({ error: "Credentials not set", ...results });
  }

  const credentials = Buffer.from(`${key}:${secret}`).toString("base64");

  // Try all known CoreLogic token endpoint patterns
  const tokenEndpoints = [
    "https://property.corelogicapi.com/oauth/client_credential/accesstoken?grant_type=client_credentials",
    "https://property.corelogicapi.com/v2/oauth/client_credential/accesstoken?grant_type=client_credentials",
    "https://property.corelogicapi.com/oauth2/token",
  ];

  for (const url of tokenEndpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": "0",
        },
        body: "",
        signal: AbortSignal.timeout(5000),
      });

      const text = await res.text();
      results[url] = { status: res.status, body: text.slice(0, 300) };

      if (res.ok) {
        const data = JSON.parse(text);
        results.working_endpoint = url;
        results.token_prefix = (data.access_token ?? "").slice(0, 20);
        results.expires_in = data.expires_in;
        break;
      }
    } catch (err) {
      results[url] = { error: String(err) };
    }
  }

  return NextResponse.json(results);
}
