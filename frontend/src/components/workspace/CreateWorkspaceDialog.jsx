import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { X, Check, Plus } from "lucide-react";

/**
 * Create-a-new-workspace flow. Creating is always FREE — the workspace starts
 * on the Free plan at no cost. The user picks a plan here; if they choose a
 * paid plan we send them to checkout for the new workspace afterwards.
 */
export function CreateWorkspaceDialog({ open, onClose }) {
  const { createWorkspace } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [planId, setPlanId] = useState("free");
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(""); setPlanId("free");
    api.get("/billing/plans").then(({ data }) => setPlans(data.plans || [])).catch(() => setPlans([]));
  }, [open]);

  if (!open) return null;

  const create = async () => {
    if (name.trim().length < 2) return toast.error("Enter a workspace name");
    setBusy(true);
    try {
      const data = await createWorkspace(name.trim(), planId);
      if (data.needs_checkout) {
        toast.success(`Workspace created. Let's set up your ${planId} plan.`);
        onClose?.();
        nav("/billing");
      } else {
        toast.success("Workspace created 🎉");
        onClose?.();
        nav("/chats");
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create workspace");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" data-testid="create-workspace-dialog">
      <div className="w-full max-w-md rounded-2xl bg-surface ring-1 ring-hairline overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center px-5 py-3.5 border-b border-hairline shrink-0">
          <div className="text-sm font-bold flex-1 text-ink">Create a workspace</div>
          <button type="button" onClick={onClose} className="p-1 text-ink-mute hover:text-ink" data-testid="create-workspace-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-1 block">Workspace name</label>
            <input
              data-testid="create-workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp, CS 101 Study Group"
              className="w-full h-11 rounded-xl bg-surface-2 ring-1 ring-hairline px-3 text-ink text-[14px] focus:ring-brand outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2 block">Choose a plan</label>
            <p className="text-[12px] text-ink-mute mb-2">Creating a workspace is free. You can start on Free and upgrade anytime.</p>
            <div className="space-y-2">
              {plans.filter((p) => p.id !== "enterprise").map((p) => {
                const active = planId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`create-workspace-plan-${p.id}`}
                    onClick={() => setPlanId(p.id)}
                    className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors ${active ? "ring-brand bg-brand/5" : "ring-hairline bg-surface-2 hover:bg-surface-3"}`}
                  >
                    <span className={`w-4 h-4 rounded-full ring-2 shrink-0 flex items-center justify-center ${active ? "ring-brand bg-brand" : "ring-hairline"}`}>
                      {active && <Check className="w-2.5 h-2.5 text-black" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-[13px] font-semibold text-ink">{p.name}</span>
                      {p.requires_edu && <span className="ml-1.5 text-[10px] text-amber-400">.edu required</span>}
                    </span>
                    <span className="text-[13px] font-bold text-ink shrink-0">
                      {p.price_usd === 0 ? "Free" : `$${p.price_usd}`}
                      {p.price_usd > 0 && <span className="text-[11px] font-normal text-ink-mute">{p.per_seat ? " /seat/mo" : "/mo"}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            data-testid="create-workspace-submit"
            disabled={busy || name.trim().length < 2}
            onClick={create}
            className="w-full h-11 rounded-pill bg-brand hover:opacity-90 text-black font-bold text-[14px] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> {planId === "free" ? "Create workspace" : `Create & set up ${planId}`}
          </button>
        </div>
      </div>
    </div>
  );
}
