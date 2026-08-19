import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import safeStorage from "@/lib/safeStorage";
import { Wand2, X, User, GraduationCap, Users, Briefcase, Building2 } from "lucide-react";

const DISMISS_KEY = "tn:persona-nudge:dismissed";

const OPTS = [
  { id: "personal", label: "Just me", icon: User },
  { id: "student", label: "Student", icon: GraduationCap },
  { id: "team", label: "A team", icon: Users },
  { id: "business", label: "Business", icon: Briefcase },
  { id: "enterprise", label: "Enterprise", icon: Building2 },
];

/** Gentle nudge for users who never picked a persona — choosing one tailors
 *  their Home top actions instantly (persists via PATCH /user/onboarding). */
export default function PersonaNudge() {
  const { user, refresh } = useAuth();
  const [dismissed, setDismissed] = useState(() => safeStorage.get(DISMISS_KEY) === "1");
  const [busy, setBusy] = useState(false);

  if (!user || user.persona || dismissed) return null;

  const pick = async (id) => {
    setBusy(true);
    try {
      await api.patch("/user/onboarding", { persona: id, completed: true });
      await refresh();
      toast.success("Home tailored to you");
    } catch {
      toast.error("Couldn't save — please try again");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    safeStorage.set(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      data-testid="persona-nudge"
      className="rounded-2xl border border-white/10 bg-[#0c0c0e] p-4 mb-6 flex flex-col lg:flex-row lg:items-center gap-4"
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="w-9 h-9 rounded-lg bg-yellow-400 text-black flex items-center justify-center shrink-0">
          <Wand2 className="w-[18px] h-[18px]" strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <div className="font-display text-base font-bold tracking-tight">Make TeamNest yours</div>
          <div className="text-[13px] text-zinc-500">Tell us how you'll use it and we'll tailor your Home.</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {OPTS.map((o) => (
          <button
            key={o.id}
            type="button"
            data-testid={`persona-pick-${o.id}`}
            disabled={busy}
            onClick={() => pick(o.id)}
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] hover:border-yellow-400/40 disabled:opacity-50 px-3 py-1.5 text-[13px] font-medium text-zinc-200 transition-colors"
          >
            <o.icon className="w-3.5 h-3.5 text-zinc-400" />
            {o.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        data-testid="persona-nudge-dismiss"
        onClick={dismiss}
        className="text-zinc-500 hover:text-white p-1 rounded-md hover:bg-white/5 shrink-0 self-start lg:self-center"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
