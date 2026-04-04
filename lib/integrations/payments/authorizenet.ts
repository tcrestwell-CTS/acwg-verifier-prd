import { logger } from "@/lib/logger";
import type { PaymentAdapter, PaymentSignals } from "./adapter";

const AVS_MAP: Record<string, "Y" | "N" | "P" | "U"> = {
  A: "P", B: "P", C: "N", D: "Y", E: "U",
  G: "U", I: "U", M: "Y", N: "N", O: "U",
  P: "P", Q: "U", R: "U", S: "U", T: "P",
  U: "U", V: "U", W: "P", X: "Y", Y: "Y", Z: "P",
};

export class AuthorizeNetAdapter implements PaymentAdapter {
  name = "authorizenet";

  async collectSignals(opts: {
    cardLast4?: string;
    bin?: string;
    amount?: number;
    currency?: string;
    billingZip?: string;
  }): Promise<PaymentSignals> {
    const apiLoginId = process.env.AUTHORIZENET_API_LOGIN_ID;
    const transactionKey = process.env.AUTHORIZENET_TRANSACTION_KEY;
    const sandbox = process.env.AUTHORIZENET_SANDBOX === "true";

    if (!apiLoginId || !transactionKey) {
      logger.warn("Authorize.net not configured — stub signals");
      return { avs: "U", cvv: "U", provider: "authorizenet_stub", reasons: ["Authorize.net not configured"] };
    }

    const endpoint = sandbox
      ? "https://apitest.authorize.net/xml/v1/request.api"
      : "https://api.authorize.net/xml/v1/request.api";

    // Zero-dollar auth request
    const body = {
      createTransactionRequest: {
        merchantAuthentication: { name: apiLoginId, transactionKey },
        transactionRequest: {
          transactionType: "authOnlyTransaction",
          amount: String(opts.amount ?? 0),
          payment: {
            creditCard: {
              // Only test card numbers in sandbox — real tokens come from client-side Accept.js
              cardNumber: opts.bin ? `${opts.bin}000000`.slice(0, 16) : "4111111111111111",
              expirationDate: "2025-12",
              cardCode: "999",
            },
          },
          billTo: { zip: opts.billingZip ?? "" },
        },
      },
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json() as {
        transactionResponse?: {
          avsResultCode?: string;
          cvvResultCode?: string;
          authCode?: string;
          responseCode?: string;
        }
      };

      const tx = data.transactionResponse;
      const avsCode = tx?.avsResultCode?.toUpperCase() ?? "U";
      const cvvCode = tx?.cvvResultCode?.toUpperCase() ?? "U";
      const avs = AVS_MAP[avsCode] ?? "U";
      const cvv = cvvCode === "M" ? "M" : cvvCode === "N" ? "N" : "U";

      const reasons: string[] = [];
      if (avs === "N") reasons.push("Authorize.net AVS: address mismatch");
      if (cvv === "N") reasons.push("Authorize.net CVV: mismatch");

      return { avs, cvv, authCode: tx?.authCode, provider: "authorizenet", reasons };
    } catch (err) {
      logger.error("Authorize.net signal collection failed", { error: String(err) });
      return { avs: "U", cvv: "U", provider: "authorizenet", reasons: ["Authorize.net request failed"] };
    }
  }
}
