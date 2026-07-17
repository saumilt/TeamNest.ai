import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Plug, Mail, Building2, MessageSquare, FolderOpen, ShieldCheck, Loader2,
  Check, X, ScrollText, Sparkles, Lock,
} from "lucide-react";
import { api } from "@/lib/api";

const CAT_ICON = { Email: Mail, CRM: Building2, Chat: MessageSquare, Files: FolderOpen };

function TrainModal({ account, onClose }) {
  const nav = useNavigate();
  const base = account.provider === "m365" ? "m365" : "gmail";
  const providerName = account.provider === "m365" ? "Microsoft 365" : "Gmail";
  const [employees, setEmployees] = useState([]);
  const [eid, setEid] = useState("");
  const [days, setDays] = useState(90);
  const [source, setSource] = useState("mail");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get("/ai-builder/employees").then((r) => {
      const list = r.data.employees || [];
      setEmployees(list);
      if (list[0]) setEid(list[0].id);
    }).catch(() => {});
  }, []);

  const run = async () => {
    if (!eid) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/connectors/${base}/train-employee`, {
        account_id: account.id, employee_id: eid, days: Number(days), max_messages: 40,
        preview_only: true, source: base === "m365" ? source : "mail",
      });
      setResult(data);
      toast.success(`Found ${data.samples_found} redacted samples — review before saving`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Preview failed");
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!result?.preview_id) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/connectors/${base}/save-training`, { preview_id: result.preview_id });
      toast.success(`Attached ${data.samples_added} samples to the employee`);
      nav(data.next);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="train-modal">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-bg p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-ink">Train an AI employee from {providerName}</h3>
            <p className="text-sm text-ink-dim">{account.provider_account_email}</p>
          </div>
          <button onClick={onClose} data-testid="train-close" className="text-ink-mute hover:text-ink"><X className="w-5 h-5" /></button>
        </div>

        {result ? (
          <div data-testid="train-result">
            <div className="rounded-xl bg-ai-tint border border-ai/20 p-3 text-sm text-ink mb-3">
              {result.note}
            </div>
            <p className="text-xs uppercase tracking-widest text-ink-mute mb-1">Review {result.samples_found} redacted samples</p>
            <div className="space-y-2 max-h-56 overflow-auto mb-4">
              {(result.preview || []).map((p, i) => (
                <div key={i} className="text-xs text-ink-dim bg-surface border border-line rounded-lg p-2 whitespace-pre-wrap">{p}…</div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setResult(null)} data-testid="train-back"
                className="flex-1 h-11 rounded-xl border border-line text-ink-dim hover:text-ink font-semibold">Back</button>
              <button onClick={save} disabled={busy} data-testid="train-save"
                className="flex-1 h-11 rounded-xl bg-ai text-black font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save to employee
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-ai-tint border border-ai/20 p-3 text-xs text-ink mb-4">
              Read-only. We analyse your recent sent emails to learn your writing style, then redact
              names, emails, numbers and amounts. You review the redacted samples before anything is saved.
              We learn style, not secrets.
            </div>
            <label className="text-[11px] uppercase tracking-widest text-ink-mute">AI employee</label>
            <select value={eid} onChange={(e) => setEid(e.target.value)} data-testid="train-employee"
              className="w-full mt-1 mb-3 h-11 rounded-xl bg-surface border border-line px-3 text-ink text-sm">
              {employees.length === 0 && <option value="">No AI employees yet</option>}
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <label className="text-[11px] uppercase tracking-widest text-ink-mute">Date range — analyse last</label>
            <select value={days} onChange={(e) => setDays(e.target.value)} data-testid="train-days"
              className="w-full mt-1 mb-4 h-11 rounded-xl bg-surface border border-line px-3 text-ink text-sm">
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
            </select>
            {base === "m365" && (
              <>
                <label className="text-[11px] uppercase tracking-widest text-ink-mute">Source</label>
                <select value={source} onChange={(e) => setSource(e.target.value)} data-testid="train-source"
                  className="w-full mt-1 mb-4 h-11 rounded-xl bg-surface border border-line px-3 text-ink text-sm">
                  <option value="mail">Outlook sent mail</option>
                  <option value="teams">Microsoft Teams chat</option>
                </select>
              </>
            )}
            <button onClick={run} disabled={busy || !eid} data-testid="train-run"
              className="w-full h-11 rounded-xl bg-ai text-black font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Preview samples
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function LogsModal({ account, onClose }) {
  const [logs, setLogs] = useState(null);
  useEffect(() => {
    api.get(`/connectors/accounts/${account.id}/logs`).then((r) => setLogs(r.data.logs || [])).catch(() => setLogs([]));
  }, [account.id]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="logs-modal">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-bg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-ink flex items-center gap-2"><ScrollText className="w-5 h-5 text-ai" /> Connector logs</h3>
          <button onClick={onClose} data-testid="logs-close" className="text-ink-mute hover:text-ink"><X className="w-5 h-5" /></button>
        </div>
        {!logs ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-ai" /></div> : (
          <div className="space-y-2 max-h-80 overflow-auto">
            {logs.length === 0 && <p className="text-sm text-ink-mute">No activity yet.</p>}
            {logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-xs border border-line rounded-lg p-2">
                <span className="text-ink">{l.action.replace(/_/g, " ")}</span>
                <span className={l.status === "failed" ? "text-red-400" : "text-ink-mute"}>{l.status} · {new Date(l.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConnectorsPage() {
  const [data, setData] = useState(null);
  const [training, setTraining] = useState(null);
  const [viewingLogs, setViewingLogs] = useState(null);
  const [params, setParams] = useSearchParams();

  const load = useCallback(() => {
    api.get("/connectors").then((r) => setData(r.data)).catch(() => toast.error("Failed to load connectors"));
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (params.get("connected")) { toast.success("Account connected"); setParams({}, { replace: true }); load(); }
    if (params.get("error")) { toast.error("Connection failed or cancelled"); setParams({}, { replace: true }); }
  }, [params, setParams, load]);

  const accByProvider = useMemo(() => {
    const m = {};
    (data?.accounts || []).forEach((a) => { if (a.connection_status === "connected") m[a.provider] = a; });
    return m;
  }, [data]);

  const grouped = useMemo(() => {
    const g = {};
    (data?.registry || []).forEach((p) => { (g[p.category] ||= []).push(p); });
    return g;
  }, [data]);

  const connect = async (p) => {
    if (!p.oauth_start) return;
    try {
      // `oauth_start` is an absolute backend path (e.g. "/api/oauth/m365/login").
      // The axios client already prefixes baseURL with "/api", so strip the
      // leading "/api" here to avoid requesting "/api/api/...".
      const startPath = p.oauth_start.replace(/^\/api(?=\/)/, "");
      const { data: d } = await api.get(startPath);
      window.location.href = d.url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start connection");
    }
  };

  const disconnect = async (acc) => {
    try { await api.post(`/connectors/accounts/${acc.id}/disconnect`); toast.success("Disconnected"); load(); }
    catch { toast.error("Failed to disconnect"); }
  };

  if (!data) return <div className="min-h-screen bg-bg flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-ai" /></div>;

  return (
    <div className="min-h-screen bg-bg text-ink px-5 pt-16 pb-8 md:px-10" data-testid="connectors-page">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <Plug className="w-6 h-6 text-ai" />
          <h1 className="text-2xl font-bold">Connectors</h1>
        </div>
        <p className="text-sm text-ink-dim mb-2">Connect your business tools so your AI employees can learn your style and workflows — safely.</p>
        <div className="inline-flex items-center gap-2 text-xs text-ink-dim bg-surface border border-line rounded-full px-3 py-1 mb-6">
          <Lock className="w-3 h-3 text-emerald-400" /> Connect with OAuth. Never share your password with TeamNest.
        </div>

        {Object.entries(grouped).map(([cat, providers]) => {
          const CatIcon = CAT_ICON[cat] || Plug;
          return (
            <section key={cat} className="mb-8">
              <h2 className="text-sm font-bold text-ink mb-3 flex items-center gap-2"><CatIcon className="w-4 h-4 text-ai" /> {cat}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {providers.map((p) => {
                  const acc = accByProvider[p.provider];
                  return (
                    <div key={p.provider} data-testid={`connector-${p.provider}`}
                      className="rounded-2xl border border-line bg-surface p-4">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <div className="font-semibold text-ink flex items-center gap-2">
                            {p.name}
                            {acc ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" /> Connected</span>
                            ) : !p.live ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-ink-mute">Needs setup</span>
                            ) : null}
                          </div>
                          <p className="text-xs text-ink-dim mt-1 line-clamp-2">{p.desc}</p>
                          {acc && (
                            <div className="text-xs text-ink-mute mt-2 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-emerald-400" /> {acc.provider_account_email} · Read-only style analysis
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-3">
                        {acc ? (
                          <>
                            {p.supports_style_training && (
                              <button onClick={() => setTraining(acc)} data-testid={`train-${p.provider}`}
                                className="text-xs px-3 py-1.5 rounded-lg bg-ai text-black font-semibold flex items-center gap-1">
                                <Sparkles className="w-3.5 h-3.5" /> Train AI employee
                              </button>
                            )}
                            <button onClick={() => setViewingLogs(acc)} data-testid={`logs-${p.provider}`}
                              className="text-xs px-3 py-1.5 rounded-lg border border-line text-ink-dim hover:text-ink">Logs</button>
                            <button onClick={() => disconnect(acc)} data-testid={`disconnect-${p.provider}`}
                              className="text-xs px-3 py-1.5 rounded-lg border border-line text-ink-dim hover:text-red-400 hover:border-red-400/40">Disconnect</button>
                          </>
                        ) : p.live ? (
                          <button onClick={() => connect(p)} data-testid={`connect-${p.provider}`}
                            className="text-xs px-3 py-1.5 rounded-lg bg-ai text-black font-semibold flex items-center gap-1">
                            <Plug className="w-3.5 h-3.5" /> Connect
                          </button>
                        ) : (
                          <button disabled data-testid={`connect-${p.provider}`}
                            className="text-xs px-3 py-1.5 rounded-lg border border-line text-ink-mute opacity-60 cursor-not-allowed">Coming soon</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {training && <TrainModal account={training} onClose={() => { setTraining(null); load(); }} />}
      {viewingLogs && <LogsModal account={viewingLogs} onClose={() => setViewingLogs(null)} />}
    </div>
  );
}
