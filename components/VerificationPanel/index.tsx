"use client";

import { useState } from "react";
import { clsx } from "clsx";
import type { VerificationResult } from "@/lib/schemas";
import { AddressSection } from "./AddressSection";
import {
  EmailSection,
  PaymentSection,
  IpSection,
} from "./sections";
import { PhoneSection } from "./PhoneSection";

interface SectionWrapperProps {
  title: string;
  icon: string;
  status: "pass" | "warn" | "fail" | "neutral";
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const statusStyles = {
  pass: "border-green-200 bg-green-50",
  warn: "border-amber-200 bg-amber-50",
  fail: "border-red-200 bg-red-50",
  neutral: "border-slate-200 bg-slate-50",
};

const statusDotStyles = {
  pass: "bg-green-500",
  warn: "bg-amber-500",
  fail: "bg-red-500",
  neutral: "bg-slate-400",
};

function SectionWrapper({
  title,
  icon,
  status,
  children,
  defaultOpen = true,
}: SectionWrapperProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={clsx("rounded-xl border overflow-hidden transition-colors", statusStyles[status])}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">{icon}</span>
          <span className="font-semibold text-sm text-slate-800">{title}</span>
          <span
            className={clsx(
              "w-2 h-2 rounded-full flex-shrink-0",
              statusDotStyles[status]
            )}
            aria-label={`Status: ${status}`}
          />
        </div>
        <svg
          className={clsx(
            "w-4 h-4 text-slate-400 transition-transform",
            open && "rotate-180"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-current border-opacity-10 pt-3 bg-white">
          {children}
        </div>
      )}
    </div>
  );
}

function sectionStatus(reasons: string[], isRisky: boolean): "pass" | "warn" | "fail" {
  if (isRisky) return "fail";
  if (reasons.length > 0) return "warn";
  return "pass";
}

interface VerificationPanelProps {
  verification: VerificationResult;
}

export function VerificationPanel({ verification }: VerificationPanelProps) {
  const { address, phone, email, payment, ip } = verification;

  const addressStatus = sectionStatus(
    address.reasons,
    !address.deliverable || address.dpv === "N"
  );
  const phoneStatus = sectionStatus(
    phone.reasons,
    phone.type === "voip" || phone.active === false
  );
  const emailStatus = sectionStatus(
    email.reasons,
    email.disposable === true || email.mxValid === false
  );
  const paymentStatus = sectionStatus(
    payment.reasons,
    payment.avs === "N" || payment.cvv === "N"
  );
  const ipStatus = sectionStatus(
    ip.reasons,
    ip.proxy === true || ip.vpn === true
  );

  return (
    <div className="space-y-3">
      <SectionWrapper title="Address" icon="🏠" status={addressStatus}>
        <AddressSection data={address} />
      </SectionWrapper>

      <SectionWrapper title="Phone" icon="📱" status={phoneStatus}>
        <PhoneSection data={phone} />
      </SectionWrapper>

      <SectionWrapper title="Email" icon="📧" status={emailStatus}>
        <EmailSection data={email} />
      </SectionWrapper>

      <SectionWrapper title="Payment Signals" icon="💳" status={paymentStatus}>
        <PaymentSection data={payment} />
      </SectionWrapper>

      <SectionWrapper title="IP / Geolocation" icon="🌐" status={ipStatus}>
        <IpSection data={ip} />
      </SectionWrapper>
    </div>
  );
}
