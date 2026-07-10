import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, Save, FileText, MessageSquareQuote, User2, Trash2,
  Plus, CheckCircle2, Circle, ThumbsUp, ThumbsDown, Wand2, Palette, Upload,
  Mail, MessageCircle, Send, Sparkles,
} from "lucide-react";

const TONES = [
  "Professional", "Friendly", "Direct", "Executive summary", "Detailed analyst",
  "Sales-oriented", "Legal cautious", "Owner-friendly plain English",
  "Short WhatsApp style", "Formal email style", "Warm customer service", "Conservative finance style",
];
const STATUSES = ["Draft", "Training", "Testing", "Ready", "Deployed", "Paused", "Needs Review", "Archived"];
const RISKS = ["Low", "Medium", "High"];
const DOC_CATEGORIES = ["Knowledge", "Policy", "Template", "Example", "FAQ", "Do-not-do rule", "Escalation rule", "Compliance rule", "Style example", "Workflow example"];

const inputCls = "w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-ink focus:border-ai focus:outline-none";
const labelCls = "text-xs font-semibold text-ink-dim";

/** Editor for a single AI employee: Profile / Training / Examples + completeness. */
export default function EmployeeProfile() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("profile");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/ai-builder/employees/${id}`);
      setData(data);
    } catch {
      toast.error("AI employee not found");
      nav("/ai-builder");
    }
  }, [id, nav]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="min-h-screen bg-bg flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-ai" /></div>;
  const { employee, documents, examples, completeness } = data;

  const TABS = [
    { id: "profile", label: "Profile", icon: User2 },
    { id: "training", label: `Training (${documents.length})`, icon: FileText },
    { id: "examples", label: `Examples (${examples.length})`, icon: MessageSquareQuote },
    { id: "style", label: "Style", icon: Palette },
  ];

  return (
    <div className="min-h-screen bg-bg text-ink px-5 py-8 md:px-10">
      <div className="max-w-4xl mx-auto">
        <button type="button" onClick={() => nav("/ai-builder")} data-testid="ep-back"
          className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink mb-4">
          <ArrowLeft className="w-4 h-4" /> Builder
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold">{employee.name}</h1>
            <p className="text-sm text-ink-dim">{employee.job_title || "—"}{employee.department ? ` · ${employee.department}` : ""}</p>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-ai tabular-nums">{completeness.score}%</div>
            <div className="text-[10px] uppercase tracking-wide text-ink-dim">training complete</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
          <div>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-2 border border-white/10 w-fit mb-5">
              {TABS.map((t) => {
                const Icon = t.icon; const active = tab === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`ep-tab-${t.id}`}
                    className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-sm font-semibold ${active ? "bg-ai text-black" : "text-ink-dim hover:text-ink"}`}>
                    <Icon className="w-4 h-4" /> {t.label}
                  </button>
                );
              })}
            </div>

            {tab === "profile" && <ProfileTab employee={employee} onSaved={load} />}
            {tab === "training" && <TrainingTab employee={employee} documents={documents} onChanged={load} />}
            {tab === "examples" && <ExamplesTab employee={employee} examples={examples} onChanged={load} />}
            {tab === "style" && <StyleTab employee={employee} onChanged={load} />}
          </div>

          <CompletenessPanel completeness={completeness} />
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ employee, onSaved }) {
  const [f, setF] = useState({
    ...employee,
    responsibilities: (employee.responsibilities || []).join("\n"),
    tasks_to_do: (employee.tasks_to_do || []).join("\n"),
    tasks_to_avoid: (employee.tasks_to_avoid || []).join("\n"),
    success_metrics: (employee.success_metrics || []).join("\n"),
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const toList = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/ai-builder/employees/${employee.id}`, {
        name: f.name, job_title: f.job_title, department: f.department, reports_to: f.reports_to,
        description: f.description, tone: f.tone, output_style: f.output_style,
        industry: f.industry, risk_level: f.risk_level, status: f.status,
        responsibilities: toList(f.responsibilities), tasks_to_do: toList(f.tasks_to_do),
        tasks_to_avoid: toList(f.tasks_to_avoid), success_metrics: toList(f.success_metrics),
      });
      toast.success("Profile saved");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name"><input value={f.name} onChange={set("name")} data-testid="ep-name" className={inputCls} /></Field>
        <Field label="Job title"><input value={f.job_title} onChange={set("job_title")} data-testid="ep-title" className={inputCls} /></Field>
        <Field label="Department"><input value={f.department} onChange={set("department")} className={inputCls} /></Field>
        <Field label="Reports to"><input value={f.reports_to} onChange={set("reports_to")} className={inputCls} /></Field>
      </div>
      <Field label="Description"><textarea value={f.description} onChange={set("description")} rows={3} data-testid="ep-desc" className={inputCls} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Default tone">
          <select value={f.tone} onChange={set("tone")} data-testid="ep-tone" className={inputCls}>{TONES.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <Field label="Output style"><input value={f.output_style} onChange={set("output_style")} className={inputCls} /></Field>
        <Field label="Industry"><input value={f.industry} onChange={set("industry")} className={inputCls} /></Field>
        <Field label="Risk level">
          <select value={f.risk_level} onChange={set("risk_level")} className={inputCls}>{RISKS.map((r) => <option key={r}>{r}</option>)}</select>
        </Field>
        <Field label="Status">
          <select value={f.status} onChange={set("status")} data-testid="ep-status" className={inputCls}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Main responsibilities (one per line)"><textarea value={f.responsibilities} onChange={set("responsibilities")} rows={4} data-testid="ep-resp" className={inputCls} /></Field>
        <Field label="Success metrics (one per line)"><textarea value={f.success_metrics} onChange={set("success_metrics")} rows={4} className={inputCls} /></Field>
        <Field label="Daily/weekly tasks (one per line)"><textarea value={f.tasks_to_do} onChange={set("tasks_to_do")} rows={4} className={inputCls} /></Field>
        <Field label="Tasks it should NOT do (one per line)"><textarea value={f.tasks_to_avoid} onChange={set("tasks_to_avoid")} rows={4} className={inputCls} /></Field>
      </div>
      <button type="button" onClick={save} disabled={saving} data-testid="ep-save"
        className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-ai text-black font-bold text-sm disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save profile
      </button>
    </div>
  );
}

function TrainingTab({ employee, documents, onChanged }) {
  const [form, setForm] = useState({ title: "", category: "Knowledge", content: "" });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const add = async () => {
    setBusy(true);
    try {
      await api.post(`/ai-builder/employees/${employee.id}/documents`, form);
      toast.success("Document added");
      setForm({ title: "", category: "Knowledge", content: "" });
      onChanged();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    setBusy(false);
  };
  const del = async (docId) => {
    try { await api.delete(`/ai-builder/employees/${employee.id}/documents/${docId}`); onChanged(); }
    catch { toast.error("Failed"); }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data: up } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await api.post(`/ai-builder/employees/${employee.id}/documents`, {
        title: file.name, category: form.category, file_id: up.id, filename: up.filename,
      });
      toast.success(`Uploaded ${file.name}`);
      onChanged();
    } catch (err) { toast.error(err?.response?.data?.detail || "Upload failed"); }
    setUploading(false);
  };

  return (
    <div>
      <div className="rounded-xl border border-white/10 bg-surface-2 p-4 space-y-3">
        <div className="text-xs text-ink-dim">Documents are private to this workspace and excluded from central learning by default.</div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
          <input placeholder="Document title" value={form.title} onChange={set("title")} data-testid="ep-doc-title" className={inputCls} />
          <select value={form.category} onChange={set("category")} data-testid="ep-doc-cat" className={inputCls}>{DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <textarea placeholder="Paste content (SOP, policy, FAQ, script…)" value={form.content} onChange={set("content")} rows={4} data-testid="ep-doc-content" className={inputCls} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={add} disabled={busy || !form.title || !form.content} data-testid="ep-doc-add"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-ai text-black font-bold text-xs disabled:opacity-50">
            <Plus className="w-4 h-4" /> Add document
          </button>
          <label data-testid="ep-doc-upload" className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-white/10 hover:bg-white/15 text-ink font-semibold text-xs cursor-pointer">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload file
            <input type="file" className="hidden" onChange={onFile} accept=".pdf,.txt,.csv,.md,.docx,.xlsx,.json" disabled={uploading} />
          </label>
          <span className="text-[11px] text-ink-dim">PDF, DOCX, TXT, CSV, MD — uses the selected category</span>
        </div>
      </div>
      <div className="space-y-2 mt-4">
        {documents.length === 0 && <p className="text-sm text-ink-dim text-center py-6">No training documents yet.</p>}
        {documents.map((d) => (
          <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-surface-2" data-testid={`ep-doc-${d.id}`}>
            <FileText className="w-4 h-4 text-ai shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{d.title}</div>
              <div className="text-[11px] text-ink-dim">{d.category} · {d.status}{d.filename ? ` · ${d.filename}` : ""}</div>
            </div>
            <button type="button" onClick={() => del(d.id)} data-testid={`ep-doc-del-${d.id}`} className="p-1.5 text-ink-dim hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExamplesTab({ employee, examples, onChanged }) {
  const [form, setForm] = useState({ title: "", example_type: "General", is_good: true, content: "", rationale: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const add = async () => {
    setBusy(true);
    try {
      await api.post(`/ai-builder/employees/${employee.id}/examples`, form);
      toast.success("Example added");
      setForm({ title: "", example_type: "General", is_good: true, content: "", rationale: "" });
      onChanged();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    setBusy(false);
  };
  const del = async (exId) => {
    try { await api.delete(`/ai-builder/employees/${employee.id}/examples/${exId}`); onChanged(); }
    catch { toast.error("Failed"); }
  };

  return (
    <div>
      <div className="rounded-xl border border-white/10 bg-surface-2 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-2">
          <input placeholder="Example title" value={form.title} onChange={set("title")} data-testid="ep-ex-title" className={inputCls} />
          <input placeholder="Type (e.g. Sales email)" value={form.example_type} onChange={set("example_type")} className={inputCls} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setForm((p) => ({ ...p, is_good: true }))} data-testid="ep-ex-good"
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold ${form.is_good ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-ink-dim"}`}>
            <ThumbsUp className="w-3.5 h-3.5" /> Good
          </button>
          <button type="button" onClick={() => setForm((p) => ({ ...p, is_good: false }))} data-testid="ep-ex-bad"
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold ${!form.is_good ? "bg-rose-500/20 text-rose-300" : "bg-white/5 text-ink-dim"}`}>
            <ThumbsDown className="w-3.5 h-3.5" /> Bad
          </button>
        </div>
        <textarea placeholder="Example content" value={form.content} onChange={set("content")} rows={3} data-testid="ep-ex-content" className={inputCls} />
        <input placeholder="What makes it good/bad?" value={form.rationale} onChange={set("rationale")} className={inputCls} />
        <button type="button" onClick={add} disabled={busy || !form.title || !form.content} data-testid="ep-ex-add"
          className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-ai text-black font-bold text-xs disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add example
        </button>
      </div>
      <div className="space-y-2 mt-4">
        {examples.length === 0 && <p className="text-sm text-ink-dim text-center py-6">No examples yet. Add good and bad examples to teach style.</p>}
        {examples.map((ex) => (
          <div key={ex.id} className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-surface-2" data-testid={`ep-ex-${ex.id}`}>
            {ex.is_good ? <ThumbsUp className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> : <ThumbsDown className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{ex.title} <span className="text-[11px] text-ink-dim font-normal">· {ex.example_type}</span></div>
              <div className="text-xs text-ink-dim line-clamp-2">{ex.content}</div>
            </div>
            <button type="button" onClick={() => del(ex.id)} data-testid={`ep-ex-del-${ex.id}`} className="p-1.5 text-ink-dim hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StyleTab({ employee, onChanged }) {
  const [connectors, setConnectors] = useState([]);
  const [sources, setSources] = useState([]);
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null);   // profile object being edited
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [manual, setManual] = useState("");

  const CONN_ICON = { gmail: Mail, slack: MessageCircle, whatsapp: Send };

  const load = async () => {
    try {
      const [c, s, p] = await Promise.all([
        api.get("/ai-builder/style-connectors"),
        api.get(`/ai-builder/employees/${employee.id}/style-sources`),
        api.get(`/ai-builder/employees/${employee.id}/style-profile`),
      ]);
      setConnectors(c.data.connectors);
      setSources(s.data.sources);
      setSaved(p.data.saved);
      setDraft(p.data.draft);
      setEditing(p.data.saved?.profile || p.data.draft?.profile || null);
    } catch { toast.error("Failed to load style data"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [employee.id]);

  const connect = async (source) => {
    setBusy(`c-${source}`);
    try {
      await api.post(`/ai-builder/employees/${employee.id}/style-sources`, { source });
      toast.success("Style source connected (sample data)");
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    setBusy("");
  };
  const addManual = async () => {
    setBusy("manual");
    try {
      await api.post(`/ai-builder/employees/${employee.id}/style-sources/manual`, { text: manual });
      toast.success("Sample added");
      setManual("");
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    setBusy("");
  };
  const delSource = async (sid) => {
    try { await api.delete(`/ai-builder/employees/${employee.id}/style-sources/${sid}`); await load(); }
    catch { toast.error("Failed"); }
  };
  const generate = async () => {
    setBusy("gen");
    try {
      const { data } = await api.post(`/ai-builder/employees/${employee.id}/style-profile/generate`);
      setDraft(data);
      setEditing(data.profile);
      const byFable = data.profile?.generated_by === "claude-fable-5";
      toast.success(byFable ? "Style profile generated with Claude Fable 5" : "Style profile generated");
    } catch (e) { toast.error(e?.response?.data?.detail || "Generation failed"); }
    setBusy("");
  };
  const saveProfile = async () => {
    setBusy("save");
    try {
      await api.post(`/ai-builder/employees/${employee.id}/style-profile`, { profile: editing });
      toast.success("Style profile saved");
      await load();
      onChanged();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    setBusy("");
  };
  const setP = (k) => (e) => setEditing((p) => ({ ...p, [k]: e.target.value }));

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-ai" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-bold mb-1">Connect style sources</div>
        <p className="text-xs text-ink-dim mb-3">Sample writing from these sources teaches the AI your voice. Connectors are demo samples — no account access.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {connectors.map((c) => {
            const Icon = CONN_ICON[c.id] || Mail;
            const connected = sources.some((s) => s.source === c.id);
            return (
              <button key={c.id} type="button" onClick={() => connect(c.id)} disabled={busy === `c-${c.id}`}
                data-testid={`ep-style-connect-${c.id}`}
                className={`flex items-center gap-2 h-11 px-3 rounded-xl border text-sm font-semibold transition-colors ${connected ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-surface-2 text-ink hover:border-ai/40"}`}>
                {busy === `c-${c.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                {c.label}
                {connected && <CheckCircle2 className="w-4 h-4 ml-auto" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-surface-2 p-4 space-y-2">
        <div className="text-xs font-semibold text-ink-dim">Paste your own writing sample</div>
        <textarea placeholder="Paste an email, message or note written in the target voice…" value={manual} onChange={(e) => setManual(e.target.value)} rows={3} data-testid="ep-style-manual" className={inputCls} />
        <button type="button" onClick={addManual} disabled={busy === "manual" || !manual.trim()} data-testid="ep-style-manual-add"
          className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-white/10 hover:bg-white/15 text-ink font-semibold text-xs disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add sample
        </button>
      </div>

      {sources.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-ink-dim">Connected samples ({sources.length})</div>
          {sources.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-surface-2" data-testid={`ep-style-src-${s.id}`}>
              <Palette className="w-4 h-4 text-ai shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{s.label}</div>
                <div className="text-[11px] text-ink-dim">{s.samples?.length || 0} sample(s){s.is_mock ? " · demo" : ""}</div>
              </div>
              <button type="button" onClick={() => delSource(s.id)} data-testid={`ep-style-src-del-${s.id}`} className="p-1.5 text-ink-dim hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={generate} disabled={busy === "gen"} data-testid="ep-style-generate"
        className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-ai text-black font-bold text-sm disabled:opacity-50">
        {busy === "gen" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Generate style profile
      </button>

      {editing && (
        <div className="rounded-2xl border border-white/10 bg-surface-2 p-5 space-y-4" data-testid="ep-style-profile">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-ai" />
            <div className="text-sm font-bold flex-1">Style profile</div>
            {saved && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">Saved</span>}
            {!saved && draft && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">Draft</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Tone"><input value={editing.tone || ""} onChange={setP("tone")} data-testid="ep-style-tone" className={inputCls} /></Field>
            <Field label="Formality">
              <select value={editing.formality || "Neutral"} onChange={setP("formality")} className={inputCls}>{["Casual", "Neutral", "Formal"].map((x) => <option key={x}>{x}</option>)}</select>
            </Field>
            <Field label="Sentence length">
              <select value={editing.avg_sentence_length || "Medium"} onChange={setP("avg_sentence_length")} className={inputCls}>{["Short", "Medium", "Long"].map((x) => <option key={x}>{x}</option>)}</select>
            </Field>
            <Field label="Vocabulary">
              <select value={editing.vocabulary || "Everyday"} onChange={setP("vocabulary")} className={inputCls}>{["Simple", "Everyday", "Technical", "Sophisticated"].map((x) => <option key={x}>{x}</option>)}</select>
            </Field>
            <Field label="Greeting"><input value={editing.greeting || ""} onChange={setP("greeting")} className={inputCls} /></Field>
            <Field label="Sign-off"><input value={editing.sign_off || ""} onChange={setP("sign_off")} className={inputCls} /></Field>
            <Field label="Emoji usage">
              <select value={editing.emoji_usage || "None"} onChange={setP("emoji_usage")} className={inputCls}>{["None", "Sparing", "Frequent"].map((x) => <option key={x}>{x}</option>)}</select>
            </Field>
          </div>
          <Field label="Summary"><textarea value={editing.summary || ""} onChange={setP("summary")} rows={2} data-testid="ep-style-summary" className={inputCls} /></Field>
          {Array.isArray(editing.signature_phrases) && editing.signature_phrases.length > 0 && (
            <div>
              <span className={labelCls}>Signature phrases</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {editing.signature_phrases.map((p) => <span key={p} className="text-[11px] px-2 py-0.5 rounded-full bg-ai-tint text-ai">{p}</span>)}
              </div>
            </div>
          )}
          {Array.isArray(editing.avoid_phrases) && editing.avoid_phrases.length > 0 && (
            <div>
              <span className={labelCls}>Avoid</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {editing.avoid_phrases.map((p) => <span key={p} className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300">{p}</span>)}
              </div>
            </div>
          )}
          <button type="button" onClick={saveProfile} disabled={busy === "save"} data-testid="ep-style-save"
            className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-ai text-black font-bold text-sm disabled:opacity-50">
            {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save style profile
          </button>
        </div>
      )}
    </div>
  );
}

function CompletenessPanel({ completeness }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface-2 p-5 h-fit">
      <div className="text-sm font-bold mb-1">Training completeness</div>
      <div className="text-3xl font-extrabold text-ai tabular-nums mb-3">{completeness.score}%</div>
      <div className="space-y-2">
        {completeness.checks.map((c) => (
          <div key={c.label} className="flex items-center gap-2 text-xs">
            {c.done ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Circle className="w-4 h-4 text-ink-dim shrink-0" />}
            <span className={c.done ? "text-ink" : "text-ink-dim"}>{c.label}</span>
          </div>
        ))}
      </div>
      {completeness.recommendations.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-dim mb-2">Next steps</div>
          <ul className="space-y-1.5">
            {completeness.recommendations.map((r) => <li key={r} className="text-xs text-ink-dim flex gap-1.5"><span className="text-ai">•</span>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block"><span className={labelCls}>{label}</span><div className="mt-1">{children}</div></label>;
}
