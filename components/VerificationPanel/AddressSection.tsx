import { Badge, DpvBadge } from "@/components/ui/Badge";
import type { VerificationResult } from "@/lib/schemas";

interface Props {
  data: VerificationResult["address"];
}

export function AddressSection({ data }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <DpvBadge dpv={data.dpv} />
        <Badge variant={data.deliverable ? "pass" : "fail"}>
          {data.deliverable ? "Deliverable" : "Not Deliverable"}
        </Badge>
        <Badge variant={data.residential ? "neutral" : "info"}>
          {data.residential ? "Residential" : "Commercial"}
        </Badge>
        {data.apartmentNeeded && (
          <Badge variant="warn">Unit # Needed</Badge>
        )}
      </div>

      {data.normalized && (
        <div className="text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-700">
          <p className="text-xs text-slate-400 mb-1 font-sans">Normalized address:</p>
          <p>{data.normalized.line1}</p>
          {data.normalized.line2 && <p>{data.normalized.line2}</p>}
          <p>
            {data.normalized.city}, {data.normalized.state}{" "}
            {data.normalized.postalCode}
          </p>
        </div>
      )}

      {data.distanceKm !== undefined && (
        <div className={`text-xs px-3 py-2 rounded-lg border ${data.distanceKm > 500 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-green-50 border-green-200 text-green-800"}`}>
          📍 Billing ↔ Shipping distance:{" "}
          <strong>{data.distanceKm.toLocaleString()} km</strong>
          {data.distanceKm > 500 && " — exceeds 500 km threshold"}
        </div>
      )}

      {data.reasons.length > 0 && (
        <ul className="space-y-1">
          {data.reasons.map((r, i) => (
            <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
              <span className="mt-0.5 text-slate-400">›</span>
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
