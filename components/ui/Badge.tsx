import { clsx } from "clsx";
import type { ReactNode } from "react";

type Variant = "pass" | "warn" | "fail" | "neutral" | "info";

const variantMap: Record<Variant, string> = {
  pass: "badge-pass",
  warn: "badge-warn",
  fail: "badge-fail",
  neutral: "badge-neutral",
  info: "bg-blue-50 text-blue-700 border-blue-200",
};

interface BadgeProps {
  variant: Variant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span className={clsx("badge", variantMap[variant], className)}>
      {children}
    </span>
  );
}

export function DpvBadge({ dpv }: { dpv: "Y" | "N" | "S" | "D" | "U" }) {
  const map: Record<string, { label: string; variant: Variant }> = {
    Y: { label: "Confirmed", variant: "pass" },
    S: { label: "Secondary Needed", variant: "warn" },
    D: { label: "Unconfirmed", variant: "warn" },
    N: { label: "Not Deliverable", variant: "fail" },
    U: { label: "Unknown", variant: "neutral" },
  };
  const { label, variant } = map[dpv] ?? { label: dpv, variant: "neutral" };
  return <Badge variant={variant}>{label}</Badge>;
}

export function DecisionBadge({
  decision,
}: {
  decision: "approved" | "queued" | "denied";
}) {
  const map: Record<string, { label: string; variant: Variant }> = {
    approved: { label: "Approved", variant: "pass" },
    queued: { label: "Queued", variant: "warn" },
    denied: { label: "Denied", variant: "fail" },
  };
  const { label, variant } = map[decision] ?? { label: decision, variant: "neutral" };
  return <Badge variant={variant}>{label}</Badge>;
}
