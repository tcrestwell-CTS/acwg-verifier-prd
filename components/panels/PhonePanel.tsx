"use client";

interface PhoneIntelSignals {
  simSwapRecent: boolean;
  simSwapDaysAgo: number | null;
  lineType: "mobile" | "landline" | "voip" | "unknown";
  ownershipMatch: boolean | null;
  carrierName: string | null;
  fraudScore?: number;
  active?: boolean;
  recentAbuse?: boolean;
  reasons: string[];
}

export function PhonePanel({ phone }: { phone: PhoneIntelSignals }) {
  const scoreColor =
    (phone.fraudScore ?? 0) >= 75 ? "text-red-600" :
    (phone.fraudScore ?? 0) >= 40 ? "text-amber-600" : "text-green-600";

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-1.5"><span>📱</span> Phone Intel</h3>
        {phone.fraudScore !== undefined && (
          <span className={`text-sm font-bold tabular-nums ${scoreColor}`}>
            Risk {phone.fraudScore}/100
          </span>
        )}
      </div>
      <div className="px-4 py-3 space-y-2">
        {phone.simSwapRecent && (
          <div className="p-2 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm font-semibold text-red-700">🚨 Possible SIM Swap Activity</p>
            {phone.simSwapDaysAgo !== null && (
              <p className="text-xs text-red-600 mt-0.5">{phone.simSwapDaysAgo} days ago</p>
            )}
          </div>
        )}
        {phone.recentAbuse && !phone.simSwapRecent && (
          <div className="p-2 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-sm font-semibold text-amber-700">⚠ Recent abuse detected</p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Line type</span>
          <span className={`text-xs font-medium ${
            phone.lineType === "voip" ? "text-amber-600" :
            phone.lineType === "mobile" ? "text-green-600" : "text-slate-700"
          }`}>
            {phone.lineType}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Status</span>
          <span className={`text-xs font-medium ${phone.active !== false ? "text-green-600" : "text-red-600"}`}>
            {phone.active !== false ? "Active" : "Inactive"}
          </span>
        </div>
        {phone.carrierName && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Carrier</span>
            <span className="text-xs font-medium text-slate-700">{phone.carrierName}</span>
          </div>
        )}
        {phone.ownershipMatch !== null && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Name match</span>
            <span className={`text-xs font-medium ${phone.ownershipMatch ? "text-green-600" : "text-red-600"}`}>
              {phone.ownershipMatch ? "✓ Matches" : "✗ Mismatch"}
            </span>
          </div>
        )}
        {phone.reasons.filter((r) => !r.includes("not configured") && !r.includes("failed")).map((r, i) => (
          <p key={i} className={`text-xs ${r.startsWith("✓") ? "text-green-600" : "text-slate-500"} italic`}>
            {r}
          </p>
        ))}
      </div>
    </div>
  );
}
