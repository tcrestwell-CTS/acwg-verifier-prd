import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.PROPERTY_API_KEY;
  const secret = process.env.PROPERTY_API_SECRET;

  if (!key || !secret) {
    return NextResponse.json({ error: "PROPERTY_API_KEY or PROPERTY_API_SECRET not set" }, { status: 500 });
  }

  const credentials = Buffer.from(`${key}:${secret}`).toString("base64");

  // Step 1: Token exchange
  let token: string;
  try {
    const tokenRes = await fetch("https://property.corelogicapi.com/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    const tokenText = await tokenRes.text();

    if (!tokenRes.ok) {
      return NextResponse.json({
        step: "token_exchange",
        status: tokenRes.status,
        error: tokenText,
      }, { status: 502 });
    }

    const tokenData = JSON.parse(tokenText);
    token = tokenData.access_token;

    if (!token) {
      return NextResponse.json({ step: "token_exchange", error: "No access_token in response", raw: tokenData }, { status: 502 });
    }
  } catch (err) {
    return NextResponse.json({ step: "token_exchange", error: String(err) }, { status: 502 });
  }

  // Step 2: Property search
  try {
    const searchRes = await fetch("https://property.corelogicapi.com/v2/properties/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        searchParameters: {
          address: {
            streetAddress: "100 Cherokee Blvd",
            city: "Chattanooga",
            state: "TN",
            postalCode: "37405",
          },
        },
        resultFields: ["ownerInfo", "propertyType", "saleHistory", "vacancyIndicator"],
      }),
    });

    const searchText = await searchRes.text();

    if (!searchRes.ok) {
      return NextResponse.json({
        step: "property_search",
        status: searchRes.status,
        error: searchText,
        token_prefix: token.slice(0, 20),
      }, { status: 502 });
    }

    const searchData = JSON.parse(searchText);
    return NextResponse.json({
      step: "success",
      token_prefix: token.slice(0, 20),
      properties_found: searchData?.properties?.length ?? 0,
      raw: searchData,
    });
  } catch (err) {
    return NextResponse.json({ step: "property_search", error: String(err) }, { status: 502 });
  }
}
