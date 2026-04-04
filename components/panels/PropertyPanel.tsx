"use client";

interface PropertySignals {
  ownerName: string | null;
  ownershipYears: number | null;
  matchLevel: "full" | "partial" | "none" | "unavailable";
  isCommercial: boolean;
  isVacant: boolean;
  reasons: string[];
}

const MATCH_CONFIG = {
  full:        { label: "Full match",    className: "badge-pass" },
  partial:     { label: "Partial match", className: "badge-warn" },
  none:        { label: "No match",      className: "badge-fail" },
  unavailable: { label: "Unavailable",   className: "badge-neutral" },
};

export function PropertyPanel({ property }: { property: PropertySignals }) {
  const match = MATCH_CONFIG[property.matchLevel];

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Property</h3>
        <span className={`badge ${match.className}`}>{match.label}</span>
      </div>
      <div className="px-4 py-3 space-y-2">
        {(property.isCommercial || property.isVacant) && (
          <div className="p-2 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-700 font-medium">
            {property.isVacant ? "⚠ Address appears vacant" : ""}
            {property.isCommercial ? "⚠ Commercial address" : ""}
          </div>
        )}
        {property.ownerName && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Record owner</span>
            <span className="text-xs font-medium text-slate-700">{property.ownerName}</span>
          </div>
        )}
        {property.ownershipYears !== null && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Years at address</span>
            <span className="text-xs font-medium text-slate-700">{property.ownershipYears}y</span>
          </div>
        )}
        {property.reasons.filter((r) => !r.includes("stub")).map((r, i) => (
          <p key={i} className="text-xs text-slate-500 italic">{r}</p>
        ))}
      </div>
    </div>
  );
}
