import { Badge } from "@/components/ui/Badge";
import type { VerificationResult } from "@/lib/schemas";

interface Props {
  data: VerificationResult["phone"];
}

export function PhoneSection({ data }: Props) {
  const typeVariant =
    data.type === "voip"
      ? "fail"
      : data.type === "mobile"
      ? "pass"
      : "neutral";

  const activeVariant =
    data.active === true ? "pass" : data.active === false ? "fail" : "neutral";

  const riskVariant =
    data.riskScore === undefined
      ? "neutral"
      : data.riskScore > 70
      ? "fail"
      : data.riskScore > 30
      ? "warn"
      : "pass";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {data.type && (
          <Badge variant={typeVariant}>
            {data.type.charAt(0).toUpperCase() + data.type.slice(1)}
          </Badge>
        )}
        {data.active !== undefined && (
          <Badge variant={activeVariant}>
            {data.active ? "Active" : "Inactive"}
          </Badge>
        )}
        {data.carrier && (
          <Badge variant="neutral">{data.carrier}</Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {data.e164 && (
          <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-2">
            <p className="text-slate-400 mb-0.5">E.164 Normalized</p>
            <p className="font-mono text-slate-800">{data.e164}</p>
          </div>
        )}
        {data.riskScore !== undefined && (
          <div className={`text-xs rounded-lg p-2 border ${
            data.riskScore > 70
              ? "bg-red-50 border-red-200"
              : data.riskScore > 30
              ? "bg-amber-50 border-amber-200"
              : "bg-green-50 border-green-200"
          }`}>
            <p className="text-slate-400 mb-0.5">Carrier Risk Score</p>
            <p className={`font-semibold ${
              data.riskScore > 70 ? "text-red-700" : data.riskScore > 30 ? "text-amber-700" : "text-green-700"
            }`}>
              {data.riskScore} / 100
            </p>
          </div>
        )}
      </div>

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
