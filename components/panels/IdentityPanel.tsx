"use client";

interface IdentitySignals {
  confidence: number;
  nameAddressMatch: boolean;
  emailLinked: boolean;
  phoneLinked: boolean;
  reasons: string[];
}

export function IdentityPanel({ identity }: { identity: IdentitySignals }) {
  const color =
    identity.confidence >= 70 ? "text-green-600" :
    identity.confidence >= 40 ? "text-amber-600" : "text-red-600";

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Identity</h3>
        <span className={`text-sm font-bold tabular-nums ${color}`}>
          {identity.confidence}/100
        </span>
      </div>
      <div className="px-4 py-3 space-y-2">
        <MatchRow label="Name ↔ Address" matched={identity.nameAddressMatch} />
        <MatchRow label="Email linked" matched={identity.emailLinked} />
        <MatchRow label="Phone linked" matched={identity.phoneLinked} />
        {identity.reasons.filter((r) => !r.includes("stub")).map((r, i) => (
          <p key={i} className="text-xs text-slate-500 italic">{r}</p>
        ))}
      </div>
    </div>
  );
}

function MatchRow({ label, matched }: { label: string; matched: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm ${matched ? "text-green-600" : "text-amber-500"}`}>
        {matched ? "✓" : "⚠"}
      </span>
      <span className="text-sm text-slate-700">{label}</span>
    </div>
  );
}
