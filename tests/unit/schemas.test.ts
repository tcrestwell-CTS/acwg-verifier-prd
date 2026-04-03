import { OrderPayloadSchema } from "@/lib/schemas";

const validPayload = {
  customer: { firstName: "Sarah", lastName: "Mitchell" },
  contact: { email: "sarah@gmail.com", phone: "+14045550182" },
  billingAddress: {
    line1: "142 Peachtree St NW",
    city: "Atlanta",
    state: "GA",
    postalCode: "30303",
    country: "US",
  },
  shippingAddress: {
    line1: "142 Peachtree St NW",
    city: "Atlanta",
    state: "GA",
    postalCode: "30303",
    country: "US",
  },
  items: [{ sku: "TRV-001", name: "Cruise Deposit", qty: 1, price: 500 }],
  paymentMeta: { cardLast4: "4242", bin: "424242", brand: "Visa" },
  context: { ip: "75.148.22.100" },
};

describe("OrderPayloadSchema", () => {
  it("validates a correct payload", () => {
    const result = OrderPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("rejects missing first name", () => {
    const result = OrderPayloadSchema.safeParse({
      ...validPayload,
      customer: { firstName: "", lastName: "Mitchell" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = OrderPayloadSchema.safeParse({
      ...validPayload,
      contact: { ...validPayload.contact, email: "not-an-email" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ZIP code", () => {
    const result = OrderPayloadSchema.safeParse({
      ...validPayload,
      billingAddress: { ...validPayload.billingAddress, postalCode: "ABC" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects cardLast4 that is not exactly 4 digits", () => {
    const result = OrderPayloadSchema.safeParse({
      ...validPayload,
      paymentMeta: { ...validPayload.paymentMeta, cardLast4: "12345" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty items array", () => {
    const result = OrderPayloadSchema.safeParse({
      ...validPayload,
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("allows optional paymentMeta fields", () => {
    const result = OrderPayloadSchema.safeParse({
      ...validPayload,
      paymentMeta: {},
    });
    expect(result.success).toBe(true);
  });
});
