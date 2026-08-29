import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import CmoSocialConnections from "@/components/CmoSocialConnections";
import AiSavingsDashboard from "@/components/AiSavingsDashboard";
import {
  Bot,
  ChevronRight,
  Clock,
  Briefcase,
  Calculator,
  Megaphone,
  Scale,
  UtensilsCrossed,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  CheckCircle2,
  PauseCircle,
  CalendarDays,
} from "lucide-react";

const EMPLOYEE_ICONS = {
  cmo: Megaphone,
  bookkeeper: Calculator,
  sales: Briefcase,
  financial_modeler: TrendingUp,
  paralegal: Scale,
  restaurant_orders: UtensilsCrossed,
  bill_pay: Receipt,
};

const STATUS_BADGE = {
  trial_active: { label: "Trial Active", className: "bg-emerald-500/15 text-emerald-300 border border-emerald-400/30" },
  trial_ending_soon: { label: "Trial ending soon", className: "bg-amber-500/15 text-amber-300 border border-amber-400/30" },
  trial_ending_today: { label: "Trial ends today", className: "bg-red-500/15 text-red-300 border border-red-400/30" },
  trial_expired: { label: "Trial expired", className: "bg-zinc-500/15 text-zinc-300 border border-zinc-400/30" },
  active: { label: "Subscribed", className: "bg-brand-tint text-brand border border-brand/40" },
  paused: { label: "Paused", className: "bg-zinc-500/15 text-zinc-300 border border-zinc-400/30" },
  cancelled: { label: "Cancelled", className: "bg-zinc-700/30 text-zinc-400 border border-zinc-600/40" },
};

const ROLE_GROUPS_INTRO = [
  { title: "Marketing", Icon: Megaphone, blurb: "Plans campaigns, writes content, runs social.", keys: ["cmo"] },
  { title: "Finance", Icon: Calculator, blurb: "Keeps the books, models numbers, pays bills.", keys: ["bookkeeper", "financial_modeler", "bill_pay"] },
  { title: "Sales", Icon: Briefcase, blurb: "Finds leads and moves deals forward.", keys: ["sales"] },
  { title: "Legal", Icon: Scale, blurb: "Reviews and drafts everyday legal docs.", keys: ["paralegal"] },
  { title: "Operations", Icon: UtensilsCrossed, blurb: "Handles orders and day-to-day ops.", keys: ["restaurant_orders"] },
];

