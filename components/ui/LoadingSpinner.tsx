import { clsx } from "clsx";

interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

const sizes = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-10 h-10" };

export function LoadingSpinner({ size = "md", className, label }: Props) {
  return (
    <div className={clsx("flex items-center gap-2", className)} role="status">
      <svg
        className={clsx("animate-spin text-brand-600", sizes[size])}
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      {label && <span className="text-sm text-slate-500">{label}</span>}
      <span className="sr-only">{label ?? "Loading…"}</span>
    </div>
  );
}

export function LoadingPage({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <LoadingSpinner size="lg" label={label} />
    </div>
  );
}
