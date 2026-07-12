import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, Loader2, ShieldCheck, FileText, GitBranch, Users, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { RiskBadge, ContinuityBar } from "@/pages/EnterprisePage";

const TABS = ["Overview", "Role", "Responsibilities", "Knowledge", "Decisions", "Relationships", "Successor"];

function List({ items, empty = "None recorded." }) {
  if (!items || items.length === 0) return <p className="text-sm text-ink-mute">{empty}</p>;
  return <ul className="space-y-1.5">{items.map((x, i) => (
    <li key={i} className="text-sm text-ink flex gap-2"><span className="text-ai">•</span><span>{typeof x === "string" ? x : JSON.stringify(x)}</span></li>
  ))}</ul>;
}

function Card({ title, icon: Icon, children }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="text-sm font-bold text-ink mb-3 flex items-center gap-2">{Icon && <Icon className="w-4 h-4 text-ai" />} {title}</h3>
      {children}
    </section>
  );
}

export default function EnterpriseProfile() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("Overview");

  const load = useCallback(() => {
    api.get(`/enterprise/people/${id}`).then((r) => setData(r.data)).catch(() => toast.error("Failed to load profile"));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="min-h-screen bg-bg flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-ai" /></div>;

  const { employee: e, role, profile, score, memories } = data;

  const setStatus = async (status) => {
    try { await api.patch(`/enterprise/people/${id}`, { employment_status: status }); toast.success(`Marked ${status}`); load(); }
    catch { toast.error("Failed"); }
  };

  return (
    <div className="min-h-screen bg-bg text-ink px-5 pt-16 pb-8 md:px-10" data-testid="enterprise-profile">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => nav("/enterprise")} className="text-sm text-ink-dim hover:text-ink flex items-center gap-1 mb-4" data-testid="profile-back">
          <ChevronLeft className="w-4 h-4" /> Enterprise People
        </button>

        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-ai-tint text-ai flex items-center justify-center text-xl font-bold">{e.employee_name[0]}</div>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">{e.employee_name}
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-ink-mute">{e.employment_status}</span>
            </h1>
            <p className="text-sm text-ink-dim">{role?.role_name} · {e.department} · {e.employee_email}</p>
          </div>
          {score && <div className="text-right"><RiskBadge level={score.risk_level} /><div className="mt-1 w-32"><ContinuityBar score={score.overall_score} /></div></div>}
        </div>

        {e.employment_status !== "Departing" && (
          <button onClick={() => setStatus("Departing")} data-testid="mark-departing"
            className="mb-5 text-xs px-3 py-1.5 rounded-lg border border-orange-500/40 text-orange-400 hover:bg-orange-500/10">Mark as departing</button>
        )}

        <div className="flex gap-1 mb-6 border-b border-line overflow-x-auto">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} data-testid={`ptab-${t.toLowerCase()}`}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t ? "border-ai text-ai" : "border-transparent text-ink-dim hover:text-ink"}`}>{t}</button>
          ))}
        </div>

        <div className="space-y-4">
          {tab === "Overview" && (
            <>
              <Card title="Role summary" icon={FileText}><p className="text-sm text-ink">{profile?.role_summary || role?.description || "—"}</p></Card>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card title="Reports & coverage" icon={Users}>
                  <div className="text-sm text-ink-dim space-y-1">
                    <div>Location: <span className="text-ink">{e.location || "—"}</span></div>
                    <div>Unique knowledge: <span className="text-ink">{e.unique_knowledge_level}</span></div>
                    <div>Backup: <span className="text-ink">{e.backup_user_id ? "Assigned" : "None"}</span></div>
                    <div>Successor: <span className="text-ink">{e.successor_user_id ? "Assigned" : "Not assigned"}</span></div>
                  </div>
                </Card>
                <Card title="Known risks" icon={AlertTriangle}><List items={profile?.known_risks} empty="No risks recorded." /></Card>
              </div>
            </>
          )}
          {tab === "Role" && <Card title="Role description" icon={FileText}><p className="text-sm text-ink mb-3">{role?.description}</p>
            <div className="text-xs text-ink-dim">Approval: {role?.approval_authority}</div>
            <div className="text-xs text-ink-dim mt-1">Escalation: {role?.escalation_rules}</div></Card>}
          {tab === "Responsibilities" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card title="Responsibilities"><List items={role?.responsibilities} /></Card>
              <Card title="Daily / Weekly / Monthly">
                <p className="text-[11px] uppercase tracking-widest text-ink-mute mt-1">Daily</p><List items={role?.daily_tasks} />
                <p className="text-[11px] uppercase tracking-widest text-ink-mute mt-3">Weekly</p><List items={role?.weekly_tasks} />
                <p className="text-[11px] uppercase tracking-widest text-ink-mute mt-3">Monthly</p><List items={role?.monthly_tasks} />
              </Card>
            </div>
          )}
          {tab === "Knowledge" && (
            <Card title="Approved role knowledge (source-grounded)" icon={ShieldCheck}>
              {(!memories || memories.length === 0) ? <p className="text-sm text-ink-mute">No approved knowledge yet. Capture from chats/tasks in the next phase.</p> : (
                <div className="space-y-2">
                  {memories.map((m) => (
                    <div key={m.id} className="rounded-xl border border-line p-3" data-testid={`memory-${m.id}`}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-ink">{m.title}</div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-ink-dim">{m.memory_type}</span>
                          {m.transferable && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">Transferable</span>}
                        </div>
                      </div>
                      <p className="text-xs text-ink-dim mt-1">{m.content}</p>
                      <div className="text-[10px] text-ink-mute mt-2 flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-white/5">{m.source_type}</span>
                        <span>{m.source_date}</span>
                        <span>· confidence {Math.round((m.confidence || 0) * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
          {tab === "Decisions" && <Card title="Decision history" icon={GitBranch}><List items={(profile?.decision_history || []).map((d) => `${d.date}: ${d.decision} — ${d.reason} (approver: ${d.approver})`)} empty="No decisions recorded." /></Card>}
          {tab === "Relationships" && <Card title="Business relationships" icon={Users}><List items={(profile?.relationships || []).map((r) => `${r.org} (${r.type}) — ${r.notes}`)} empty="No relationships recorded." /></Card>}
          {tab === "Successor" && (
            <Card title="Successor & continuity" icon={Users}>
              <p className="text-sm text-ink-dim mb-2">Successor assignment, handoff package and 30/60/90 onboarding are built in the Continuity phase.</p>
              <div className="text-sm text-ink">Current successor: <span className="text-ink-dim">{e.successor_user_id ? "Assigned" : "Not assigned"}</span></div>
              <div className="text-sm text-ink mt-1">Transfer status: <span className="text-ink-dim">{e.knowledge_transfer_status}</span></div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
