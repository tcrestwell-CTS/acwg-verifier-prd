"use client";

import { clsx } from "clsx";
import type { VerificationResult } from "@/lib/schemas";
import { scoreBg, scoreColor } from "@/lib/risk";
import { scoreLabel } from "@/lib/format";
import { DecisionBadge } from "./ui/Badge";
import { LoadingSpinner } from "./ui/LoadingSpinner";

interface RiskSummaryProps {
  verification: VerificationResult;
  onApprove: () => void;
  onQueue: () => void;
  onDeny: () => void;
  isPending: boolean;
}

export function RiskSummary({
  verification,
  onApprove,
  onQueue,
  onDeny,
  isPending,
}: RiskSummaryProps) {
  const { score, decision, reasons } = verification.overall;

  const barWidth = `${score}%`;
  const barColor =
    score <= 25 ? "bg-green-500" : score <= 60 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className={clsx("card p-6 border-2", scoreBg(score))}>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Risk Assessment</h2>
          <p className="text-sm text-slate-500 mt-0.5">{scoreLabel(score)}</p>
        </div>
        <DecisionBadge decision={decision} />
      </div>

      {/* Score Bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500">Risk Score</span>
          <span className={clsx("text-2xl font-bold tabular-nums", scoreColor(score))}>
            {score}
            <span className="text-sm font-normal text-slate-400"> / 100</span>
          </span>
        </div>
        <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={clsx(
              "h-full rounded-full transition-all duration-700",
              barColor
            )}
            style={{ width: barWidth }}
            role="progressbar"
            aria-valuenow={score}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Risk score: ${score} out of 100`}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-1">
          <span>Low (≤25)</span>
          <span>Medium (26–60)</span>
          <span>High (&gt;60)</span>
        </div>
      </div>

      {/* Risk Reasons */}
      {reasons.length > 0 ? (
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Risk Signals
          </p>
          <div className="flex flex-wrap gap-2">
            {reasons.map((r, i) => (
              <span
                key={i}
                className={clsx(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border",
                  score <= 25
                    ? "bg-green-100 text-green-800 border-green-200"
                    : score <= 60
                    ? "bg-amber-100 text-amber-800 border-amber-200"
                    : "bg-red-100 text-red-800 border-red-200"
                )}
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-5 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">
            ✓ No significant risk signals detected. Order appears clean.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="border-t border-slate-200 pt-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Decision Actions
        </p>
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={onApprove}
            disabled={isPending}
            className="btn-success flex-col py-3"
            aria-label="Approve order"
          >
            {isPending ? (
              <LoadingSpinner size="sm" />
            ) : (
              <>
                <svg className="w-5 h-5 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Approve
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onQueue}
            disabled={isPending}
            className="btn flex-col py-3 bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-400"
            aria-label="Queue for review"
          >
            {isPending ? (
              <LoadingSpinner size="sm" />
            ) : (
              <>
                <svg className="w-5 h-5 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Queue
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onDeny}
            disabled={isPending}
            className="btn-danger flex-col py-3"
            aria-label="Deny order"
          >
            {isPending ? (
              <LoadingSpinner size="sm" />
            ) : (
              <>
                <svg className="w-5 h-5 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Deny
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
