"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/Toast";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { DecisionBadge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import defaultRules from "@/config/risk-rules.json";

interface RulesVersion {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  description?: string;
  createdBy: string;
  publishedBy?: string;
  publishedAt?: string;
  createdAt: string;
}

interface RulesData {
  versions: RulesVersion[];
  current: typeof defaultRules;
}

const SAMPLE_VERIFICATION = {
  address: { dpv: "N", deliverable: false, residential: true, distanceKm: 600, reasons: [] },
  phone: { type: "voip", active: false, riskScore: 85, reasons: [] },
  email: { disposable: true, mxValid: false, domainRisk: "high", reasons: [] },
  payment: { avs: "N", cvv: "N", binType: "prepaid", reasons: [] },
  ip: { proxy: true, vpn: false, distanceToShipKm: 900, reasons: [] },
};

export default function RulesPage() {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const [editorValue, setEditorValue] = useState("");
  const [editorError, setEditorError] = useState("");
  const [actor, setActor] = useState("");
  const [description, setDescription] = useState("");
  const [previewResult, setPreviewResult] = useState<null | {
    version: number; score: number; decision: string; reasons: string[];
  }>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<RulesData>({
    queryKey: ["admin-rules"],
    queryFn: async () => {
      const res = await fetch("/api/admin/rules");
      return res.json();
    },
  });

  const createDraft = useMutation({
    mutationFn: async () => {
      let parsed;
      try { parsed = JSON.parse(editorValue); } catch {
        throw new Error("Invalid JSON — check your syntax");
      }
      const res = await fetch("/api/admin/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: parsed, description, actor }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      success("Draft saved", `Rules v${data.version} created`);
      setSelectedDraftId(data.id);
      qc.invalidateQueries({ queryKey: ["admin-rules"] });
    },
    onError: (err: Error) => toastError("Failed to save draft", err.message),
  });

  const publishVersion = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/admin/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", id, actor }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      success("Rules published", "New rules are now live");
      qc.invalidateQueries({ queryKey: ["admin-rules"] });
    },
    onError: (err: Error) => toastError("Publish failed", err.message),
  });

  const rollbackVersion = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/admin/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rollback", id, actor }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      success("Rollback complete", "Prior rules version is now live");
      qc.invalidateQueries({ queryKey: ["admin-rules"] });
    },
    onError: (err: Error) => toastError("Rollback failed", err.message),
  });

  const runPreview = async () => {
    if (!selectedDraftId) return toastError("Select a draft to preview");
    const res = await fetch("/api/admin/rules/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rulesVersionId: selectedDraftId, sampleVerification: SAMPLE_VERIFICATION }),
    });
    if (!res.ok) return toastError("Preview failed", (await res.json()).error);
    setPreviewResult(await res.json());
  };

  const handleEditorChange = (val: string) => {
    setEditorValue(val);
    try { JSON.parse(val); setEditorError(""); } catch { setEditorError("Invalid JSON"); }
  };

  const loadCurrentRules = () => {
    setEditorValue(JSON.stringify(data?.current ?? defaultRules, null, 2));
  };

  if (isLoading) return <LoadingPage label="Loading rules…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Rules Management</h1>
        <p className="text-slate-500 mt-1">Edit, preview, and publish risk scoring rules.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="section-header mb-0">Rules Editor</h2>
            <button onClick={loadCurrentRules} className="btn-secondary text-xs">
              Load Current
            </button>
          </div>

          <div>
            <label className="form-label">Your Name *</label>
            <input
              className="form-input"
              placeholder="admin"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Description</label>
            <input
              className="form-input"
              placeholder="Increased AVS weight for prepaid cards"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Rules JSON</label>
            <textarea
              className="form-input font-mono text-xs resize-none"
              rows={16}
              value={editorValue}
              onChange={(e) => handleEditorChange(e.target.value)}
              placeholder={JSON.stringify(defaultRules, null, 2)}
            />
            {editorError && <p className="form-error">{editorError}</p>}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => createDraft.mutate()}
              disabled={createDraft.isPending || !!editorError || !actor}
              className="btn-primary flex-1"
            >
              Save as Draft
            </button>
            {selectedDraftId && (
              <button
                onClick={runPreview}
                className="btn-secondary flex-1"
              >
                Preview Impact
              </button>
            )}
          </div>
        </div>

        {/* Version history + preview */}
        <div className="space-y-4">
          {/* Preview result */}
          {previewResult && (
            <div className="card p-4 border-2 border-brand-200">
              <h3 className="section-header">Preview Result (v{previewResult.version})</h3>
              <div className="flex items-center gap-4 mb-3">
                <div>
                  <p className="text-xs text-slate-400">Score</p>
                  <p className="text-3xl font-bold text-brand-600">{previewResult.score}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Decision</p>
                  <DecisionBadge decision={previewResult.decision as never} />
                </div>
              </div>
              {previewResult.reasons.length > 0 && (
                <ul className="space-y-1">
                  {previewResult.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-slate-600">› {r}</li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-slate-400 mt-2">
                Sample: high-risk payload (VoIP, disposable email, AVS fail, proxy IP)
              </p>
            </div>
          )}

          {/* Version list */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h3 className="section-header mb-0">Version History</h3>
            </div>
            {(data?.versions ?? []).length === 0 ? (
              <p className="text-sm text-slate-400 p-4 italic">No saved versions yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data?.versions.map((v) => (
                  <div
                    key={v.id}
                    className={`px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                      selectedDraftId === v.id ? "bg-brand-50" : ""
                    }`}
                    onClick={() => setSelectedDraftId(v.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">v{v.version}</span>
                        <span className={`badge text-xs ${
                          v.status === "published" ? "badge-pass" :
                          v.status === "draft" ? "badge-warn" : "badge-neutral"
                        }`}>
                          {v.status}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {v.status === "draft" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); publishVersion.mutate(v.id); }}
                            disabled={!actor}
                            className="btn-success text-xs px-2 py-1"
                          >
                            Publish
                          </button>
                        )}
                        {v.status === "archived" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); rollbackVersion.mutate(v.id); }}
                            disabled={!actor}
                            className="btn-secondary text-xs px-2 py-1"
                          >
                            Rollback
                          </button>
                        )}
                      </div>
                    </div>
                    {v.description && <p className="text-xs text-slate-600 mb-1">{v.description}</p>}
                    <p className="text-xs text-slate-400">
                      by {v.createdBy} · {formatDate(v.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
