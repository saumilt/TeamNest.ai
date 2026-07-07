import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  Calculator,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  ListChecks,
  HelpCircle,
  Sparkles,
  Trash2,
  RefreshCcw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import PlaidConnect from "@/components/PlaidConnect";

const ACCOUNTS = [
  "Advertising & Marketing", "Office Supplies", "Travel", "Meals & Entertainment",
  "Software & Subscriptions", "Professional Fees", "Rent", "Utilities",
  "Repairs & Maintenance", "Payroll Expense", "Bank Fees", "Insurance",
  "Telephone & Internet", "Inventory Purchases", "Owner Draw", "Transfer",
  "Sales Income", "Refund", "Other", "Suspense",
];

const STATUS_BADGE = {
  imported: { label: "Imported", className: "bg-zinc-500/15 text-zinc-300" },
  auto_matched: { label: "Auto-matched", className: "bg-emerald-500/15 text-emerald-300" },
  suggested_category: { label: "Suggested", className: "bg-amber-500/15 text-amber-300" },
  suspense: { label: "Suspense", className: "bg-red-500/15 text-red-300" },
  approved: { label: "Approved", className: "bg-brand-tint text-brand" },
  synced: { label: "Synced to QB (mock)", className: "bg-emerald-500/15 text-emerald-300" },
};

