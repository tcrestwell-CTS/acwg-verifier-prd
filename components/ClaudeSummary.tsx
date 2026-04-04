"use client";

import { useState } from "react";
import type { OrderPayload, VerificationResult } from "@/lib/schemas";
import { LoadingSpinner } from "./ui/LoadingSpinner";

interface ClaudeSummaryProps {
  order: OrderPayload;
  verification: VerificationResult;
}

type Mode = "rep_explanation" | "customer_message";

export function ClaudeSummary({ order, verification }: ClaudeSummaryProps) {
  const [repText, setRepText] = useState<string | null>(null);
  const [custText, setCustText] = useState<string | null>(null);
  const [loadingRep, setLoadingRep] = useState(false);
  const [loadingCust, setLoadingCust] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Mode>("rep_explanation");

  const fetchSummary = async (mode: Mode) => {
    setError(null);
    const setLoading = mode === "rep_explanation" ? setLoadingRep : setLoadingCust;
    const setText = mode === "rep_explanation" ? setRepText : setCustText;
    const endpoint = mode === "rep_explanation" ? "/api/ai/explain" : "/api/ai/message";

    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { order, verification }, mode }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { text: string };
      setText(data.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const activeText = activeTab === "rep_explanation" ? repText : custText;
  const isLoading = activeTab === "rep_explanation" ? loadingRep : loadingCust;
  const hasText = activeText !== null;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Regina Assist</p>
            <p className="text-xs text-slate-400">AI-generated summaries based on verification results</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("rep_explanation")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "rep_explanation"
              ? "border-brand-600 text-brand-700 bg-brand-50"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Rep Explanation
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("customer_message")}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "customer_message"
              ? "border-brand-600 text-brand-700 bg-brand-50"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Customer Message
        </button>
      </div>

      {/* Content */}
      <div className="p-5">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            Failed to generate summary: {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner label="Generating summary…" />
          </div>
        ) : hasText ? (
          <div className="space-y-4">
            <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-4">
              {activeText}
            </pre>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(activeText ?? "")
                }
                className="btn-secondary text-xs"
              >
                Copy Text
              </button>
              <button
                type="button"
                onClick={() => fetchSummary(activeTab)}
                className="btn-secondary text-xs"
              >
                Regenerate
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-slate-400 mb-4">
              {activeTab === "rep_explanation"
                ? "Generate a concise explanation of risk signals for the sales rep."
                : "Generate a polite, non-accusatory message template for the customer."}
            </p>
            <button
              type="button"
              onClick={() => fetchSummary(activeTab)}
              disabled={isLoading}
              className="btn-primary"
            >
              {activeTab === "rep_explanation"
                ? "Generate Explanation"
                : "Generate Customer Message"}
            </button>
          </div>
        )}

        {!hasText && !isLoading && (
          <p className="text-xs text-slate-400 text-center mt-4">
            AI assists with summaries — all decisions are made by human reviewers.
          </p>
        )}
      </div>
    </div>
  );
}
