import { z } from "zod";

// ─── Address ────────────────────────────────────────────────────────────────

export const AddressSchema = z.object({
  line1: z.string().min(1, "Address line 1 is required"),
  line2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z
    .string()
    .length(2, "Use 2-letter state abbreviation")
    .toUpperCase(),
  postalCode: z
    .string()
    .regex(/^\d{5}(-\d{4})?$/, "Enter a valid ZIP code (e.g. 30301 or 30301-1234)"),
  country: z.string().default("US"),
});

export type Address = z.infer<typeof AddressSchema>;

// ─── Order Payload ───────────────────────────────────────────────────────────

export const OrderItemSchema = z.object({
  sku: z.string().min(1, "SKU is required"),
  name: z.string().min(1, "Item name is required"),
  qty: z.number().int().positive("Quantity must be at least 1"),
  price: z.number().positive("Price must be positive"),
});

export const OrderPayloadSchema = z.object({
  customer: z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
  }),
  contact: z.object({
    email: z.string().email("Enter a valid email address"),
    phone: z
      .string()
      .min(10, "Phone number is required")
      .regex(
        /^[+]?[\d\s\-().]{10,}$/,
        "Enter a valid phone number"
      ),
  }),
  billingAddress: AddressSchema,
  shippingAddress: AddressSchema,
  items: z.array(OrderItemSchema).min(1, "At least one item is required"),
  paymentMeta: z.object({
    // Populated from Stripe PaymentMethod after card check
    cardLast4: z.string().optional(),
    bin: z.string().optional(),
    brand: z.string().optional(),
    stripePaymentMethodId: z.string().optional(),
  }).optional().default({}),
  context: z.object({
    ip: z.string().optional(),
    userAgent: z.string().optional(),
  }),
});

export type OrderPayload = z.infer<typeof OrderPayloadSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;

// ─── Verification Result ─────────────────────────────────────────────────────

export const VerificationResultSchema = z.object({
  address: z.object({
    dpv: z.enum(["Y", "N", "S", "D", "U"]),
    deliverable: z.boolean(),
    apartmentNeeded: z.boolean().optional(),
    residential: z.boolean(),
    distanceKm: z.number().optional(),
    normalized: AddressSchema.optional(),
    reasons: z.array(z.string()),
  }),
  phone: z.object({
    carrier: z.string().optional(),
    type: z.enum(["mobile", "landline", "voip"]).optional(),
    active: z.boolean().optional(),
    riskScore: z.number().optional(),
    e164: z.string().optional(),
    reasons: z.array(z.string()),
  }),
  email: z.object({
    disposable: z.boolean().optional(),
    mxValid: z.boolean().optional(),
    domainRisk: z.enum(["low", "medium", "high"]).optional(),
    reasons: z.array(z.string()),
  }),
  payment: z.object({
    avs: z.enum(["Y", "N", "P", "U"]).optional(),
    cvv: z.enum(["M", "N", "U"]).optional(),
    binCountry: z.string().optional(),
    binType: z.enum(["debit", "credit", "prepaid", "unknown"]).optional(),
    reasons: z.array(z.string()),
  }),
  ip: z.object({
    country: z.string().optional(),
    proxy: z.boolean().optional(),
    vpn: z.boolean().optional(),
    distanceToShipKm: z.number().optional(),
    reasons: z.array(z.string()),
  }),
  overall: z.object({
    score: z.number().min(0).max(100),
    decision: z.enum(["approved", "queued", "denied"]),
    reasons: z.array(z.string()),
  }),
});

export type VerificationResult = z.infer<typeof VerificationResultSchema>;

// ─── Decision ────────────────────────────────────────────────────────────────

export const DecisionSchema = z.object({
  status: z.enum(["approved", "queued", "denied"]),
  reasons: z.array(z.string()).min(1, "At least one reason is required"),
  notes: z.string().optional(),
  decidedBy: z.string().min(1, "Reviewer name is required"),
  decidedAt: z.string(),
});

export type Decision = z.infer<typeof DecisionSchema>;

// ─── Order Record (stored) ───────────────────────────────────────────────────

export interface OrderRecord {
  id: string;
  createdAt: string;
  order: OrderPayload;
  verification: VerificationResult;
  history: Decision[];
  currentStatus: "approved" | "queued" | "denied";
}

// ─── Claude Summary ──────────────────────────────────────────────────────────

export interface ClaudeSummaryRequest {
  input: { order: OrderPayload; verification: VerificationResult };
  mode: "rep_explanation" | "customer_message";
}

export interface ClaudeSummaryResponse {
  text: string;
}

// ─── Decision Modal Form ─────────────────────────────────────────────────────

export const DecisionFormSchema = z.object({
  status: z.enum(["approved", "queued", "denied"]),
  reasons: z.array(z.string()).min(1, "Select at least one reason"),
  notes: z.string().optional(),
  decidedBy: z.string().min(1, "Enter your name"),
});

export type DecisionFormValues = z.infer<typeof DecisionFormSchema>;
