import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";

/**
 * ApprovalActionCard — chat card for a pending Product Manager approval
 * (production publish, GitHub export, high-risk change). PM/owner/admin
 * see Approve / Reject buttons; everyone else sees live status.
 */
const STATUS_STYLES = {
  pending: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
  approved: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30",
  rejected: "bg-red-400/15 text-red-300 ring-red-400/30",
};

export default function ApprovalActionCard({ card }) {
  const [approval, setApproval] = useState(null);
  const [deciding, setDeciding] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/dev-action-approvals/${card.approval_id}`);
      setApproval(data);
    } catch { /* deleted or no access */ }
  }, [card.approval_id]);

  useEffect(() => { load(); }, [load]);

  const decide = async (decision) => {
    setDeciding(true);
    try {
      const { data } = await api.post(`/dev-action-approvals/${card.approval_id}/decision`, { decision });
      setApproval({ ...data, can_decide: false });
      toast.success(decision === "approve" ? "Approved & executed ✅" : "Rejected");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not record decision");
    } finally {
      setDeciding(false);
    }
  };

  const status = approval?.status || "pending";
  return (
    <div
      data-testid="approval-action-card"
      className="mt-2 rounded-xl bg-surface-2 ring-1 ring-amber-400/25 p-3 max-w-sm"
    >
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-amber-300 text-black flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-ink truncate">
            {card.action_label || "High-risk action"}
          </div>
          <div className="text-[10.5px] text-ink-mute truncate">
            {card.project_name} · requested by {approval?.requested_by_name || "teammate"}
          </div>
        </div>
        <span
          data-testid="approval-status-pill"
          className={`shrink-0 h-5 px-2 rounded-full ring-1 text-[10px] font-semibold inline-flex items-center capitalize ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}
        >
          {status}
        </span>
      </div>

      {status === "approved" && approval?.result?.path && (
        <a
          href={approval.result.path}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-[11.5px] text-emerald-300 hover:underline truncate"
          data-testid="approval-result-link"
        >
          Live at {approval.result.path} (v{approval.result.version})
        </a>
      )}
      {status === "rejected" && approval?.decision_note && (
        <p className="mt-2 text-[11.5px] text-ink-dim">“{approval.decision_note}”</p>
      )}

      {approval?.can_decide && (
        <div className="flex gap-2 mt-2.5">
          <button
            type="button"
            onClick={() => decide("approve")}
            disabled={deciding}
            data-testid="approval-approve-btn"
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-pill bg-emerald-400 hover:bg-emerald-300 text-black text-[12px] font-semibold disabled:opacity-50"
          >
            {deciding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Approve
          </button>
          <button
            type="button"
            onClick={() => decide("reject")}
            disabled={deciding}
            data-testid="approval-reject-btn"
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-pill bg-red-400/15 hover:bg-red-400/25 text-red-300 ring-1 ring-red-400/30 text-[12px] font-semibold disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" /> Reject
          </button>
        </div>
      )}
    </div>
  );
}
