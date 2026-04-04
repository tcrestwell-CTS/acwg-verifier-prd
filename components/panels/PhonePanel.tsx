"use client";

interface PhoneIntelSignals {
  simSwapRecent: boolean;
  simSwapDaysAgo: number | null;
  lineType: "mobile" | "landline" | "voip" | "unknown";
  ownershipMatch: boolean | null;
  carrierName: string | null;
  reasons: string[];
}

export function PhonePanel({ phone }: { phone: PhoneIntelSignals }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Phone Intelligence</h3>
      </div>
      <div className="px-4 py-3 space-y-2">
        {phone.simSwapRecent && (
          <div className="p-2 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm font-semibold text-red-700">🚨 Recent SIM Swap</p>
            {phone.simSwapDaysAgo !== null && (
              <p className="text-xs text-red-600 mt-0.5">{phone.simSwapDaysAgo} days ago</p>
            )}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Line type</span>
          <span className={`text-xs font-medium ${
            phone.lineType === "voip" ? "text-amber-600" : "text-slate-700"
          }`}>
            {phone.lineType}
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
        {phone.reasons.filter((r) => !r.includes("stub")).map((r, i) => (
          <p key={i} className="text-xs text-slate-500 italic">{r}</p>
        ))}
      </div>
    </div>
  );
}
