"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DecisionFormSchema, type DecisionFormValues } from "@/lib/schemas";
import { DENIAL_REASONS, APPROVAL_REASONS, PHONE_OVERRIDE_REASONS } from "@/lib/risk";
import { Modal } from "./ui/Modal";
import { LoadingSpinner } from "./ui/LoadingSpinner";

interface DecisionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: DecisionFormValues) => Promise<void>;
  initialStatus: "approved" | "queued" | "denied";
  isLoading: boolean;
}

const statusColors = {
  approved: "border-green-500 bg-green-50 text-green-700",
  queued:   "border-amber-500 bg-amber-50 text-amber-700",
  denied:   "border-red-500 bg-red-50 text-red-700",
};

export function DecisionModal({ open, onClose, onSubmit, initialStatus, isLoading }: DecisionModalProps) {
  const { register, control, handleSubmit, watch, setValue, formState: { errors } } =
    useForm<DecisionFormValues>({
      resolver: zodResolver(DecisionFormSchema),
      defaultValues: {
        status:       initialStatus,
        decisionType: "manual",
        reasons:      [],
        notes:        "",
        decidedBy:    "",
      },
    });

  const selectedStatus    = watch("status");
  const selectedDecisionType = watch("decisionType");
  const isPhoneOverride   = selectedDecisionType === "phone_override";
  const isApproval        = selectedStatus === "approved";

  // Pick the right reasons list
  const reasonsList = isPhoneOverride
    ? PHONE_OVERRIDE_REASONS
    : isApproval
    ? APPROVAL_REASONS
    : DENIAL_REASONS;

  // Clear reasons when switching status/type
  const handleStatusChange = (s: typeof selectedStatus) => {
    setValue("status", s);
    setValue("reasons", []);
    if (s !== "approved") setValue("decisionType", "manual");
  };

  const submit = async (data: DecisionFormValues) => {
    await onSubmit(data);
  };

  return (
    <Modal open={open} onClose={onClose} title="Record Decision" size="md">
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5">

        {/* Status */}
        <div>
          <label className="form-label">Decision *</label>
          <div className="grid grid-cols-3 gap-2">
            {(["approved", "queued", "denied"] as const).map((s) => (
              <label
                key={s}
                className={`flex items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-all text-sm font-medium capitalize ${
                  selectedStatus === s
                    ? statusColors[s]
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
                onClick={() => handleStatusChange(s)}
              >
                <input type="radio" value={s} className="sr-only" {...register("status")} />
                {s}
              </label>
            ))}
          </div>
          {errors.status && <p className="form-error">{errors.status.message}</p>}
        </div>

        {/* Phone Override toggle — only for approvals */}
        {isApproval && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={isPhoneOverride}
                onChange={(e) =>
                  setValue("decisionType", e.target.checked ? "phone_override" : "manual")
                }
              />
              <div>
                <p className="text-sm font-semibold text-blue-800">📞 Phone Approval</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  Check this if the customer resolved concerns verbally over the phone.
                  This will be logged as a manual phone override in the audit record.
                </p>
              </div>
            </label>
          </div>
        )}

        {/* Reasons */}
        <div>
          <label className="form-label">
            {isApproval ? "Approval basis *" : "Reasons *"}{" "}
            <span className="text-slate-400 font-normal">(select all that apply)</span>
          </label>
          <Controller
            control={control}
            name="reasons"
            render={({ field }) => (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1 border border-slate-200 rounded-lg p-3">
                {reasonsList.map((reason) => (
                  <label
                    key={reason}
                    className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer hover:text-slate-900"
                  >
                    <input
                      type="checkbox"
                      value={reason}
                      checked={field.value.includes(reason)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          field.onChange([...field.value, reason]);
                        } else {
                          field.onChange(field.value.filter((r) => r !== reason));
                        }
                      }}
                      className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    {reason}
                  </label>
                ))}
              </div>
            )}
          />
          {errors.reasons && <p className="form-error">{errors.reasons.message}</p>}
        </div>

        {/* Notes */}
        <div>
          <label className="form-label" htmlFor="notes">
            {isPhoneOverride ? "Call notes *" : "Notes (optional)"}
          </label>
          <textarea
            id="notes"
            className="form-input resize-none"
            rows={3}
            placeholder={
              isPhoneOverride
                ? "Summarize what was resolved on the call…"
                : "Additional context for audit log…"
            }
            {...register("notes")}
          />
        </div>

        {/* Reviewer */}
        <div>
          <label className="form-label" htmlFor="decidedBy">Your Name *</label>
          <input
            id="decidedBy"
            className="form-input"
            placeholder="Enter your name for the audit log"
            {...register("decidedBy")}
          />
          {errors.decidedBy && <p className="form-error">{errors.decidedBy.message}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            type="submit"
            disabled={isLoading}
            className={`btn ${
              selectedStatus === "approved" ? "btn-success"
              : selectedStatus === "denied"  ? "btn-danger"
              : "btn bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-400"
            }`}
          >
            {isLoading ? <LoadingSpinner size="sm" /> : (
              isPhoneOverride
                ? "Log Phone Approval"
                : `Confirm ${selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1)}`
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
