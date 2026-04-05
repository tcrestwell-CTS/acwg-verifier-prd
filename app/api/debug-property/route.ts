import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.PROPERTY_API_KEY ?? "";
  if (!apiKey) return NextResponse.json({ error: "PROPERTY_API_KEY not set" });

  try {
    const params = new URLSearchParams({
      address1: "100 Cherokee Blvd",
      address2: "Chattanooga, TN 37405",
    });

    const res = await fetch(
      `https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/basicprofile?${params}`,
      {
        headers: { apikey: apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      }
    );

    const body = await res.json();
    return NextResponse.json({ status: res.status, body });
  } catch (err) {
    return NextResponse.json({ error: String(err) });
  }
}
