import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.PROPERTY_API_KEY ?? "";
  if (!token) return NextResponse.json({ error: "PROPERTY_API_KEY not set" });

  // Test against Estated sandbox first, then production
  const results: Record<string, unknown> = { token_prefix: token.slice(0, 8) };

  for (const [label, baseUrl] of [
    ["sandbox", "https://sandbox.estated.com/v4/property"],
    ["production", "https://apis.estated.com/v4/property"],
  ]) {
    try {
      const params = new URLSearchParams({
        token,
        street_address: "1867 Gatewood Dr",
        city: "Montgomery",
        state: "AL",
        zip_code: "36106",
      });
      const res = await fetch(`${baseUrl}?${params}`, {
        signal: AbortSignal.timeout(6000),
      });
      const body = await res.json();
      results[label as string] = {
        status: res.status,
        owner: body?.data?.owner ?? null,
        warnings: body?.warnings ?? [],
        error: body?.error ?? null,
      };
    } catch (err) {
      results[label as string] = { error: String(err) };
    }
  }

  return NextResponse.json(results);
}
