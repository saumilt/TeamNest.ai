import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Bot, Plus, Loader2, Sparkles, X, FileText, LayoutGrid, ShieldAlert, Store, Rocket,
} from "lucide-react";

const RISK_CLS = {
  Low: "bg-emerald-500/15 text-emerald-300",
  Medium: "bg-amber-500/15 text-amber-300",
  High: "bg-rose-500/15 text-rose-300",
};
const STATUS_CLS = {
  Draft: "bg-white/10 text-ink-dim",
  Deployed: "bg-emerald-500/15 text-emerald-300",
  Testing: "bg-sky-500/15 text-sky-300",
  Training: "bg-violet-500/15 text-violet-300",
};

/** AI Employee Builder — create, train and manage custom AI employees. */
export default function AIEmployeeBuilder() {
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [employees, setEmployees] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [access, setAccess] = useState(null);   // null=loading, {builder_access, reason, application}

  const load = () => {
    api.get("/ai-builder/dashboard").then(({ data }) => setStats(data)).catch(() => {});
    api.get("/ai-builder/employees").then(({ data }) => setEmployees(data.employees)).catch(() => setEmployees([]));
    api.get("/ai-builder/templates").then(({ data }) => setTemplates(data.templates)).catch(() => {});
  };
  useEffect(() => {
    api.get("/builder-program/me").then(({ data }) => setAccess(data)).catch(() => setAccess({ builder_access: false }));
    load();
  }, []);

  const createFrom = async (body) => {
    try {
      const { data } = await api.post("/ai-builder/employees", body);
      toast.success(`Created ${data.name}`);
      nav(`/ai-builder/${data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to create");
    }
  };

  if (access && !access.builder_access) {
    return <BuilderGate application={access.application} nav={nav} />;
  }

  return (
    <div className="min-h-screen bg-bg text-ink px-5 py-8 md:px-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start gap-3 mb-1">
          <div className="w-11 h-11 rounded-xl bg-ai-tint flex items-center justify-center shrink-0">
            <Bot className="w-6 h-6 text-ai" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold">AI Employee Builder</h1>
            <p className="text-sm text-ink-dim">Create, train, and deploy AI employees for your company.</p>
          </div>
          <button type="button" onClick={() => nav("/ai-builder/deployed")} data-testid="aeb-deployed-btn"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white/10 hover:bg-white/15 text-ink font-bold text-sm active:scale-95">
            <Rocket className="w-4 h-4" /> Deployed
          </button>
          <button type="button" onClick={() => nav("/ai-builder/marketplace")} data-testid="aeb-marketplace-btn"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white/10 hover:bg-white/15 text-ink font-bold text-sm active:scale-95">
            <Store className="w-4 h-4" /> Marketplace
          </button>
          <button type="button" onClick={() => setShowCreate(true)} data-testid="aeb-create-btn"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-ai text-black font-bold text-sm hover:opacity-90 active:scale-95">
            <Plus className="w-4 h-4" /> Create AI Employee
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
            {[
              ["Total", stats.total], ["Draft", stats.draft], ["Deployed", stats.deployed],
              ["Needs review", stats.needs_review], ["In marketplace", stats.marketplace],
            ].map(([label, val]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-surface-2 p-4">
                <div className="text-2xl font-extrabold tabular-nums">{val}</div>
                <div className="text-xs text-ink-dim mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-8 mb-3">
          <LayoutGrid className="w-4 h-4 text-ai" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">Your AI employees</h2>
        </div>
        {employees === null ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-ai" /></div>
        ) : employees.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-surface-2 p-8 text-center">
            <Bot className="w-7 h-7 mx-auto text-ink-dim opacity-50 mb-2" />
            <p className="text-sm text-ink-dim">No AI employees yet. Create one from scratch or start from a template below.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {employees.map((e) => (
              <button type="button" key={e.id} onClick={() => nav(`/ai-builder/${e.id}`)}
                data-testid={`aeb-emp-${e.id}`}
                className="text-left rounded-xl border border-white/10 bg-surface-2 p-4 hover:border-ai/40 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold truncate flex-1">{e.name}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_CLS[e.status] || "bg-white/10 text-ink-dim"}`}>{e.status}</span>
                </div>
                <div className="text-xs text-ink-dim truncate">{e.job_title || "—"}{e.department ? ` · ${e.department}` : ""}</div>
                <div className="flex items-center gap-2 mt-3">
                  <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-ai" style={{ width: `${e.training_completeness_score}%` }} />
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums text-ink-dim">{e.training_completeness_score}%</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-10 mb-3">
          <Sparkles className="w-4 h-4 text-ai" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">Start from a template</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-white/10 bg-surface-2 p-4 flex flex-col" data-testid={`aeb-tpl-${t.id}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold flex-1">{t.name}</span>
                {t.risk_level && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${RISK_CLS[t.risk_level]}`}><ShieldAlert className="w-3 h-3" />{t.risk_level}</span>}
              </div>
              <p className="text-xs text-ink-dim flex-1 leading-relaxed">{t.description}</p>
              <div className="text-[10px] uppercase tracking-wide text-ink-dim mt-2">{t.category}</div>
              <button type="button" onClick={() => createFrom({ source: "template", template_id: t.id })}
                data-testid={`aeb-use-tpl-${t.id}`}
                className="mt-3 h-9 rounded-full bg-white/10 hover:bg-ai hover:text-black text-ink font-semibold text-xs transition-colors">
                Use this template
              </button>
            </div>
          ))}
        </div>
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreate={createFrom} templates={templates} />}
    </div>
  );
}

