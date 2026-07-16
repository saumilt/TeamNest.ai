import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ChevronLeft, Loader2, ShieldCheck, FileText, GitBranch, Users, AlertTriangle,
  UserCheck, CheckCircle2, Circle, MessageSquare, Send, Sparkles, Quote, Plus, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { RiskBadge, ContinuityBar } from "@/pages/EnterprisePage";

const TABS = ["Overview", "Role", "Responsibilities", "Knowledge", "Decisions", "Relationships", "Successor", "Ask Role"];
const PHASE_LABEL = { "30": "First 30 days", "60": "First 60 days", "90": "First 90 days" };

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

function SuccessorTab({ employee, roleId, onChanged }) {
  const eid = employee.id;
  const [candidates, setCandidates] = useState([]);
  const [handoff, setHandoff] = useState(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, pct: 0 });
  const [transferStatus, setTransferStatus] = useState(employee.knowledge_transfer_status || "not_started");
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, h] = await Promise.all([
        api.get(`/enterprise/people/${eid}/candidates`),
        api.get(`/enterprise/people/${eid}/handoff`),
      ]);
      setCandidates(c.data.candidates || []);
      setHandoff(h.data.handoff);
      setProgress(h.data.progress);
      setTransferStatus(h.data.transfer_status);
      setPick(h.data.handoff?.successor_user_id || c.data.candidates?.[0]?.id || "");
    } finally { setLoading(false); }
  }, [eid]);
  useEffect(() => { load(); }, [load]);

  const assign = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const r = await api.post(`/enterprise/people/${eid}/successor`, { successor_user_id: pick });
      setHandoff(r.data.handoff);
      toast.success("Successor assigned · handoff package generated");
      await load(); onChanged?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };

  const toggle = async (item) => {
    try {
      const r = await api.post(`/enterprise/people/${eid}/handoff/checklist`, { item_id: item.id, done: !item.done });
      setHandoff({ ...handoff, checklist: handoff.checklist.map((c) => c.id === item.id ? { ...c, done: !c.done } : c) });
      setProgress(r.data.progress); setTransferStatus(r.data.transfer_status);
      if (r.data.transfer_status === "complete") toast.success("Knowledge transfer complete");
    } catch { toast.error("Failed to update"); }
  };

  if (loading) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-ai" /></div>;

  return (
    <div className="space-y-4">
      <Card title="Assign successor" icon={UserCheck}>
        <p className="text-sm text-ink-dim mb-3">Transfer the role knowledge to a successor. A 30/60/90 handoff package is generated from the approved role knowledge — no personal identity is shared.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} data-testid="successor-select"
            className="flex-1 h-11 rounded-xl bg-bg border border-line px-3 text-ink text-sm">
            {candidates.length === 0 && <option value="">No candidates</option>}
            {candidates.map((c) => <option key={c.id} value={c.id}>{c.employee_name} — {c.role_name || c.department || "—"}</option>)}
          </select>
          <button onClick={assign} disabled={busy || !pick} data-testid="assign-successor-btn"
            className="h-11 px-4 rounded-xl bg-ai text-black font-bold flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            {handoff ? "Reassign" : "Assign"}
          </button>
        </div>
        {handoff && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-full bg-ai-tint text-ai font-semibold">Successor: {handoff.successor_name}</span>
            <span className="px-2 py-0.5 rounded-full bg-white/10 text-ink-mute capitalize">{transferStatus.replace("_", " ")}</span>
          </div>
        )}
      </Card>

      {handoff && (
        <>
          <Card title="Handoff brief (anonymized)" icon={FileText}>
            <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed" data-testid="handoff-brief">{handoff.brief}</p>
          </Card>
          <Card title="Knowledge transfer checklist" icon={CheckCircle2}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1"><ContinuityBar score={progress.pct} /></div>
              <span className="text-xs text-ink-dim tabular-nums">{progress.done}/{progress.total} done</span>
            </div>
            {["30", "60", "90"].map((phase) => {
              const items = handoff.checklist.filter((c) => c.phase === phase);
              if (!items.length) return null;
              return (
                <div key={phase} className="mb-4">
                  <p className="text-[11px] uppercase tracking-widest text-ink-mute mb-2">{PHASE_LABEL[phase]}</p>
                  <div className="space-y-1.5">
                    {items.map((c) => (
                      <button key={c.id} onClick={() => toggle(c)} data-testid={`checklist-${c.id}`}
                        className="w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                        {c.done ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> : <Circle className="w-4 h-4 text-ink-mute mt-0.5 shrink-0" />}
                        <span className={`text-sm ${c.done ? "text-ink-mute line-through" : "text-ink"}`}>{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}

function AskRoleTab({ roleId, roleName }) {
  const [sessionId, setSessionId] = useState(null);
  const [turns, setTurns] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, busy]);

  const send = async () => {
    const question = q.trim();
    if (!question || busy) return;
    setQ(""); setBusy(true);
    setTurns((t) => [...t, { question, answer: null, citations: [] }]);
    try {
      const r = await api.post(`/enterprise/roles/${roleId}/ask`, { question, session_id: sessionId });
      setSessionId(r.data.session_id);
      setTurns((t) => t.map((x, i) => i === t.length - 1 ? { ...x, answer: r.data.answer, citations: r.data.citations || [] } : x));
    } catch (e) {
      setTurns((t) => t.map((x, i) => i === t.length - 1 ? { ...x, answer: e?.response?.data?.detail || "Failed to answer." } : x));
    } finally { setBusy(false); }
  };

  const SUGGESTIONS = [
    "What are the most important recurring tasks in this role?",
    "How were pricing/approval exceptions handled?",
    "What are the top risks I should watch out for?",
  ];

  return (
    <div className="rounded-2xl border border-line bg-surface flex flex-col" style={{ height: "60vh" }} data-testid="ask-role-panel">
      <div className="p-4 border-b border-line flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-ai" />
        <div>
          <div className="text-sm font-bold text-ink">Ask the {roleName} role</div>
          <div className="text-[11px] text-ink-mute">Grounded in approved role knowledge only · no personal identity shared</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {turns.length === 0 && (
          <div className="text-center pt-8">
            <MessageSquare className="w-8 h-8 text-ink-mute mx-auto mb-3" />
            <p className="text-sm text-ink-dim mb-4">Ask anything about how this role&apos;s work gets done.</p>
            <div className="flex flex-col gap-2 max-w-sm mx-auto">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => setQ(s)} data-testid="ask-suggestion"
                  className="text-left text-xs px-3 py-2 rounded-xl border border-line text-ink-dim hover:border-ai/40 hover:text-ink">{s}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-sm bg-ai text-black px-3 py-2 text-sm" data-testid="ask-question">{t.question}</div></div>
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-bg border border-line px-3 py-2">
                {t.answer === null ? <Loader2 className="w-4 h-4 animate-spin text-ai" /> : (
                  <>
                    <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed" data-testid="ask-answer">{t.answer}</p>
                    {t.citations?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-line flex flex-wrap gap-1">
                        {t.citations.map((c) => (
                          <span key={c.n} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-ink-mute flex items-center gap-1">
                            <Quote className="w-2.5 h-2.5" />[S{c.n}] {c.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="p-3 border-t border-line flex gap-2 relative z-[60]">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about this role…" data-testid="ask-input"
          className="flex-1 h-11 rounded-xl bg-bg border border-line px-3 text-ink text-sm" />
        <button onClick={send} disabled={busy || !q.trim()} data-testid="ask-send-btn"
          className="h-11 w-11 rounded-xl bg-ai text-black flex items-center justify-center disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function CaptureModal({ roleId, roleName, onClose, onDone }) {
  const [text, setText] = useState("");
  const [chatId, setChatId] = useState("");
  const [chats, setChats] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/chats").then((r) => setChats(r.data.chats || r.data || [])).catch(() => {}); }, []);

  const submit = async () => {
    if (!text.trim() && !chatId) { toast.error("Paste text or pick a chat"); return; }
    setBusy(true);
    try {
      const r = await api.post(`/enterprise/roles/${roleId}/capture`, chatId ? { chat_id: chatId } : { text });
      if (r.data.proposed > 0) toast.success(`${r.data.proposed} item(s) proposed — review in the Review queue`);
      else toast.info(r.data.note || "Nothing worth preserving found");
      onDone?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Capture failed"); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" data-testid="capture-modal">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-bg p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-ink flex items-center gap-2"><Sparkles className="w-4 h-4 text-ai" /> Capture knowledge</h3>
          <button onClick={onClose} className="text-ink-mute hover:text-ink"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-ink-mute mb-4">For the <span className="text-ai">{roleName}</span> role. We extract anonymized, transferable knowledge for admin review — the person&apos;s identity is never stored.</p>
        <label className="text-[11px] uppercase tracking-widest text-ink-mute">Capture from a chat (optional)</label>
        <select value={chatId} onChange={(e) => setChatId(e.target.value)} data-testid="capture-chat"
          className="w-full mt-1 mb-4 h-11 rounded-xl bg-surface border border-line px-3 text-ink text-sm">
          <option value="">— Paste text instead —</option>
          {chats.map((c) => <option key={c.id} value={c.id}>{c.name || c.title || "Chat"}</option>)}
        </select>
        {!chatId && (
          <>
            <label className="text-[11px] uppercase tracking-widest text-ink-mute">Paste notes / chat excerpt / meeting summary</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} data-testid="capture-text" rows={6}
              className="w-full mt-1 mb-4 rounded-xl bg-surface border border-line px-3 py-2 text-ink text-sm"
              placeholder="e.g. How we handle disputed vendor invoices, the monthly close steps, a key client decision…" />
          </>
        )}
        <button onClick={submit} disabled={busy} data-testid="capture-submit"
          className="w-full h-11 rounded-xl bg-ai text-black font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Propose knowledge
        </button>
      </div>
    </div>
  );
}

export default function EnterpriseProfile() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("Overview");
  const [capturing, setCapturing] = useState(false);

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
            <button key={t} onClick={() => setTab(t)} data-testid={`ptab-${t.toLowerCase().replace(/\s+/g, "-")}`}
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
            <div className="space-y-3">
              <div className="flex justify-end">
                <button onClick={() => setCapturing(true)} data-testid="capture-knowledge-btn"
                  className="text-xs px-3 py-2 rounded-lg bg-ai text-black font-semibold flex items-center gap-1"><Plus className="w-4 h-4" /> Capture knowledge</button>
              </div>
              <Card title="Approved role knowledge (source-grounded)" icon={ShieldCheck}>
              {(!memories || memories.length === 0) ? <p className="text-sm text-ink-mute">No approved knowledge yet. Use &ldquo;Capture knowledge&rdquo; to propose items from a chat or notes, then approve them in the Review queue.</p> : (
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
            </div>
          )}
          {tab === "Decisions" && <Card title="Decision history" icon={GitBranch}><List items={(profile?.decision_history || []).map((d) => `${d.date}: ${d.decision} — ${d.reason} (approver: ${d.approver})`)} empty="No decisions recorded." /></Card>}
          {tab === "Relationships" && <Card title="Business relationships" icon={Users}><List items={(profile?.relationships || []).map((r) => `${r.org} (${r.type}) — ${r.notes}`)} empty="No relationships recorded." /></Card>}
          {tab === "Successor" && role && (
            <SuccessorTab employee={e} roleId={role.id} onChanged={load} />
          )}
          {tab === "Ask Role" && role && (
            <AskRoleTab roleId={role.id} roleName={role.role_name} />
          )}
        </div>
      </div>
      {capturing && role && (
        <CaptureModal roleId={role.id} roleName={role.role_name}
          onClose={() => setCapturing(false)} onDone={() => { setCapturing(false); load(); }} />
      )}
    </div>
  );
}
