"use client";

interface DeviceSignals {
  fingerprintId: string | null;
  riskScore: number;
  isBot: boolean;
  isEmulator: boolean;
  isKnownDevice: boolean;
  browserFamily: string | null;
  reasons: string[];
}

export function DevicePanel({ device }: { device: DeviceSignals }) {
  const color =
    device.riskScore <= 25 ? "text-green-600" :
    device.riskScore <= 60 ? "text-amber-600" : "text-red-600";

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Device</h3>
        <span className={`text-sm font-bold tabular-nums ${color}`}>
          Risk {device.riskScore}/100
        </span>
      </div>
      <div className="px-4 py-3 space-y-2">
        {device.isBot && (
          <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg border border-red-200">
            <span className="text-red-600 text-sm">🤖</span>
            <span className="text-sm font-semibold text-red-700">Bot or automation detected</span>
          </div>
        )}
        {device.isEmulator && (
          <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg border border-amber-200">
            <span className="text-amber-600 text-sm">⚠</span>
            <span className="text-sm text-amber-700">Emulated device environment</span>
          </div>
        )}
        <InfoRow label="Known device" value={device.isKnownDevice ? "Yes — returning" : "No — first seen"} />
        {device.browserFamily && <InfoRow label="Browser" value={device.browserFamily} />}
        {device.fingerprintId && (
          <InfoRow label="Fingerprint" value={`${device.fingerprintId.slice(0, 8)}…`} />
        )}
        {device.reasons.filter((r) => !r.includes("stub")).map((r, i) => (
          <p key={i} className="text-xs text-slate-500 italic">{r}</p>
        ))}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-medium text-slate-700">{value}</span>
    </div>
  );
}
