"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/Toast";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { formatDate } from "@/lib/format";

interface FeatureSettings {
  id: string;
  identityIntelligence: boolean;
  propertyOwnership: boolean;
  deviceIntelligence: boolean;
  phoneRiskPlus: boolean;
  otpStepUp: boolean;
  documentRequest: boolean;
  payment3ds: boolean;
  updatedAt: string;
  updatedBy: string;
}

interface ToggleProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  badge?: string;
}

function Toggle({ label, description, value, onChange, badge }: ToggleProps) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-slate-100 last:border-0">
      <div className="flex-1 mr-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          {badge && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          value ? "bg-blue-600" : "bg-slate-200"
        }`}
        role="switch"
        aria-checked={value}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const [local, setLocal] = useState<Partial<FeatureSettings>>({});

  const { data: settings, isLoading } = useQuery<FeatureSettings>({
    queryKey: ["feature-settings"],
    queryFn: async () => (await fetch("/api/admin/settings")).json(),
  });

  // Sync local state when settings load
  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  const { data: auditLog } = useQuery({
    queryKey: ["settings-audit"],
    queryFn: async () => (await fetch("/api/admin/settings?audit=true")).json(),
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Partial<FeatureSettings>) => {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      success("Settings saved", "Verification feature settings updated");
      qc.invalidateQueries({ queryKey: ["feature-settings"] });
      qc.invalidateQueries({ queryKey: ["settings-audit"] });
    },
    onError: (err: Error) => toastError("Save failed", err.message),
  });

  const toggle = (key: keyof FeatureSettings) => (value: boolean) => {
    const updated = { ...local, [key]: value };
    setLocal(updated);
    saveMutation.mutate({ [key]: value });
  };

  const merged = { ...settings, ...local } as FeatureSettings;

  if (isLoading) return <LoadingPage label="Loading settings…" />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Verification Settings</h1>
        <p className="text-slate-500 mt-1">
          Control which advanced signals are active during order verification. Changes take effect immediately.
        </p>
      </div>

      {/* Advanced Signals */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Advanced Signals</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Require separate API keys — see .env.example for configuration
          </p>
        </div>
        <div className="px-5">
          <Toggle
            label="Identity Intelligence"
            description="Cross-reference name, address, email, and phone against identity graph. Detects synthetic identities and name mismatches."
            value={merged.identityIntelligence ?? false}
            onChange={toggle("identityIntelligence")}
            badge="API key required"
          />
          <Toggle
            label="Property Ownership"
            description="Verify billing address against property records. Flags address mismatches, vacant properties, and freight forwarders."
            value={merged.propertyOwnership ?? false}
            onChange={toggle("propertyOwnership")}
            badge="API key required"
          />
          <Toggle
            label="Device Intelligence"
            description="Analyze device fingerprint, bot detection, and VPN/proxy signals from the request context."
            value={merged.deviceIntelligence ?? false}
            onChange={toggle("deviceIntelligence")}
            badge="API key required"
          />
          <Toggle
            label="Phone Risk Plus"
            description="Enhanced phone verification including SIM swap detection, ownership match, and carrier intelligence."
            value={merged.phoneRiskPlus ?? false}
            onChange={toggle("phoneRiskPlus")}
            badge="API key required"
          />
        </div>
      </div>

      {/* Step-Up Flows */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Step-Up Flows</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Customer verification actions triggered when risk signals are elevated
          </p>
        </div>
        <div className="px-5">
          <Toggle
            label="OTP Step-Up"
            description="Send SMS verification code to customer. Required for cross-region shipping, high-value orders, and VoIP numbers."
            value={merged.otpStepUp ?? true}
            onChange={toggle("otpStepUp")}
          />
          <Toggle
            label="Document Request"
            description="Request photo ID or proof of address for high-risk orders. Includes secure upload link generation."
            value={merged.documentRequest ?? true}
            onChange={toggle("documentRequest")}
          />
          <Toggle
            label="Payment 3DS"
            description="Trigger 3D Secure step-up for weak payment signals. Adds cardholder authentication layer."
            value={merged.payment3ds ?? false}
            onChange={toggle("payment3ds")}
            badge="Stripe key required"
          />
        </div>
      </div>

      {/* Status bar */}
      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Updated</p>
          <p className="text-sm text-slate-700 mt-0.5">
            {settings?.updatedAt ? formatDate(settings.updatedAt) : "—"} by {settings?.updatedBy ?? "—"}
          </p>
        </div>
        {saveMutation.isPending && (
          <span className="text-xs text-blue-600 font-medium animate-pulse">Saving…</span>
        )}
      </div>

      {/* Audit log */}
      {Array.isArray(auditLog) && auditLog.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900 text-sm">Recent Changes</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {auditLog.slice(0, 5).map((entry: { id: string; actorId: string; createdAt: string; oldValueJson: Record<string, unknown>; newValueJson: Record<string, unknown> }) => {
              const changes = Object.keys(entry.newValueJson).filter(
                (k) => !["id", "updatedAt", "updatedBy"].includes(k) &&
                  entry.oldValueJson[k] !== entry.newValueJson[k]
              );
              return (
                <div key={entry.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-700">{entry.actorId}</p>
                    <p className="text-xs text-slate-400">{formatDate(entry.createdAt)}</p>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Changed: {changes.join(", ") || "settings"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