function CreateModal({ onClose, onCreate, templates }) {
  const [mode, setMode] = useState("blank");
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id || "");
  const [jd, setJd] = useState("");

  const submit = () => {
    if (mode === "blank") onCreate({ source: "blank", name: name || "New AI Employee" });
    else if (mode === "template") onCreate({ source: "template", template_id: templateId, name: name || undefined });
    else onCreate({ source: "job_description", name: name || "New AI Employee", job_description: jd });
  };

  const MODES = [
    { id: "blank", label: "Blank", icon: Bot },
    { id: "template", label: "Template", icon: Sparkles },
    { id: "job_description", label: "Job description", icon: FileText },
  ];
  const inputCls = "w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-ink focus:border-ai focus:outline-none";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-surface ring-1 ring-white/10 overflow-hidden">
        <div className="flex items-center px-5 py-3.5 border-b border-white/10">
          <div className="text-sm font-bold flex-1">Create AI Employee</div>
          <button type="button" onClick={onClose} className="p-1 text-ink-dim hover:text-ink"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => {
              const Icon = m.icon; const active = mode === m.id;
              return (
                <button key={m.id} type="button" onClick={() => setMode(m.id)} data-testid={`aeb-mode-${m.id}`}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-semibold ${active ? "border-ai bg-ai-tint text-ai" : "border-white/10 text-ink-dim hover:text-ink"}`}>
                  <Icon className="w-5 h-5" /> {m.label}
                </button>
              );
            })}
          </div>
          <input placeholder="Employee name" value={name} onChange={(e) => setName(e.target.value)} data-testid="aeb-name-input" className={inputCls} />
          {mode === "template" && (
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} data-testid="aeb-template-select" className={inputCls}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {mode === "job_description" && (
            <textarea placeholder="Paste a job description — responsibilities are extracted automatically" value={jd} onChange={(e) => setJd(e.target.value)}
              data-testid="aeb-jd-input" rows={5} className={inputCls} />
          )}
          <button type="button" onClick={submit} data-testid="aeb-create-submit"
            disabled={mode === "job_description" && !jd.trim()}
            className="w-full h-10 rounded-full bg-ai text-black font-bold text-sm disabled:opacity-50">
            Create employee
          </button>
        </div>
      </div>
    </div>
  );
}


function BuilderGate({ application, nav }) {
  const status = application?.status;
  return (
    <div className="min-h-screen bg-bg text-ink px-5 py-8 md:px-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-ai-tint flex items-center justify-center shrink-0">
            <Bot className="w-6 h-6 text-ai" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold">AI Employee Builder <sup className="text-xs text-ai font-bold">Beta</sup></h1>
            <p className="text-sm text-ink-dim">Design, train and sell custom AI employees. Access is currently invite-only.</p>
          </div>
        </div>

        {status === "pending" ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6" data-testid="aeb-gate-pending">
            <div className="flex items-center gap-2 text-amber-300 font-bold mb-1"><Loader2 className="w-4 h-4 animate-spin" /> Application under review</div>
            <p className="text-sm text-ink-dim">Thanks for applying! Our team is reviewing your application to become an AI Employee Builder. You'll get access here once approved.</p>
          </div>
        ) : status === "rejected" ? (
          <div className="rounded-2xl border border-white/10 bg-surface-2 p-6" data-testid="aeb-gate-rejected">
            <div className="font-bold mb-1">Application not approved</div>
            <p className="text-sm text-ink-dim">{application?.decision_note || "Your application wasn't approved this time. You can upgrade to the Team plan to unlock the builder instantly."}</p>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => nav("/billing")} data-testid="aeb-gate-upgrade" className="h-10 px-5 rounded-full bg-ai text-black font-bold text-sm">Upgrade to Team</button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-surface-2 p-6" data-testid="aeb-gate-apply">
            <div className="font-bold text-lg mb-1">Become an AI Employee Builder</div>
            <p className="text-sm text-ink-dim mb-4">Get approved to build and publish AI employees to the marketplace — and earn when other teams license them. Two ways in:</p>
            <ul className="space-y-2 text-sm mb-5">
              <li className="flex gap-2"><Sparkles className="w-4 h-4 text-ai mt-0.5 shrink-0" /> Apply to the Builder Program — tell us how you'll add value (free, reviewed by our team).</li>
              <li className="flex gap-2"><Store className="w-4 h-4 text-ai mt-0.5 shrink-0" /> Or upgrade to the Team plan ($19.99) for instant builder access.</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => nav("/builder-program")} data-testid="aeb-gate-apply-btn" className="h-10 px-5 rounded-full bg-ai text-black font-bold text-sm">Apply to build</button>
              <button type="button" onClick={() => nav("/billing")} data-testid="aeb-gate-team-btn" className="h-10 px-5 rounded-full bg-white/10 hover:bg-white/15 text-ink font-bold text-sm">Upgrade to Team</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