function RoleFirstIntro({ employees }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("tn_ai_employees_intro_v1") === "1"; } catch { return false; }
  });
  if (dismissed) return null;
  const byKey = Object.fromEntries((employees || []).map((e) => [e.key, e]));
  const groups = ROLE_GROUPS_INTRO
    .map((g) => ({ ...g, present: g.keys.map((k) => byKey[k]).filter(Boolean) }))
    .filter((g) => g.present.length > 0);
  if (groups.length === 0) return null;
  const close = () => {
    setDismissed(true);
    try { localStorage.setItem("tn_ai_employees_intro_v1", "1"); } catch { /* ignore */ }
  };
  return (
    <div data-testid="employees-intro" className="rounded-card border border-brand/30 bg-gradient-to-br from-brand-tint/40 to-transparent p-5 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand" />
          <h2 className="text-lg font-semibold tracking-tight">Meet your AI team — who does what</h2>
        </div>
        <button data-testid="employees-intro-dismiss" onClick={close} className="text-ink-dim hover:text-ink shrink-0 text-xl leading-none" aria-label="Dismiss">×</button>
      </div>
      <p className="text-[13px] text-ink-dim leading-relaxed max-w-2xl mb-5">
        New here? Hire specialized AI teammates by role — you pay per role, not per seat. Each has a 7-day trial,
        lives inside your chats, asks questions when unsure, and never acts on sensitive work without approval.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {groups.map((g) => (
          <div key={g.title} data-testid={`employees-group-${g.title.toLowerCase()}`} className="rounded-md border border-hairline bg-surface-1/60 p-3.5 flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-tint text-brand flex items-center justify-center shrink-0">
              <g.Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">{g.title}</div>
              <div className="text-[11px] text-ink-dim leading-snug">{g.blurb}</div>
              <div className="text-[11px] text-brand font-medium mt-1 truncate">{g.present.map((e) => e.name).join(" · ")}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AIEmployees() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/ai-employees");
      setEmployees(data.employees || []);
    } catch (e) {
      toast.error("Failed to load AI Employees");
    } finally {
      setLoading(false);
    }
  };

  const [nameModal, setNameModal] = useState(null); // { key, name, suggestion }

  useEffect(() => {
    load();
  }, []);

  const SUGGESTED_NAMES = {
    cmo: "Priya",
    sales: "Marcus",
    paralegal: "Diana",
    bookkeeper: "Henry",
  };

  const askNameThenStartTrial = (key, name) => {
    setNameModal({ key, name, suggestion: SUGGESTED_NAMES[key] || "Alex" });
  };

  const submitTrial = async (firstName) => {
    if (!nameModal) return;
    const { key, name } = nameModal;
    try {
      await api.post(`/ai-employees/${key}/trial`, { display_first_name: firstName });
      toast.success(`${firstName} AI (${name}) trial started — 7 days`);
      setNameModal(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Trial start failed");
    }
  };

  const renameEmployee = async (key, current, role) => {
    const next = window.prompt(`What should we call your ${role}?`, current || "");
    if (!next || !next.trim()) return;
    try {
      const { data } = await api.post(`/ai-employees/${key}/rename`, {
        display_first_name: next.trim(),
      });
      toast.success(`Renamed to ${data.display_full_name}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Rename failed");
    }
  };

  const joinWaitlist = async (key, name) => {
    try {
      await api.post(`/ai-employees/${key}/waitlist`, {});
      toast.success(`Joined waitlist for ${name}`);
      load();
    } catch (e) {
      toast.error("Waitlist join failed");
    }
  };

  const pause = async (key, name) => {
    try {
      await api.post(`/ai-employees/${key}/pause`, {});
      toast.success(`${name} paused`);
      load();
    } catch (e) {
      toast.error("Pause failed");
    }
  };

  const resume = async (key, name) => {
    try {
      await api.post(`/ai-employees/${key}/resume`, {});
      toast.success(`${name} resumed`);
      load();
    } catch (e) {
      toast.error("Resume failed");
    }
  };

  const cancel = async (key, name) => {
    if (!window.confirm(`Cancel ${name}? You can re-subscribe later.`)) return;
    try {
      await api.post(`/ai-employees/${key}/cancel`, {});
      toast.success(`${name} cancelled`);
      load();
    } catch (e) {
      toast.error("Cancel failed");
    }
  };

  const active = employees.filter((e) => e.status === "active");
  const comingSoon = employees.filter((e) => e.status === "coming_soon");
  const isOwnerOrAdmin = user?.role === "owner" || user?.role === "admin";

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center text-ink-dim">
        Loading AI Employees…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg pb-16">
      {/* Hero */}
      <div className="border-b border-hairline bg-gradient-to-b from-brand-tint/30 to-transparent">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-brand mb-3">
            <Sparkles className="w-3.5 h-3.5" /> Phase 6 — Specialized AI Employees
          </div>
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight max-w-3xl">
            Hire a specialized AI employee. <span className="text-brand">Pay per role, not per seat.</span>
          </h1>
          <p className="text-ink-dim mt-3 max-w-2xl">
            Each AI employee comes with a 7-day trial, fixed monthly fee, and a credit
            bucket. They live inside your chats and projects, ask your team questions
            when they need help, and never act without approval on sensitive work.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 mt-10 space-y-12">
        <RoleFirstIntro employees={employees} />
        <WeeklyDigests />
        <AiSavingsDashboard />
        <CmoSocialConnections />

        {/* Active employees */}
        <section data-testid="active-employees-section">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Active employees</h2>
            <span className="text-[11px] font-mono uppercase tracking-widest text-ink-dim">
              {active.length} available now
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {active.map((emp) => (
              <EmployeeCard
                key={emp.key}
                emp={emp}
                isOwnerOrAdmin={isOwnerOrAdmin}
                onStartTrial={() => askNameThenStartTrial(emp.key, emp.name)}
                onPause={() => pause(emp.key, emp.name)}
                onResume={() => resume(emp.key, emp.name)}
                onCancel={() => cancel(emp.key, emp.name)}
                onOpen={() => {
                  if (emp.key === "bookkeeper") return nav("/bookkeeper");
                  const firstName = emp.subscription?.display_first_name?.toLowerCase() || emp.key;
                  nav(`/chats?compose=@${firstName}%20`);
                }}
              />
            ))}
          </div>
        </section>

        {/* Coming soon */}
        <section data-testid="coming-soon-section">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Coming soon</h2>
            <span className="text-[11px] font-mono uppercase tracking-widest text-ink-dim">
              {comingSoon.length} on the roadmap
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {comingSoon.map((emp) => (
              <ComingSoonCard
                key={emp.key}
                emp={emp}
                onJoinWaitlist={() => joinWaitlist(emp.key, emp.name)}
                onRename={() =>
                  renameEmployee(emp.key, emp.subscription?.display_first_name, emp.name)
                }
              />
            ))}
          </div>
        </section>
      </div>

      {nameModal && (
        <NameAIModal
          name={nameModal.name}
          suggestion={nameModal.suggestion}
          onCancel={() => setNameModal(null)}
          onConfirm={submitTrial}
        />
      )}
    </div>
  );
}

function WeeklyDigests() {
  const [digests, setDigests] = useState(null);
  useEffect(() => {
    api.get("/ai-employees/_/digests").then(({ data }) => setDigests(data.digests || [])).catch(() => setDigests([]));
  }, []);
  if (!digests || digests.length === 0) return null;
  return (
    <section data-testid="employee-digests">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="w-4 h-4 text-brand" />
        <h2 className="text-lg font-semibold tracking-tight">This week with your AI team</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {digests.map((d) => (
          <div key={d.employee_key} data-testid={`digest-${d.employee_key}`} className="rounded-card border border-hairline bg-surface-1/60 p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-sm font-semibold text-ink">{d.display_full_name}</div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-ink-dim">{d.period}</span>
            </div>
            <div className="flex items-baseline gap-4 mb-2">
              <div><span className="text-xl font-bold text-ink">{d.tasks}</span> <span className="text-[11px] text-ink-dim">tasks</span></div>
              <div><span className="text-xl font-bold text-brand">~{d.hours_saved}h</span> <span className="text-[11px] text-ink-dim">saved</span></div>
              <div><span className="text-xl font-bold text-emerald-400">${d.dollar_savings}</span></div>
            </div>
            {d.recap ? <p className="text-[12px] text-ink-dim leading-relaxed">{d.recap}</p>
              : <p className="text-[12px] text-ink-dim italic">No activity yet this week.</p>}
            {d.highlights?.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {d.highlights.slice(0, 3).map((h, i) => (
                  <li key={i} className="text-[11px] text-ink-dim/80 truncate">• {h}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function NameAIModal({ name, suggestion, onCancel, onConfirm }) {
  const [value, setValue] = useState(suggestion);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      data-testid="name-ai-modal"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md bg-[#0F0F12] border border-violet-500/40 rounded-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-violet-400 mb-1">
            Name your AI employee
          </div>
          <h3 className="text-lg font-semibold">What should we call your {name}?</h3>
          <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
            They'll appear in chats as <span className="text-zinc-300">"{value || "Alex"} AI"</span>.
            Pick a first name your team will use to address them — e.g. {suggestion}, Aria, Leo, Maya.
          </p>
        </div>
        <input
          autoFocus
          data-testid="name-ai-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && onConfirm(value.trim())}
          placeholder={suggestion}
          className="w-full h-11 bg-[#121214] border border-white/10 rounded-md px-3 text-sm"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            data-testid="name-ai-cancel"
            className="h-10 px-4 rounded-md border border-white/10 hover:bg-white/5 text-xs font-mono uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            onClick={() => value.trim() && onConfirm(value.trim())}
            disabled={!value.trim()}
            data-testid="name-ai-confirm"
            className="h-10 px-4 rounded-md bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white text-xs font-mono uppercase tracking-widest"
          >
            Start trial
          </button>
        </div>
      </div>
    </div>
  );
}

function EmployeeCard({ emp, isOwnerOrAdmin, onStartTrial, onPause, onResume, onCancel, onOpen, onRename }) {
  const Icon = EMPLOYEE_ICONS[emp.key] || Bot;
  const sub = emp.subscription;
  const status = sub?.status;
  const badge = status ? STATUS_BADGE[status] : null;

  const inTrial = sub?.phase === "trial";
  const creditsUsed = inTrial ? sub?.trial_credits_used : sub?.monthly_credits_used;
  const creditsTotal = inTrial ? sub?.trial_credits_total : sub?.monthly_credits_total;
  const pct = creditsTotal ? Math.min(100, (creditsUsed / creditsTotal) * 100) : 0;

  return (
    <div
      data-testid={`employee-card-${emp.key}`}
      className="border border-hairline rounded-card bg-surface-1 p-5 flex flex-col gap-3 hover:border-brand/40 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-brand-tint text-brand flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-semibold tracking-tight">
              {sub?.display_full_name || emp.name}
            </h3>
            {badge && (
              <span className={`text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm ${badge.className}`}>
                {badge.label}
              </span>
            )}
            {sub && isOwnerOrAdmin && onRename && (
              <button
                onClick={onRename}
                data-testid={`employee-rename-${emp.key}`}
                className="text-[10px] font-mono uppercase tracking-widest text-violet-400 hover:text-violet-300 underline-offset-2 hover:underline"
              >
                rename
              </button>
            )}
          </div>
          <div className="text-[11px] text-ink-dim">
            {sub?.display_full_name ? `${emp.name} · ${emp.role}` : emp.role}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[20px] font-semibold leading-none">${emp.monthly_price}</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-ink-dim">/ month</div>
        </div>
      </div>

      <p className="text-[13px] text-ink-dim leading-relaxed">{emp.description}</p>

      {/* Credits + trial info */}
      {sub ? (
        <div className="bg-surface-2/50 rounded-md p-3 space-y-2" data-testid={`employee-credits-${emp.key}`}>
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest">
            <span className="text-ink-dim">
              {inTrial ? "Trial credits" : "Monthly credits"}
            </span>
            <span className={pct >= 80 ? "text-amber-300" : "text-ink"}>
              {creditsUsed?.toLocaleString() || 0} / {creditsTotal?.toLocaleString() || 0}
            </span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-brand"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {inTrial && sub.trial_ends_at && (
            <div className="text-[10px] text-ink-dim flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Trial ends {new Date(sub.trial_ends_at).toLocaleDateString()}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-surface-2/50 rounded-md p-3 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <div className="font-mono uppercase tracking-widest text-ink-dim text-[10px]">Trial</div>
            <div className="font-semibold">7 days · {emp.trial_credits} credits</div>
          </div>
          <div>
            <div className="font-mono uppercase tracking-widest text-ink-dim text-[10px]">After trial</div>
            <div className="font-semibold">{emp.monthly_credits?.toLocaleString()} credits/mo</div>
          </div>
        </div>
      )}

      {/* Capabilities preview */}
      <div className="flex flex-wrap gap-1.5">
        {(emp.capabilities || []).slice(0, 4).map((cap) => (
          <span
            key={cap}
            className="text-[10px] font-mono text-ink-dim border border-hairline rounded-sm px-1.5 py-0.5"
          >
            {cap}
          </span>
        ))}
        {(emp.capabilities || []).length > 4 && (
          <span className="text-[10px] font-mono text-ink-dim">+{emp.capabilities.length - 4} more</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-2">
        {!sub && isOwnerOrAdmin && (
          <button
            data-testid={`start-trial-${emp.key}`}
            onClick={onStartTrial}
            className="flex-1 h-9 rounded-sm bg-brand text-black hover:bg-brand-deep font-mono uppercase text-[11px] tracking-widest"
          >
            Start 7-day trial
          </button>
        )}
        {!sub && !isOwnerOrAdmin && (
          <div className="flex-1 text-[11px] text-ink-dim text-center py-2">
            Ask an owner/admin to start the trial.
          </div>
        )}
        {sub && status === "paused" && isOwnerOrAdmin && (
          <button
            data-testid={`resume-${emp.key}`}
            onClick={onResume}
            className="flex-1 h-9 rounded-sm bg-brand text-black hover:bg-brand-deep font-mono uppercase text-[11px] tracking-widest inline-flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Resume
          </button>
        )}
        {sub && ["trial_active", "trial_ending_soon", "trial_ending_today", "active"].includes(status) && (
          <>
            <button
              data-testid={`open-${emp.key}`}
              onClick={onOpen}
              className="flex-1 h-9 rounded-sm bg-brand text-black hover:bg-brand-deep font-mono uppercase text-[11px] tracking-widest inline-flex items-center justify-center gap-1.5"
            >
              {emp.key === "bookkeeper" ? "Open Bookkeeper" : "Use in chat"}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            {isOwnerOrAdmin && (
              <button
                data-testid={`pause-${emp.key}`}
                onClick={onPause}
                title="Pause"
                className="h-9 w-9 rounded-sm border border-hairline text-ink-dim hover:bg-white/5 flex items-center justify-center"
              >
                <PauseCircle className="w-4 h-4" />
              </button>
            )}
          </>
        )}
        {sub && isOwnerOrAdmin && status !== "cancelled" && (
          <button
            data-testid={`cancel-${emp.key}`}
            onClick={onCancel}
            className="h-9 px-2 rounded-sm border border-hairline text-ink-dim hover:bg-tn-red/10 hover:text-tn-red font-mono uppercase text-[10px] tracking-widest"
          >
            Cancel
          </button>
        )}
      </div>

      {emp.disclaimer && (
        <p className="text-[10px] text-ink-dim italic flex items-start gap-1.5 mt-1">
          <ShieldCheck className="w-3 h-3 mt-0.5 shrink-0" />
          {emp.disclaimer}
        </p>
      )}
    </div>
  );
}

function ComingSoonCard({ emp, onJoinWaitlist }) {
  const Icon = EMPLOYEE_ICONS[emp.key] || Bot;
  return (
    <div
      data-testid={`coming-soon-card-${emp.key}`}
      className="border border-hairline rounded-card bg-surface-1/40 p-4 flex flex-col gap-2 relative overflow-hidden"
    >
      <span className="absolute top-3 right-3 text-[9px] font-mono uppercase tracking-widest bg-zinc-700/40 text-zinc-300 px-1.5 py-0.5 rounded-sm">
        Coming Soon
      </span>
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-white/5 text-ink-dim flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 pr-16">
          <h3 className="text-[14px] font-semibold truncate">{emp.name}</h3>
          <div className="text-[11px] text-ink-dim truncate">{emp.role}</div>
        </div>
      </div>
      <p className="text-[12px] text-ink-dim leading-relaxed line-clamp-3">{emp.description}</p>
      <div className="text-[11px] text-ink-dim font-mono">
        Future pricing: <span className="text-ink">${emp.monthly_price}/mo</span>
      </div>
      <button
        data-testid={`waitlist-${emp.key}`}
        onClick={onJoinWaitlist}
        disabled={emp.on_waitlist}
        className={`w-full h-8 rounded-sm font-mono uppercase text-[10px] tracking-widest mt-1 ${
          emp.on_waitlist
            ? "bg-emerald-500/15 text-emerald-300 cursor-default"
            : "border border-hairline hover:bg-white/5 text-ink"
        }`}
      >
        {emp.on_waitlist ? "✓ On waitlist" : "Join waitlist"}
      </button>
    </div>
  );
}
