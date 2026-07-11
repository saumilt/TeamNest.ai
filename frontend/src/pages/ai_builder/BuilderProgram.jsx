import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Bot, Loader2, ArrowLeft, CheckCircle2, Sparkles, DollarSign, Rocket } from "lucide-react";

const inputCls = "w-full rounded-xl border border-white/10 bg-surface-2 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-ai focus:outline-none";

/** Apply to become an approved AI Employee Builder (Beta). */
export default function BuilderProgram() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);
  const [f, setF] = useState({ full_name: "", company: "", website: "", motivation: "", value_prop: "", agent_ideas: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/builder-program/me").then(({ data }) => setMe(data)).catch(() => setMe({ builder_access: false }));
  }, []);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/builder-program/apply", f);
      toast.success("Application submitted");
      const { data } = await api.get("/builder-program/me");
      setMe(data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to submit"); }
    setBusy(false);
  };

  if (!me) return <div className="min-h-screen bg-bg flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-ai" /></div>;

  const app = me.application;
  const submitted = app && (app.status === "pending" || app.status === "approved");

  return (
    <div className="min-h-screen bg-bg text-ink px-5 py-8 md:px-10">
      <div className="max-w-2xl mx-auto">
        <button type="button" onClick={() => nav("/ai-builder")} data-testid="bp-back" className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink mb-4">
          <ArrowLeft className="w-4 h-4" /> Builder
        </button>
        <div className="flex items-start gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-ai-tint flex items-center justify-center shrink-0"><Bot className="w-6 h-6 text-ai" /></div>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold">Builder Program <sup className="text-xs text-ai font-bold">Beta</sup></h1>
            <p className="text-sm text-ink-dim">Build, publish and earn from custom AI employees.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {[[Sparkles, "Design", "Craft unique agentic AI employees for real jobs."], [Rocket, "Publish", "List them on the marketplace for other teams."], [DollarSign, "Earn", "Get paid every time a team licenses your AI employee."]].map(([Icon, t, d]) => (
            <div key={t} className="rounded-xl border border-white/10 bg-surface-2 p-4">
              <Icon className="w-5 h-5 text-ai mb-2" />
              <div className="text-sm font-bold">{t}</div>
              <div className="text-xs text-ink-dim mt-0.5 leading-relaxed">{d}</div>
            </div>
          ))}
        </div>

        {me.builder_access ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6" data-testid="bp-approved">
            <div className="flex items-center gap-2 text-emerald-300 font-bold mb-1"><CheckCircle2 className="w-5 h-5" /> You're an approved builder</div>
            <p className="text-sm text-ink-dim">You have full access to the AI Employee Builder{me.reason === "team_plan" ? " via your Team plan" : ""}.</p>
            <button type="button" onClick={() => nav("/ai-builder")} data-testid="bp-open-builder" className="mt-4 h-10 px-5 rounded-full bg-ai text-black font-bold text-sm">Open the Builder</button>
          </div>
        ) : submitted ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6" data-testid="bp-pending">
            <div className="flex items-center gap-2 text-amber-300 font-bold mb-1"><Loader2 className="w-4 h-4 animate-spin" /> Application under review</div>
            <p className="text-sm text-ink-dim">Thanks for applying! We'll review your application and grant access once approved.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-surface-2 p-6 space-y-4" data-testid="bp-form">
            <div className="text-sm font-bold">Tell us about you</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="text-xs text-ink-dim">Full name</label><input value={f.full_name} onChange={set("full_name")} data-testid="bp-name" className={inputCls} /></div>
              <div><label className="text-xs text-ink-dim">Company (optional)</label><input value={f.company} onChange={set("company")} data-testid="bp-company" className={inputCls} /></div>
            </div>
            <div><label className="text-xs text-ink-dim">Website / portfolio (optional)</label><input value={f.website} onChange={set("website")} data-testid="bp-website" className={inputCls} /></div>
            <div><label className="text-xs text-ink-dim">Why do you want to build AI employees?</label><textarea value={f.motivation} onChange={set("motivation")} rows={3} data-testid="bp-motivation" className={inputCls} /></div>
            <div><label className="text-xs text-ink-dim">How will you add value?</label><textarea value={f.value_prop} onChange={set("value_prop")} rows={3} data-testid="bp-value" className={inputCls} /></div>
            <div><label className="text-xs text-ink-dim">What unique agentic AI employees would you design?</label><textarea value={f.agent_ideas} onChange={set("agent_ideas")} rows={3} data-testid="bp-ideas" className={inputCls} /></div>
            <button type="button" onClick={submit} disabled={busy || !f.full_name.trim() || f.motivation.trim().length < 10 || f.value_prop.trim().length < 10 || f.agent_ideas.trim().length < 10}
              data-testid="bp-submit" className="w-full h-11 rounded-full bg-ai text-black font-bold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Submit application
            </button>
            <p className="text-xs text-ink-faint text-center">Prefer instant access? <button type="button" onClick={() => nav("/billing")} className="text-ai font-semibold">Upgrade to the Team plan ($19.99)</button>.</p>
          </div>
        )}
      </div>
    </div>
  );
}
