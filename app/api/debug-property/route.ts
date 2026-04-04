import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.PROPERTY_API_KEY ?? "";
  const secret = process.env.PROPERTY_API_SECRET ?? "";

  if (!key) return NextResponse.json({ error: "PROPERTY_API_KEY not set" });

  const results: Record<string, unknown> = {
    key_prefix: key.slice(0, 8),
    key_length: key.length,
    secret_length: secret.length,
  };

  const testAddress = {
    searchParameters: {
      address: {
        streetAddress: "100 Cherokee Blvd",
        city: "Chattanooga",
        state: "TN",
        postalCode: "37405",
      },
    },
    resultFields: ["ownerInfo", "propertyType"],
  };

  // Try 1: API key as direct Bearer token (no OAuth)
  try {
    const r = await fetch("https://property.corelogicapi.com/v2/properties/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(testAddress),
      signal: AbortSignal.timeout(5000),
    });
    const text = await r.text();
    results["bearer_key_direct"] = { status: r.status, body: text.slice(0, 400) };
  } catch (e) { results["bearer_key_direct"] = { error: String(e) }; }

  // Try 2: API key as apikey query param
  try {
    const r = await fetch(
      `https://property.corelogicapi.com/v2/properties/search?apikey=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(testAddress),
        signal: AbortSignal.timeout(5000),
      }
    );
    const text = await r.text();
    results["apikey_queryparam"] = { status: r.status, body: text.slice(0, 400) };
  } catch (e) { results["apikey_queryparam"] = { error: String(e) }; }

  // Try 3: client_id + secret in body (standard Apigee consumer key pattern)
  try {
    const r = await fetch(
      "https://property.corelogicapi.com/oauth/client_credential/accesstoken?grant_type=client_credentials",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `client_id=${encodeURIComponent(key)}&client_secret=${encodeURIComponent(secret)}`,
        signal: AbortSignal.timeout(5000),
      }
    );
    const text = await r.text();
    results["oauth_body_params"] = { status: r.status, body: text.slice(0, 400) };
  } catch (e) { results["oauth_body_params"] = { error: String(e) }; }

  return NextResponse.json(results);
}
