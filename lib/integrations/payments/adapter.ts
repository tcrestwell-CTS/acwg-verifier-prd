export interface PaymentSignals {
  avs?: "Y" | "N" | "P" | "U";
  cvv?: "M" | "N" | "U";
  binCountry?: string;
  binType?: "debit" | "credit" | "prepaid" | "unknown";
  reasons: string[];
  authCode?: string;
  provider: string;
}

export interface PaymentAdapter {
  name: string;
  /** Run a zero-dollar auth or pre-auth to collect AVS/CVV/BIN signals */
  collectSignals(opts: {
    cardLast4?: string;
    bin?: string;
    amount?: number; // defaults to 0 for zero-auth
    currency?: string;
    billingZip?: string;
  }): Promise<PaymentSignals>;
}
