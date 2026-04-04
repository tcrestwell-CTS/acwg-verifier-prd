"use client";

interface TimelineStep {
  label: string;
  status: "complete" | "active" | "pending" | "skipped";
  detail?: string;
}

export function RiskTimeline({ steps }: { steps: TimelineStep[] }) {
  const statusConfig = {
    complete: { dot: "bg-green-500", line: "bg-green-300", text: "text-green-700" },
    active:   { dot: "bg-blue-500 ring-4 ring-blue-100", line: "bg-slate-200", text: "text-blue-700" },
    pending:  { dot: "bg-slate-200", line: "bg-slate-200", text: "text-slate-400" },
    skipped:  { dot: "bg-slate-100 border-2 border-slate-200", line: "bg-slate-100", text: "text-slate-300" },
  };

  return (
    <div className="card p-4">
      <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-4">
        Verification Timeline
      </h3>
      <div className="flex items-center gap-0">
        {steps.map((step, i) => {
          const cfg = statusConfig[step.status];
          const isLast = i === steps.length - 1;
          return (
            <div key={i} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${cfg.dot}`} />
                <p className={`text-xs font-medium mt-1 text-center whitespace-nowrap ${cfg.text}`}>
                  {step.label}
                </p>
                {step.detail && (
                  <p className="text-xs text-slate-400 text-center mt-0.5">{step.detail}</p>
                )}
              </div>
              {!isLast && (
                <div className={`flex-1 h-0.5 mx-1 ${cfg.line}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper to build timeline steps from verification state
export function buildTimeline(opts: {
  verified: boolean;
  requiresOtp: boolean;
  otpComplete: boolean;
  requiresDoc: boolean;
  docComplete: boolean;
  decision: string;
}): TimelineStep[] {
  return [
    {
      label: "Verify",
      status: opts.verified ? "complete" : "active",
    },
    {
      label: "OTP",
      status: !opts.requiresOtp
        ? "skipped"
        : opts.otpComplete
        ? "complete"
        : opts.verified
        ? "active"
        : "pending",
    },
    {
      label: "ID Check",
      status: !opts.requiresDoc
        ? "skipped"
        : opts.docComplete
        ? "complete"
        : opts.otpComplete || !opts.requiresOtp
        ? "active"
        : "pending",
    },
    {
      label: "Decision",
      status: opts.decision && opts.verified
        ? "complete"
        : "pending",
      detail: opts.decision || undefined,
    },
  ];
}
