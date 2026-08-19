import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ShieldCheck, Brain, Library, Building2 } from "lucide-react";

function Metric({ value, label }) {
  return (
    <span className="whitespace-nowrap">
      <b className="text-white">{value ?? "—"}</b> {label}
    </span>
  );
}

/** Top-of-home banner: makes TeamNest's perpetual, role-independent memory
 *  tangible — "your organization's intelligence shouldn't leave when people do." */
export default function IntelligenceBanner() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [s, setS] = useState(null);

  useEffect(() => {
    api.get("/home/summary").then(({ data }) => setS(data)).catch(() => {});
  }, []);

  const canRole = ["owner", "admin"].includes(user?.role) || user?.is_super_admin;

  return (
    <div
      data-testid="intelligence-banner"
      className="rounded-2xl border border-yellow-400/25 bg-gradient-to-r from-yellow-400/[0.09] via-yellow-400/[0.03] to-transparent p-5 mb-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-yellow-400 text-black flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <div className="font-display text-lg lg:text-xl font-bold tracking-tight leading-snug">
              Your organization's intelligence shouldn't disappear when people move on.
            </div>
            <div className="text-[13px] text-zinc-400 mt-1">
              TeamNest remembers decisions, research, and know-how — so it stays as your team changes.
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] font-mono uppercase tracking-widest text-zinc-500">
              <Metric value={s?.saved_facts} label="saved facts" />
              <Metric value={s?.decisions} label="decisions" />
              <Metric value={s?.research_threads} label="research" />
              <Metric value={s?.documents} label="documents" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            data-testid="intel-ask-memory"
            onClick={() => nav("/ai-memory")}
            className="flex items-center gap-1.5 rounded-lg bg-yellow-400 text-black hover:bg-yellow-300 font-mono uppercase tracking-widest text-[11px] h-9 px-3"
          >
            <Brain className="w-3.5 h-3.5" /> Ask My Memory
          </button>
          <button
            type="button"
            data-testid="intel-knowledge"
            onClick={() => nav("/knowledge")}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 hover:bg-white/5 font-mono uppercase tracking-widest text-[11px] h-9 px-3 text-zinc-300"
          >
            <Library className="w-3.5 h-3.5" /> Team Knowledge
          </button>
          {canRole && (
            <button
              type="button"
              data-testid="intel-role"
              onClick={() => nav("/enterprise")}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 hover:bg-white/5 font-mono uppercase tracking-widest text-[11px] h-9 px-3 text-zinc-300"
            >
              <Building2 className="w-3.5 h-3.5" /> Role Intelligence
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
