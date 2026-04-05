import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.PROPERTY_API_KEY ?? "";

  if (!key) return NextResponse.json({ error: "PROPERTY_API_KEY not set" });

  const params = new URLSearchParams({
    id: key,
    a1: "100 Cherokee Blvd",
    city: "Chattanooga",
    state: "TN",
    zip: "37405",
    cols: "GrpPropertyAddress,GrpOwner,GrpValues,GrpCurrentDeed,GrpParcel",
    format: "JSON",
  });

  try {
    const res = await fetch(
      `https://property.melissadata.net/v4/WEB/LookupProperty?${params}`,
      { signal: AbortSignal.timeout(6000) }
    );
    const text = await res.text();
    return NextResponse.json({ status: res.status, body: JSON.parse(text) });
  } catch (err) {
    return NextResponse.json({ error: String(err) });
  }
}
