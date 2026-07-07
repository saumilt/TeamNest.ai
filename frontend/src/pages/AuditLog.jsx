import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Shield, Filter } from "lucide-react";
import { toast } from "sonner";

const ACTION_COLORS = {
  "user.role_changed": "text-amber-300",
  "user.disabled": "text-red-300",
  "user.activated": "text-emerald-300",
  "approval.approved": "text-emerald-300",
  "approval.rejected": "text-red-300",
  "approval.needs_review": "text-amber-300",
  "decision.created": "text-yellow-300",
  "decision.status_changed": "text-yellow-300",
  "import.whatsapp": "text-purple-300",
};

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/audit-logs?limit=200${filter ? `&action=${filter}` : ""}`);
      setLogs(data.logs || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  return (
    <div className="min-h-[100dvh] bg-bg text-zinc-100 px-4 sm:px-8 py-6 max-w-5xl mx-auto" data-testid="audit-log-page">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Shield className="w-7 h-7 text-cyan-300" />
            Audit Log
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Workspace activity stream — role changes, approvals, decisions, imports, more.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-500" />
          <Input
            data-testid="audit-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter action: user.role_changed"
            className="bg-[#0a0a0a] border-white/10 rounded-sm w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-500">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-sm p-8 text-center text-zinc-500" data-testid="audit-empty">
          No audit events yet. Role changes, approvals, decisions, and imports will appear here.
        </div>
      ) : (
        <div className="border border-white/10 rounded-sm overflow-hidden" data-testid="audit-log-list">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              <tr>
                <th className="text-left px-3 py-2">When</th>
                <th className="text-left px-3 py-2">Actor</th>
                <th className="text-left px-3 py-2">Action</th>
                <th className="text-left px-3 py-2">Target</th>
                <th className="text-left px-3 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-white/5 hover:bg-white/[0.02]" data-testid={`audit-row-${l.id}`}>
                  <td className="px-3 py-2 text-[11px] text-zinc-400 font-mono">{(l.created_at || "").slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2 text-zinc-200">{l.actor_name || "system"}</td>
                  <td className={`px-3 py-2 font-mono text-xs ${ACTION_COLORS[l.action] || "text-zinc-300"}`}>{l.action}</td>
                  <td className="px-3 py-2 text-zinc-400 text-xs">{l.target_type ? `${l.target_type}/${(l.target_id || "").slice(0, 8)}` : "—"}</td>
                  <td className="px-3 py-2 text-zinc-500 text-[11px] font-mono">{l.meta ? truncate(JSON.stringify(l.meta), 80) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function truncate(s, n) { return s.length > n ? s.slice(0, n) + "…" : s; }