export default function Bookkeeper() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [statements, setStatements] = useState([]);
  const [openStatement, setOpenStatement] = useState(null);
  const [activeTab, setActiveTab] = useState("statements"); // statements | rules | reconcile
  const [qboStatus, setQboStatus] = useState({ connected: false });
  const [syncing, setSyncing] = useState(false);

  const loadDashboard = async () => {
    try {
      const { data } = await api.get("/bookkeeper/dashboard");
      setDashboard(data);
      setStatements(data.recent_statements || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load bookkeeper");
    }
    try {
      const { data } = await api.get("/qbo/status");
      setQboStatus(data);
    } catch (err) {
      // /qbo/status is non-critical (returns 404 if no connection). Log and continue.
      if (err?.response?.status && err.response.status !== 404) {
        console.warn("[bookkeeper] qbo status check failed:", err.message);
      }
    }
  };

  useEffect(() => {
    loadDashboard();
    // Handle the QBO connect redirect (?qbo=connected)
    if (window.location.search.includes("qbo=connected")) {
      toast.success("QuickBooks connected!");
      window.history.replaceState({}, "", "/bookkeeper");
    }
  }, []);

  const connectQbo = async () => {
    try {
      const { data } = await api.get("/qbo/auth");
      window.location.href = data.authorization_url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to start QuickBooks connection");
    }
  };

  const disconnectQbo = async () => {
    if (!window.confirm("Disconnect QuickBooks? Pending sync entries will stay queued.")) return;
    try {
      await api.post("/qbo/disconnect");
      toast.success("QuickBooks disconnected");
      loadDashboard();
    } catch (e) {
      toast.error("Disconnect failed");
    }
  };

  const syncToQbo = async () => {
    if (!qboStatus.connected) {
      toast.error("Connect QuickBooks first.");
      return;
    }
    setSyncing(true);
    try {
      const { data } = await api.post("/qbo/sync-pending");
      toast.success(`Pushed ${data.pushed} entries to QuickBooks · failed: ${data.failed?.length || 0}`);
      loadDashboard();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg pb-12">
      <header className="border-b border-hairline bg-gradient-to-b from-brand-tint/20 to-transparent">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-7">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-brand mb-2">
                <Calculator className="w-3.5 h-3.5" /> AI QuickBooks Bookkeeper
              </div>
              <h1 className="text-2xl md:text-4xl font-semibold tracking-tight">
                Upload a statement. Approve the work. Sync to QuickBooks.
              </h1>
              <p className="text-ink-dim mt-2 max-w-2xl text-[13px]">
                CSV, PDF, OFX, or QBO statements. AI categorizes every row, asks your team
                about suspense items in chat, and pushes approved entries to QuickBooks
                Online. No write-back without human approval.
              </p>
              {qboStatus.connected && qboStatus.env_mismatch && (
                <div
                  data-testid="qbo-env-mismatch-warning"
                  className="mt-3 text-[12px] px-3 py-2 rounded-md border border-amber-400/40 bg-amber-400/5 text-amber-200"
                >
                  Your QuickBooks connection was made against{" "}
                  <strong>{qboStatus.environment}</strong>, but the server is now on{" "}
                  <strong>{qboStatus.server_environment}</strong>. Disconnect and reconnect to
                  refresh your tokens.
                </div>
              )}
            </div>
            <div className="flex items-center gap-2" data-testid="bk-qbo-control">
              {qboStatus.connected ? (
                <>
                  <div className="text-right">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-300">
                      ✓ Connected
                    </div>
                    <div className="text-[10px] text-ink-dim">
                      realm {qboStatus.realm_id?.slice(-6)} · {qboStatus.environment}
                    </div>
                  </div>
                  <button
                    onClick={syncToQbo}
                    disabled={syncing}
                    data-testid="bk-qbo-sync"
                    className="h-9 px-3 rounded-md bg-emerald-500 text-black hover:bg-emerald-400 font-mono uppercase text-[11px] tracking-widest"
                  >
                    {syncing ? "Pushing…" : "Push pending"}
                  </button>
                  <button
                    onClick={disconnectQbo}
                    data-testid="bk-qbo-disconnect"
                    className="h-9 px-2 rounded-md border border-hairline text-ink-dim hover:bg-white/5 font-mono uppercase text-[10px] tracking-widest"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={connectQbo}
                  data-testid="bk-qbo-connect"
                  className="h-9 px-3 rounded-md bg-brand text-black hover:bg-brand-deep font-mono uppercase text-[11px] tracking-widest"
                >
                  Connect QuickBooks
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6 space-y-6">
        {/* Dashboard tiles */}
        {dashboard && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="bk-dashboard">
            <Tile label="Statements" value={dashboard.statements_count} icon={FileSpreadsheet} />
            <Tile label="Auto-matched" value={dashboard.auto_matched} icon={CheckCircle2} tone="emerald" />
            <Tile label="Suggested" value={dashboard.needs_review} icon={Sparkles} tone="amber" />
            <Tile label="Suspense" value={dashboard.suspense} icon={AlertTriangle} tone="red" />
            <Tile label="Pending QB sync" value={dashboard.pending_sync} icon={Clock} tone="brand" />
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-hairline">
          {["statements", "rules", "reconcile"].map((t) => (
            <button
              key={t}
              data-testid={`bk-tab-${t}`}
              onClick={() => setActiveTab(t)}
              className={`px-3 py-2 text-[12px] font-mono uppercase tracking-widest border-b-2 -mb-px ${
                activeTab === t ? "border-brand text-brand" : "border-transparent text-ink-dim hover:text-ink"
              }`}
            >
              {t === "statements" && "Statements"}
              {t === "rules" && "Rules"}
              {t === "reconcile" && "Reconcile"}
            </button>
          ))}
        </div>

        {activeTab === "statements" && (
          <StatementsTab
            statements={statements}
            onUploaded={() => loadDashboard()}
            openStatement={openStatement}
            setOpenStatement={setOpenStatement}
            onRefresh={loadDashboard}
            currentUser={user}
          />
        )}
        {activeTab === "rules" && <RulesTab />}
        {activeTab === "reconcile" && <ReconcileTab />}
      </div>
    </div>
  );
}

function Tile({ label, value, icon: Icon, tone = "default" }) {
  const tones = {
    default: "text-ink",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    red: "text-red-300",
    brand: "text-brand",
  };
  return (
    <div className="border border-hairline rounded-card bg-surface-1 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-ink-dim">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-2xl font-semibold mt-1 ${tones[tone]}`}>{value ?? 0}</div>
    </div>
  );
}

function StatementsTab({ statements, onUploaded, openStatement, setOpenStatement, onRefresh, currentUser }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [accountName, setAccountName] = useState("Chase Business");

  const handleUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.toLowerCase().split(".").pop();
    if (!["csv", "pdf", "ofx", "qbo"].includes(ext)) {
      toast.error("Supported formats: CSV, PDF, OFX, QBO");
      return;
    }
    const form = new FormData();
    form.append("file", f);
    setUploading(true);
    try {
      const { data } = await api.post(
        `/bookkeeper/statements?account_name=${encodeURIComponent(accountName)}&statement_type=bank`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      toast.success(`Imported ${data.statement.row_count} rows`);
      onUploaded();
      // Auto-open the newly uploaded statement.
      const { data: detail } = await api.get(`/bookkeeper/statements/${data.statement.id}`);
      setOpenStatement(detail);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-5" data-testid="bk-statements-tab">
      {/* Upload */}
      <div className="border border-hairline rounded-card bg-surface-1 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <FileSpreadsheet className="w-5 h-5 text-brand" />
          <div className="flex-1 min-w-[200px]">
            <div className="text-[13px] font-semibold">Upload a CSV statement</div>
            <div className="text-[11px] text-ink-dim">
              Format: <code className="text-ink">Date, Description, Amount, Balance</code>.
              First column auto-detected.
            </div>
          </div>
          <input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Account name (e.g. Chase Business)"
            className="h-9 bg-surface-2 border border-hairline rounded-md px-3 text-[12px] w-56"
            data-testid="bk-account-name"
          />
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleUpload}
            data-testid="bk-file-input"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            data-testid="bk-upload-btn"
            className="h-9 px-3 rounded-md bg-brand text-black hover:bg-brand-deep font-mono uppercase text-[11px] tracking-widest inline-flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading…" : "Upload CSV"}
          </button>
        </div>
      </div>

      <PlaidConnect onStatementsImported={onRefresh} />

      {/* List */}
      <div className="border border-hairline rounded-card bg-surface-1 divide-y divide-hairline">
        {(statements || []).length === 0 && (
          <div className="p-6 text-center text-[12px] text-ink-dim">
            No statements yet. Upload your first one above.
          </div>
        )}
        {statements.map((s) => (
          <div
            key={s.id}
            data-testid={`bk-statement-${s.id}`}
            className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02]"
          >
            <FileSpreadsheet className="w-4 h-4 text-ink-dim shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium truncate">{s.filename}</div>
              <div className="text-[11px] text-ink-dim">
                {s.account_name} · {s.row_count} rows · uploaded {new Date(s.created_at).toLocaleString()}
              </div>
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest">
              {s.status === "imported" && <span className="text-zinc-300">Not categorized</span>}
              {s.status === "partially_reviewed" && (
                <span className="text-amber-300">
                  {s.suspense_count || 0} suspense
                </span>
              )}
              {s.status === "categorized" && <span className="text-emerald-300">Categorized</span>}
            </div>
            <button
              data-testid={`bk-open-statement-${s.id}`}
              onClick={async () => {
                const { data } = await api.get(`/bookkeeper/statements/${s.id}`);
                setOpenStatement(data);
              }}
              className="h-8 px-3 rounded-md border border-hairline hover:bg-white/5 text-[11px] font-mono uppercase tracking-widest inline-flex items-center gap-1"
            >
              Open <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {openStatement && (
        <StatementDetail
          stmt={openStatement.statement}
          txs={openStatement.transactions}
          onClose={() => setOpenStatement(null)}
          onChanged={onRefresh}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}

function StatementDetail({ stmt, txs, onClose, onChanged, currentUser }) {
  const [transactions, setTransactions] = useState(txs);
  const [categorizing, setCategorizing] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [chats, setChats] = useState([]);
  const [chatId, setChatId] = useState("");

  useEffect(() => {
    setTransactions(txs);
  }, [txs]);

  useEffect(() => {
    api.get("/chats").then(({ data }) => {
      const groups = (data || []).filter((c) => c.type === "group");
      setChats(groups);
      if (groups.length > 0) setChatId(groups[0].id);
    });
  }, []);

  const reload = async () => {
    const { data } = await api.get(`/bookkeeper/statements/${stmt.id}`);
    setTransactions(data.transactions);
    onChanged();
  };

  const categorize = async () => {
    setCategorizing(true);
    try {
      const { data } = await api.post(`/bookkeeper/statements/${stmt.id}/categorize`, {
        statement_id: stmt.id,
        chat_id: chatId || null,
      });
      toast.success(
        `Categorized — auto: ${data.auto_matched}, suggested: ${data.suggested}, suspense: ${data.suspense}. ${data.credits_used} credits used.`
      );
      await reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Categorize failed");
    } finally {
      setCategorizing(false);
    }
  };

  const updateTx = async (txId, category, opts = {}) => {
    try {
      await api.patch(`/bookkeeper/transactions/${txId}`, {
        category,
        create_rule: !!opts.createRule,
      });
      toast.success(opts.createRule ? "Approved + rule saved" : "Approved");
      await reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    }
  };

  const approveSync = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.error("Select at least one approved transaction to sync.");
      return;
    }
    try {
      const { data } = await api.post("/bookkeeper/transactions/approve-sync", {
        transaction_ids: ids,
      });
      toast.success(`${data.approved} entries queued for QuickBooks (mock). ${data.note}`);
      setSelected(new Set());
      await reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Sync failed");
    }
  };

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const approvedIds = transactions.filter((t) => t.status === "approved").map((t) => t.id);
  const selectAllApproved = () => setSelected(new Set(approvedIds));

  return (
    <div
      data-testid="bk-statement-detail"
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4"
    >
      <div className="bg-bg border border-hairline rounded-card max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-hairline flex items-center gap-3">
          <FileSpreadsheet className="w-5 h-5 text-brand" />
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold truncate">{stmt.filename}</div>
            <div className="text-[11px] text-ink-dim">
              {stmt.account_name} · {stmt.row_count} rows · status: {stmt.status}
            </div>
          </div>
          <select
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            data-testid="bk-suspense-chat-select"
            className="h-9 bg-surface-2 border border-hairline rounded-md px-2 text-[12px]"
          >
            <option value="">Ask in chat… (optional)</option>
            {chats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={categorize}
            disabled={categorizing}
            data-testid="bk-categorize-btn"
            className="h-9 px-3 rounded-md bg-brand text-black hover:bg-brand-deep font-mono uppercase text-[11px] tracking-widest inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" /> {categorizing ? "Categorizing…" : "Categorize with AI"}
          </button>
          <button
            onClick={onClose}
            className="h-9 px-3 rounded-md border border-hairline hover:bg-white/5 text-[11px] font-mono uppercase tracking-widest"
          >
            Close
          </button>
        </div>

        {/* Selection toolbar */}
        <div className="px-5 py-2 border-b border-hairline flex items-center gap-3 text-[11px]">
          <span className="text-ink-dim">{selected.size} selected</span>
          <button
            onClick={selectAllApproved}
            className="text-brand hover:underline"
            data-testid="bk-select-approved"
          >
            Select all approved ({approvedIds.length})
          </button>
          <button
            data-testid="bk-approve-sync-btn"
            onClick={approveSync}
            disabled={selected.size === 0}
            className="ml-auto h-8 px-3 rounded-md bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-40 font-mono uppercase text-[10px] tracking-widest inline-flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Approve & sync to QuickBooks
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-surface-2/50 sticky top-0">
              <tr className="text-left text-ink-dim font-mono uppercase tracking-widest text-[10px]">
                <th className="px-3 py-2 w-10"></th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Confidence</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const badge = STATUS_BADGE[t.status] || STATUS_BADGE.imported;
                const isApproved = t.status === "approved" || t.status === "synced";
                return (
                  <tr key={t.id} className="border-t border-hairline hover:bg-white/[0.02]" data-testid={`bk-tx-${t.id}`}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        disabled={!isApproved}
                        checked={selected.has(t.id)}
                        onChange={() => toggleSelected(t.id)}
                        data-testid={`bk-tx-select-${t.id}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-dim">{t.date}</td>
                    <td className="px-3 py-2 max-w-xs truncate">{t.description}</td>
                    <td className={`px-3 py-2 text-right font-mono ${t.amount < 0 ? "text-emerald-300" : "text-ink"}`}>
                      ${Math.abs(t.amount).toFixed(2)}
                      {t.amount < 0 ? " cr" : ""}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={t.suggested_category || "Suspense"}
                        onChange={(e) => updateTx(t.id, e.target.value)}
                        className="bg-surface-2 border border-hairline rounded-sm text-[11px] px-1 py-0.5"
                        data-testid={`bk-tx-category-${t.id}`}
                      >
                        {ACCOUNTS.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">
                      {t.confidence != null ? `${t.confidence}%` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {!isApproved && t.suggested_category && (
                        <button
                          onClick={() => updateTx(t.id, t.suggested_category, { createRule: true })}
                          className="text-[10px] font-mono uppercase tracking-widest text-brand hover:underline"
                          data-testid={`bk-approve-rule-${t.id}`}
                        >
                          Approve + remember
                        </button>
                      )}
                      {isApproved && (
                        <span className="text-[10px] text-emerald-300 font-mono uppercase tracking-widest">
                          ✓ Approved
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RulesTab() {
  const [rules, setRules] = useState([]);
  const load = async () => {
    try {
      const { data } = await api.get("/bookkeeper/rules");
      setRules(data.rules || []);
    } catch {
      toast.error("Failed to load rules");
    }
  };
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!window.confirm("Delete this rule?")) return;
    await api.delete(`/bookkeeper/rules/${id}`);
    toast.success("Rule deleted");
    load();
  };

  return (
    <div className="border border-hairline rounded-card bg-surface-1 divide-y divide-hairline" data-testid="bk-rules-tab">
      <div className="px-4 py-3 text-[12px] text-ink-dim flex items-center gap-2">
        <ListChecks className="w-4 h-4" />
        Rules created from "Approve + remember". Future transactions matching the
        pattern are auto-categorized without an AI call (saves credits).
      </div>
      {rules.length === 0 && (
        <div className="p-6 text-center text-[12px] text-ink-dim">No rules yet. Approve a few transactions to start saving credits.</div>
      )}
      {rules.map((r) => (
        <div key={r.id} className="px-4 py-3 flex items-center gap-3" data-testid={`bk-rule-${r.id}`}>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium">{r.name}</div>
            <div className="text-[11px] text-ink-dim">
              Pattern: <code className="text-ink">{r.merchant_pattern}</code> · → {r.category} · {r.confidence}% confidence
            </div>
          </div>
          <button onClick={() => del(r.id)} className="text-ink-dim hover:text-tn-red" title="Delete rule">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ReconcileTab() {
  const [form, setForm] = useState({
    account_name: "Chase Business",
    period_start: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    period_end: new Date().toISOString().slice(0, 10),
    statement_beginning_balance: 0,
    statement_ending_balance: 0,
  });
  const [recs, setRecs] = useState([]);
  const load = async () => {
    try {
      const { data } = await api.get("/bookkeeper/reconciliations");
      setRecs(data.reconciliations || []);
    } catch {
      toast.error("Failed to load reconciliations");
    }
  };
  useEffect(() => { load(); }, []);

  const run = async () => {
    try {
      await api.post("/bookkeeper/reconcile", {
        ...form,
        statement_beginning_balance: Number(form.statement_beginning_balance),
        statement_ending_balance: Number(form.statement_ending_balance),
      });
      toast.success("Reconciliation calculated");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Reconcile failed");
    }
  };

  return (
    <div className="space-y-5" data-testid="bk-reconcile-tab">
      <div className="border border-hairline rounded-card bg-surface-1 p-4 space-y-3">
        <div className="text-[13px] font-semibold flex items-center gap-2">
          <RefreshCcw className="w-4 h-4 text-brand" /> Start a reconciliation
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input
            value={form.account_name}
            onChange={(e) => setForm({ ...form, account_name: e.target.value })}
            placeholder="Account"
            className="h-9 bg-surface-2 border border-hairline rounded-md px-2 text-[12px]"
          />
          <input
            type="date"
            value={form.period_start}
            onChange={(e) => setForm({ ...form, period_start: e.target.value })}
            className="h-9 bg-surface-2 border border-hairline rounded-md px-2 text-[12px]"
          />
          <input
            type="date"
            value={form.period_end}
            onChange={(e) => setForm({ ...form, period_end: e.target.value })}
            className="h-9 bg-surface-2 border border-hairline rounded-md px-2 text-[12px]"
          />
          <input
            type="number"
            step="0.01"
            value={form.statement_beginning_balance}
            onChange={(e) => setForm({ ...form, statement_beginning_balance: e.target.value })}
            placeholder="Statement beginning"
            className="h-9 bg-surface-2 border border-hairline rounded-md px-2 text-[12px]"
          />
          <input
            type="number"
            step="0.01"
            value={form.statement_ending_balance}
            onChange={(e) => setForm({ ...form, statement_ending_balance: e.target.value })}
            placeholder="Statement ending"
            className="h-9 bg-surface-2 border border-hairline rounded-md px-2 text-[12px]"
          />
        </div>
        <button
          onClick={run}
          data-testid="bk-reconcile-run"
          className="h-9 px-4 rounded-md bg-brand text-black hover:bg-brand-deep font-mono uppercase text-[11px] tracking-widest"
        >
          Calculate
        </button>
        <p className="text-[10px] text-ink-dim italic">
          AI Bookkeeper computes QuickBooks-side ending balance from approved transactions in the
          period. It will not mark a reconciliation as complete until you approve it.
        </p>
      </div>

      <div className="border border-hairline rounded-card bg-surface-1 divide-y divide-hairline">
        {recs.length === 0 && (
          <div className="p-6 text-center text-[12px] text-ink-dim">No reconciliations yet.</div>
        )}
        {recs.map((r) => (
          <div key={r.id} className="px-4 py-3 grid grid-cols-2 md:grid-cols-6 gap-2 text-[12px]" data-testid={`bk-rec-${r.id}`}>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-ink-dim">Account</div>
              <div>{r.account_name}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-ink-dim">Period</div>
              <div>{r.period_start} → {r.period_end}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-ink-dim">Stmt Ending</div>
              <div>${Number(r.statement_ending_balance).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-ink-dim">QB Calculated</div>
              <div>${Number(r.qb_calculated_ending_balance).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-ink-dim">Difference</div>
              <div className={Math.abs(r.difference) < 0.01 ? "text-emerald-300" : "text-amber-300"}>
                ${Number(r.difference).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-ink-dim">Status</div>
              <div className={r.ready_to_reconcile ? "text-emerald-300" : "text-amber-300"}>{r.status}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
