import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.PROPERTY_API_KEY ?? "";
  const secret = process.env.PROPERTY_API_SECRET ?? "";

  if (!key || !secret) {
    return NextResponse.json({ error: "Credentials not set" });
  }

  const results: Record<string, unknown> = { key_prefix: key.slice(0, 8) };
  const credentials = Buffer.from(`${key}:${secret}`).toString("base64");

  // CoreLogic Apigee typically passes client_id/secret in body, not Basic auth
  const attempts = [
    // Pattern 1: client_id + client_secret in body (most common Apigee)
    {
      label: "body_params",
      url: "https://property.corelogicapi.com/oauth/client_credential/accesstoken?grant_type=client_credentials",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `client_id=${encodeURIComponent(key)}&client_secret=${encodeURIComponent(secret)}`,
    },
    // Pattern 2: Basic auth with grant_type in body
    {
      label: "basic_with_body",
      url: "https://property.corelogicapi.com/oauth/client_credential/accesstoken",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
    // Pattern 3: apikey as query param directly on search endpoint
    {
      label: "apikey_query",
      url: `https://property.corelogicapi.com/v2/properties/search?apikey=${encodeURIComponent(key)}`,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        searchParameters: { address: { streetAddress: "100 Cherokee Blvd", city: "Chattanooga", state: "TN", postalCode: "37405" } },
        resultFields: ["ownerInfo"],
      }),
      method: "POST",
    },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: attempt.method ?? "POST",
        headers: attempt.headers as HeadersInit,
        body: attempt.body,
        signal: AbortSignal.timeout(5000),
      });
      const text = await res.text();
      results[attempt.label] = { status: res.status, body: text.slice(0, 400) };
    } catch (err) {
      results[attempt.label] = { error: String(err) };
    }
  }

  return NextResponse.json(results);
}
