import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Brain, Search, FileText, MessageSquare, CheckCircle2, AlertTriangle,
  Lightbulb, Sparkles, Phone, Mic, Plus, Archive, Trash2, RefreshCw, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const SOURCE_ICONS = {
  ai_thread: Sparkles,
  ai_response: Sparkles,
  approval: CheckCircle2,
  call_summary: Phone,
  voice_note: Mic,
  task: FileText,
  message: MessageSquare,
  card: Lightbulb,
  smart_card: Wand2,
};

const TYPE_COLORS = {
  decision: "text-emerald-300 bg-emerald-500/10 border-emerald-400/30",
  risk: "text-red-300 bg-red-500/10 border-red-400/30",
  assumption: "text-amber-300 bg-amber-500/10 border-amber-400/30",
  research: "text-purple-300 bg-purple-500/10 border-purple-400/30",
  fact: "text-blue-300 bg-blue-500/10 border-blue-400/30",
  task: "text-cyan-300 bg-cyan-500/10 border-cyan-400/30",
  note: "text-zinc-300 bg-white/5 border-white/10",
};

export default function MemoryPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCard, setShowCard] = useState(false);

  const load = async (query = "") => {
    setLoading(true);
    try {
      const url = query.trim()
        ? `/memory/search?q=${encodeURIComponent(query.trim())}&mode=workspace&limit=50`
        : `/memory/timeline?limit=50`;
      const { data } = await api.get(url);
      setItems(data.items || []);
    } catch (e) {
      console.warn("[memory] load failed", e);
      toast.error("Failed to load memory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onSearch = (e) => {
    e?.preventDefault();
    load(q);
  };

  const groups = useMemo(() => {
    const out = { decision: [], risk: [], assumption: [], research: [], note: [], task: [], fact: [] };
    for (const it of items) {
      const key = it.memory_type in out ? it.memory_type : "note";
      out[key].push(it);
    }
    return out;
  }, [items]);

  const backfill = async () => {
    try {
      const { data } = await api.post("/memory/backfill");
      toast.success(`Backfilled: ${JSON.stringify(data.counts || {})}`);
      load(q);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Backfill failed";
      toast.error(msg);
    }
  };

  const extractSmartCards = async () => {
    toast.info("Extracting smart cards... this may take 30-60 seconds.");
    try {
      const { data } = await api.post("/memory/extract-smart-cards");
      const c = data.counts || {};
      toast.success(`Extracted ${c.cards_created || 0} cards from ${(c.approval || 0) + (c.call_summary || 0)} sources`);
      load(q);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Smart card extraction failed";
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-bg text-zinc-100 px-4 sm:px-8 py-6 max-w-6xl mx-auto" data-testid="memory-page">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Brain className="w-7 h-7 text-purple-300" />
            Workspace Memory
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Decisions, research, risks, and approvals your team has captured.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={backfill}
            data-testid="memory-backfill-btn"
            className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Backfill
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={extractSmartCards}
            data-testid="memory-extract-smart-btn"
            className="border-purple-400/40 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20 rounded-sm"
            title="Run Claude to extract sharper Decision/Risk/Assumption cards from approved decisions"
          >
            <Wand2 className="w-3.5 h-3.5 mr-1.5" /> Extract smart cards
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCard(true)}
            data-testid="memory-new-card-btn"
            className="bg-purple-500 hover:bg-purple-400 text-white rounded-sm"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New card
          </Button>
        </div>
      </div>

      <form onSubmit={onSearch} className="mb-6 flex gap-2" data-testid="memory-search-form">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            data-testid="memory-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Search memory: "frisco lease rates", "approved Texas market"...'
            className="pl-9 bg-[#0a0a0a] border-white/10 rounded-sm h-10"
          />
        </div>
        <Button type="submit" disabled={loading} className="rounded-sm bg-yellow-500 text-black hover:bg-yellow-400">
          {loading ? "Searching…" : "Search"}
        </Button>
      </form>

      {items.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-sm p-8 text-center text-zinc-500" data-testid="memory-empty">
          {loading ? "Loading…" : "No memory yet. Approve answers, complete calls, or click 'Backfill' to seed from existing history."}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groups).map(([type, group]) => group.length > 0 && (
            <section key={type} data-testid={`memory-group-${type}`}>
              <div className={`inline-block px-2.5 py-0.5 mb-3 text-[10px] font-mono uppercase tracking-widest rounded-sm border ${TYPE_COLORS[type] || TYPE_COLORS.note}`}>
                {type} · {group.length}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.map((it) => <MemoryCard key={it.id} item={it} onRefresh={() => load(q)} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {showCard && <NewCardDialog onClose={() => setShowCard(false)} onCreated={() => { setShowCard(false); load(q); }} />}
    </div>
  );
}

function MemoryCard({ item, onRefresh }) {
  const Icon = SOURCE_ICONS[item.source_type] || Lightbulb;
  const date = (item.created_at || "").slice(0, 10);
  const colorCls = TYPE_COLORS[item.memory_type] || TYPE_COLORS.note;
  const isOutdated = item.status === "outdated";

  const archive = async () => {
    try {
      await api.patch(`/memory/${item.id}`, { status: "archived" });
      toast.success("Archived");
      onRefresh?.();
    } catch { toast.error("Failed to archive"); }
  };
  const markOutdated = async () => {
    try {
      await api.patch(`/memory/${item.id}`, { status: isOutdated ? "active" : "outdated" });
      toast.success(isOutdated ? "Restored" : "Marked outdated");
      onRefresh?.();
    } catch { toast.error("Update failed"); }
  };
  const del = async () => {
    if (!window.confirm("Delete this memory item?")) return;
    try {
      await api.delete(`/memory/${item.id}`);
      toast.success("Deleted");
      onRefresh?.();
    } catch (e) {
      const msg = e?.response?.data?.detail || "Delete failed";
      toast.error(msg);
    }
  };

  return (
    <div
      data-testid={`memory-item-${item.id}`}
      className={`border ${colorCls} rounded-sm p-3 hover:bg-white/5 transition-colors group ${isOutdated ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Icon className="w-3.5 h-3.5 shrink-0" />
          <div className="text-[11px] font-mono uppercase tracking-widest opacity-70 truncate">
            {item.source_type.replace("_", " ")} · {date}
          </div>
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button onClick={markOutdated} title={isOutdated ? "Restore" : "Mark outdated"} className="text-zinc-400 hover:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" />
          </button>
          <button onClick={archive} title="Archive" className="text-zinc-400 hover:text-zinc-200">
            <Archive className="w-3.5 h-3.5" />
          </button>
          <button onClick={del} title="Delete" className="text-zinc-400 hover:text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="font-semibold text-sm text-white mb-1 leading-snug" data-testid="memory-item-title">
        {item.title}
      </div>
      <div className="text-xs text-zinc-300 leading-relaxed line-clamp-3">
        {item.summary || item.content}
      </div>
    </div>
  );
}

function NewCardDialog({ onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [memoryType, setMemoryType] = useState("decision");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    try {
      await api.post(
        `/memory/cards?title=${encodeURIComponent(title)}&content=${encodeURIComponent(content)}&memory_type=${memoryType}&visibility=workspace`
      );
      toast.success("Card saved");
      onCreated?.();
    } catch {
      toast.error("Failed to save card");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-lg" data-testid="memory-new-card-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Lightbulb className="w-4 h-4 text-purple-300" />New memory card</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <div className="label-mono mb-1.5">TYPE</div>
            <Select value={memoryType} onValueChange={setMemoryType}>
              <SelectTrigger data-testid="memory-card-type" className="bg-[#121214] border-white/10 rounded-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#121214] border-white/10">
                <SelectItem value="decision">Decision</SelectItem>
                <SelectItem value="assumption">Assumption</SelectItem>
                <SelectItem value="risk">Risk</SelectItem>
                <SelectItem value="research">Research</SelectItem>
                <SelectItem value="fact">Fact</SelectItem>
                <SelectItem value="note">Note</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="label-mono mb-1.5">TITLE</div>
            <Input data-testid="memory-card-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Selected Frisco as launch market" className="bg-[#121214] border-white/10 rounded-sm" />
          </div>
          <div>
            <div className="label-mono mb-1.5">DETAIL</div>
            <Textarea data-testid="memory-card-content" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Reason, context, dates, people…" className="bg-[#121214] border-white/10 rounded-sm min-h-[120px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm">Cancel</Button>
          <Button data-testid="memory-card-save" onClick={save} disabled={busy || !title.trim() || !content.trim()} className="bg-purple-500 hover:bg-purple-400 text-white rounded-sm">
            {busy ? "Saving…" : "Save card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
