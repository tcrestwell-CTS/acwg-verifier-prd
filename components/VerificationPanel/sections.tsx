import { Badge } from "@/components/ui/Badge";
import type { VerificationResult } from "@/lib/schemas";

// ── Email Section ─────────────────────────────────────────────────────────────

interface EmailProps {
  data: VerificationResult["email"];
}

export function EmailSection({ data }: EmailProps) {
  const domainVariant =
    data.domainRisk === "high"
      ? "fail"
      : data.domainRisk === "medium"
      ? "warn"
      : "pass";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {data.disposable !== undefined && (
          <Badge variant={data.disposable ? "fail" : "pass"}>
            {data.disposable ? "Disposable" : "Legitimate Domain"}
          </Badge>
        )}
        {data.mxValid !== undefined && (
          <Badge variant={data.mxValid ? "pass" : "fail"}>
            {data.mxValid ? "Valid MX" : "No MX Records"}
          </Badge>
        )}
        {data.domainRisk && (
          <Badge variant={domainVariant}>
            Domain Risk: {data.domainRisk.charAt(0).toUpperCase() + data.domainRisk.slice(1)}
          </Badge>
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

// ── Payment Section ───────────────────────────────────────────────────────────

interface PaymentProps {
  data: VerificationResult["payment"];
}

export function PaymentSection({ data }: PaymentProps) {
  const avsVariant =
    data.avs === "Y" ? "pass" : data.avs === "P" ? "warn" : data.avs === "N" ? "fail" : "neutral";
  const cvvVariant =
    data.cvv === "M" ? "pass" : data.cvv === "N" ? "fail" : "neutral";
  const binVariant =
    data.binType === "prepaid" ? "warn" : data.binType === "credit" || data.binType === "debit" ? "pass" : "neutral";

  const avsLabel: Record<string, string> = {
    Y: "AVS: Full Match",
    P: "AVS: Partial Match",
    N: "AVS: No Match",
    U: "AVS: Unavailable",
  };

  const cvvLabel: Record<string, string> = {
    M: "CVV: Match",
    N: "CVV: No Match",
    U: "CVV: Unavailable",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {data.avs && (
          <Badge variant={avsVariant}>{avsLabel[data.avs] ?? `AVS: ${data.avs}`}</Badge>
        )}
        {data.cvv && (
          <Badge variant={cvvVariant}>{cvvLabel[data.cvv] ?? `CVV: ${data.cvv}`}</Badge>
        )}
        {data.binType && (
          <Badge variant={binVariant}>
            {data.binType.charAt(0).toUpperCase() + data.binType.slice(1)} Card
          </Badge>
        )}
        {data.binCountry && (
          <Badge variant="neutral">BIN Country: {data.binCountry}</Badge>
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

// ── IP Section ────────────────────────────────────────────────────────────────

interface IpProps {
  data: VerificationResult["ip"];
}

export function IpSection({ data }: IpProps) {
  const isRisky = data.proxy || data.vpn;
  const distRisky =
    data.distanceToShipKm !== undefined && data.distanceToShipKm > 800;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {data.country && (
          <Badge variant={data.country === "US" ? "pass" : "warn"}>
            🌐 {data.country}
          </Badge>
        )}
        {data.proxy !== undefined && (
          <Badge variant={data.proxy ? "fail" : "pass"}>
            {data.proxy ? "Proxy Detected" : "No Proxy"}
          </Badge>
        )}
        {data.vpn !== undefined && (
          <Badge variant={data.vpn ? "fail" : "pass"}>
            {data.vpn ? "VPN Detected" : "No VPN"}
          </Badge>
        )}
      </div>

      {data.distanceToShipKm !== undefined && (
        <div
          className={`text-xs px-3 py-2 rounded-lg border ${
            distRisky
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-green-50 border-green-200 text-green-800"
          }`}
        >
          📡 IP → Shipping distance:{" "}
          <strong>{data.distanceToShipKm.toLocaleString()} km</strong>
          {distRisky && " — exceeds 800 km threshold"}
        </div>
      )}

      {isRisky && (
        <div className="text-xs px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-800">
          ⚠ IP anonymization detected — customer location cannot be confirmed.
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
