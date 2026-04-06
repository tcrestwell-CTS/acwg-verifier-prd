"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { OrderPayloadSchema, type OrderPayload } from "@/lib/schemas";
import { normalizePhone, normalizeState, normalizeZip } from "@/lib/format";
import { useState } from "react";
import { LoadingSpinner } from "./ui/LoadingSpinner";

interface OrderFormProps {
  onSubmit: (data: OrderPayload) => Promise<unknown>;
  isLoading: boolean;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="form-error" role="alert">{message}</p>;
}

export function OrderForm({ onSubmit, isLoading }: OrderFormProps) {
  const [sameAddress, setSameAddress] = useState(true);

  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<OrderPayload>({
    resolver: zodResolver(OrderPayloadSchema),
    defaultValues: {
      items: [{ sku: "", name: "", qty: 1, price: "" as unknown as number }],
      paymentMeta: {},
      context: {},
      billingAddress: { country: "US" },
      shippingAddress: { country: "US" },
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  // Mirror a billing field change into shipping when same-as-billing is on
  const mirrorToShipping = (field: keyof OrderPayload["billingAddress"], value: string) => {
    if (sameAddress) {
      setValue(`shippingAddress.${field}` as never, value as never, { shouldValidate: false });
    }
  };

  const handleSameAddressToggle = (checked: boolean) => {
    setSameAddress(checked);
    if (checked) {
      const billing = getValues("billingAddress");
      setValue("shippingAddress", { ...billing }, { shouldValidate: false });
    }
  };

  const submit = async (data: OrderPayload) => {
    const normalized: OrderPayload = {
      ...data,
      contact: {
        ...data.contact,
        phone: normalizePhone(data.contact.phone),
      },
      shippingAddress: sameAddress ? data.billingAddress : data.shippingAddress,
    };
    await onSubmit(normalized);
  };

  const be = errors.billingAddress as Record<string, { message?: string }> | undefined;
  const se = errors.shippingAddress as Record<string, { message?: string }> | undefined;

  return (
    <form
      onSubmit={handleSubmit(submit, (errs) => {
        console.error("Form errors:", JSON.stringify(errs, null, 2));
      })}
      noValidate
      className="space-y-8"
    >
      {/* Customer */}
      <div className="card p-6">
        <h2 className="section-header">Customer Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label" htmlFor="firstName">First Name *</label>
            <input id="firstName" className="form-input" placeholder="Timothy" {...register("customer.firstName")} />
            <FieldError message={errors.customer?.firstName?.message} />
          </div>
          <div>
            <label className="form-label" htmlFor="lastName">Last Name *</label>
            <input id="lastName" className="form-input" placeholder="Crestwell" {...register("customer.lastName")} />
            <FieldError message={errors.customer?.lastName?.message} />
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="card p-6">
        <h2 className="section-header">Contact Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label" htmlFor="email">Email Address *</label>
            <input id="email" type="email" className="form-input" placeholder="tim@crestwellgetaways.com" {...register("contact.email")} />
            <FieldError message={errors.contact?.email?.message} />
          </div>
          <div>
            <label className="form-label" htmlFor="phone">Phone Number *</label>
            <input id="phone" type="tel" className="form-input" placeholder="(423) 555-0100" {...register("contact.phone")} />
            <FieldError message={errors.contact?.phone?.message} />
            <p className="text-xs text-slate-400 mt-1">Will be normalized to E.164 format</p>
          </div>
        </div>
      </div>

      {/* Billing Address */}
      <div className="card p-6">
        <h2 className="section-header">Billing Address</h2>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="form-label" htmlFor="bill-line1">Street Address *</label>
            <input id="bill-line1" className="form-input" placeholder="105 Pine Hill Drive"
              {...register("billingAddress.line1", {
                onChange: (e) => mirrorToShipping("line1", e.target.value),
              })} />
            <FieldError message={be?.line1?.message} />
          </div>
          <div>
            <label className="form-label" htmlFor="bill-line2">Apt / Suite</label>
            <input id="bill-line2" className="form-input" placeholder="Apt 4B"
              {...register("billingAddress.line2", {
                onChange: (e) => mirrorToShipping("line2", e.target.value),
              })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="form-label" htmlFor="bill-city">City *</label>
              <input id="bill-city" className="form-input" placeholder="Calhoun"
                {...register("billingAddress.city", {
                  onChange: (e) => mirrorToShipping("city", e.target.value),
                })} />
              <FieldError message={be?.city?.message} />
            </div>
            <div>
              <label className="form-label" htmlFor="bill-state">State *</label>
              <input id="bill-state" className="form-input uppercase" placeholder="GA" maxLength={2}
                {...register("billingAddress.state", {
                  setValueAs: (v) => normalizeState(v),
                  onChange: (e) => mirrorToShipping("state", normalizeState(e.target.value)),
                })} />
              <FieldError message={be?.state?.message} />
            </div>
            <div>
              <label className="form-label" htmlFor="bill-zip">ZIP *</label>
              <input id="bill-zip" className="form-input" placeholder="30701" maxLength={10}
                {...register("billingAddress.postalCode", {
                  setValueAs: (v) => normalizeZip(v),
                  onChange: (e) => mirrorToShipping("postalCode", normalizeZip(e.target.value)),
                })} />
              <FieldError message={be?.postalCode?.message} />
            </div>
          </div>
        </div>
      </div>

      {/* Shipping Address */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-header mb-0">Shipping Address</h2>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={sameAddress}
              onChange={(e) => handleSameAddressToggle(e.target.checked)}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Same as billing
          </label>
        </div>
        {sameAddress ? (
          <p className="text-sm text-slate-500 italic">Shipping address will match billing address.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="form-label" htmlFor="ship-line1">Street Address *</label>
              <input id="ship-line1" className="form-input" placeholder="123 Main St" {...register("shippingAddress.line1")} />
              <FieldError message={se?.line1?.message} />
            </div>
            <div>
              <label className="form-label" htmlFor="ship-line2">Apt / Suite</label>
              <input id="ship-line2" className="form-input" placeholder="Apt 4B" {...register("shippingAddress.line2")} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="form-label" htmlFor="ship-city">City *</label>
                <input id="ship-city" className="form-input" {...register("shippingAddress.city")} />
                <FieldError message={se?.city?.message} />
              </div>
              <div>
                <label className="form-label" htmlFor="ship-state">State *</label>
                <input id="ship-state" className="form-input uppercase" maxLength={2}
                  {...register("shippingAddress.state", { setValueAs: normalizeState })} />
                <FieldError message={se?.state?.message} />
              </div>
              <div>
                <label className="form-label" htmlFor="ship-zip">ZIP *</label>
                <input id="ship-zip" className="form-input" maxLength={10}
                  {...register("shippingAddress.postalCode", { setValueAs: normalizeZip })} />
                <FieldError message={se?.postalCode?.message} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Order Items */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-header mb-0">Order Items</h2>
          <button type="button" onClick={() => append({ sku: "", name: "", qty: 1, price: "" as unknown as number })} className="btn-secondary text-xs">
            + Add Item
          </button>
        </div>
        <div className="space-y-3">
          {fields.map((field, idx) => (
            <div key={field.id} className="grid grid-cols-12 gap-3 items-start p-3 bg-slate-50 rounded-lg">
              <div className="col-span-2">
                <label className="form-label text-xs" htmlFor={`sku-${idx}`}>Order ID</label>
                <input id={`sku-${idx}`} className="form-input text-xs" placeholder="ORD-2026-001" {...register(`items.${idx}.sku`)} />
                <FieldError message={errors.items?.[idx]?.sku?.message} />
              </div>
              <div className="col-span-7">
                <label className="form-label text-xs" htmlFor={`name-${idx}`}>Order Name</label>
                <input id={`name-${idx}`} className="form-input text-xs" placeholder="Caribbean Cruise Deposit" {...register(`items.${idx}.name`)} />
                <FieldError message={errors.items?.[idx]?.name?.message} />
              </div>

              <div className="col-span-2">
                <label className="form-label text-xs" htmlFor={`price-${idx}`}>Price ($)</label>
                <input id={`price-${idx}`} type="number" min={0.01} step={0.01} className="form-input text-xs" {...register(`items.${idx}.price`, { valueAsNumber: true })} />
                <FieldError message={errors.items?.[idx]?.price?.message} />
              </div>
              <div className="col-span-1 pt-6">
                {fields.length > 1 && (
                  <button type="button" onClick={() => remove(idx)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" aria-label="Remove item">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payment — card details entered via Stripe panel after verification runs */}
      <div className="card p-6 border border-blue-100 bg-blue-50/30">
        <h2 className="section-header">Payment Verification</h2>
        <p className="text-sm text-slate-600">
          Card details are collected securely via the <strong>Card Verification panel</strong> that appears after running verification.
          The rep enters the full card number there — it is tokenized by Stripe and never stored.
        </p>
        <p className="text-xs text-slate-400 mt-2">
          AVS and CVV results will appear in the results panel after the card check is run.
        </p>
      </div>

      {/* Context */}
      <div className="card p-6">
        <h2 className="section-header">Session Context (optional)</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label" htmlFor="ip">Customer IP Address</label>
            <input id="ip" className="form-input font-mono text-sm" placeholder="75.148.22.100" {...register("context.ip")} />
          </div>
          <div>
            <label className="form-label" htmlFor="userAgent">User Agent</label>
            <input id="userAgent" className="form-input text-sm" placeholder="Mozilla/5.0…" {...register("context.userAgent")} />
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <button type="submit" disabled={isLoading} className="btn-primary px-8 py-3 text-base">
          {isLoading ? (
            <><LoadingSpinner size="sm" /> Running Verification…</>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 013 10c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286z" />
              </svg>
              Run Verification
            </>
          )}
        </button>
      </div>
    </form>
  );
}
