import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft, Loader2, Search, RefreshCw, Shield, FileText,
} from "lucide-react";
import { api } from "@/lib/api";
import AppBar from "@/components/ui-v2/AppBar";
import Pill from "@/components/ui-v2/Pill";

const ACTION_TONE = {
  "bug.created":            "red",
  "bug.advanced":           "amber",
  "memory.added":           "default",
  "release_notes.generated":"brand",
  "comment.converted":      "amber",
  "proposal.auto_approved": "green",
  "proposal.approved":      "green",
  "proposal.rejected":      "red",
  "build.started":          "ai",
  "build.completed":        "green",
};

/**
 * /dev-os/audit-log — immutable workspace-wide activity log.
 * Read-only view of dev_audit_logs. Filterable by action substring,
 * actor, and date range. No mutation API exposed.
 */
export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/dev-os/audit-log");
      setEntries(data.entries || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const actions = useMemo(() => {
    const set = new Set(entries.map((e) => e.action));
    return ["all", ...Array.from(set).sort()];
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        (e.action || "").toLowerCase().includes(q) ||
        (e.actor_id || "").toLowerCase().includes(q) ||
        JSON.stringify(e.meta || {}).toLowerCase().includes(q)
      );
    });
  }, [entries, query, actionFilter]);

  return (
    <div className="min-h-[100dvh] bg-bg text-ink" data-testid="audit-log-page">
      <AppBar
        left={
          <Link to="/dev-os" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5" data-testid="audit-back">
            <ChevronLeft className="w-5 h-5" />
          </Link>
        }
        center={
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand" />
            <div className="text-[15px] font-semibold">Audit log</div>
          </div>
        }
        right={
          <button
            type="button"
            onClick={load}
            data-testid="audit-refresh"
            className="h-9 px-3 rounded-full bg-surface-2 text-ink text-[12px] font-medium flex items-center gap-1.5 hover:bg-white/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        }
      />

      <div className="p-3 md:p-4 space-y-3">
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap" data-testid="audit-filters">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-mute" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search action, actor, or metadata…"
              data-testid="audit-search"
              className="w-full pl-9 pr-3 h-9 rounded-xl bg-surface border border-hairline text-[13px] focus:outline-none focus:ring-1 focus:ring-brand/40"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            data-testid="audit-action-filter"
            className="h-9 px-3 rounded-xl bg-surface border border-hairline text-[12px] font-mono focus:outline-none"
          >
            {actions.map((a) => (
              <option key={a} value={a}>{a === "all" ? `All actions (${entries.length})` : a}</option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2" data-testid="audit-stats">
          <StatTile label="Total events" value={entries.length} />
          <StatTile label="Showing" value={filtered.length} />
          <StatTile label="Unique actors" value={new Set(entries.map((e) => e.actor_id)).size} />
          <StatTile label="Action types" value={actions.length - 1} />
          <StatTile label="Last 24h" value={entries.filter((e) => {
            const ts = new Date(e.created_at || 0).getTime();
            return Date.now() - ts < 86400000;
          }).length} />
        </div>

        {/* Table */}
        <div className="rounded-2xl bg-surface overflow-hidden" data-testid="audit-table-card">
          <div className="px-4 py-2.5 border-b border-hairline flex items-center gap-2">
            <FileText className="w-4 h-4 text-ink-mute" />
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink">
              Audit entries · immutable
            </div>
          </div>
          {loading ? (
            <div className="py-16 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-ink-dim" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-ink-mute">
              {entries.length === 0 ? "No audit events yet." : "No matches for current filters."}
            </div>
          ) : (
            <div className="divide-y divide-hairline">
              {filtered.map((e) => (
                <Row key={e.id} entry={e} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const tone = ACTION_TONE[entry.action] || "default";
  return (
    <div className="px-4 py-2.5 hover:bg-white/[0.02]" data-testid={`audit-row-${entry.id}`}>
      <div className="flex items-center gap-3 text-[12px]">
        <span className="text-ink-mute font-mono shrink-0 w-32 truncate" title={entry.created_at}>
          {(entry.created_at || "").replace("T", " ").slice(0, 19)}
        </span>
        <Pill tone={tone} size="sm">{entry.action}</Pill>
        <span className="text-ink-mute font-mono text-[11px] shrink-0">
          {(entry.actor_id || "").slice(0, 8)}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto text-[11px] text-ink-mute hover:text-ink font-mono"
          data-testid={`audit-toggle-${entry.id}`}
        >
          {expanded ? "Hide" : "Show"} meta
        </button>
      </div>
      {expanded && (
        <pre className="mt-2 text-[10px] font-mono bg-bg/40 rounded-lg p-2 text-ink-dim overflow-x-auto" data-testid={`audit-meta-${entry.id}`}>
          {JSON.stringify(entry.meta || {}, null, 2)}
        </pre>
      )}
    </div>
  );
}

function StatTile({ label, value }) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-mute">{label}</div>
      <div className="text-[18px] font-semibold text-ink tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
