import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import {
  Clock, ArrowLeft, CheckCircle2, AlertTriangle, Lightbulb, Sparkles, Phone, Mic, FileText, Gavel,
} from "lucide-react";
import { toast } from "sonner";

const TYPE_META = {
  decision: { color: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200", icon: Gavel, label: "Decision" },
  risk: { color: "border-red-400/40 bg-red-500/10 text-red-200", icon: AlertTriangle, label: "Risk" },
  assumption: { color: "border-amber-400/40 bg-amber-500/10 text-amber-200", icon: Lightbulb, label: "Assumption" },
  research: { color: "border-purple-400/40 bg-purple-500/10 text-purple-200", icon: Sparkles, label: "Research" },
  fact: { color: "border-blue-400/40 bg-blue-500/10 text-blue-200", icon: FileText, label: "Fact" },
  task: { color: "border-cyan-400/40 bg-cyan-500/10 text-cyan-200", icon: CheckCircle2, label: "Task" },
  note: { color: "border-white/10 bg-white/5 text-zinc-200", icon: FileText, label: "Note" },
};

const SOURCE_ICON = {
  ai_thread: Sparkles, ai_response: Sparkles, approval: CheckCircle2,
  call_summary: Phone, voice_note: Mic, smart_card: Lightbulb,
};

export default function ProjectMemoryTimeline() {
  const { folderId } = useParams();
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [pRes, mRes] = await Promise.all([
          api.get(`/folders/${folderId}`).catch(() => ({ data: null })),
          api.get(`/memory/timeline?project_folder_id=${folderId}&limit=200`),
        ]);
        setProject(pRes.data);
        setItems(mRes.data.items || []);
      } catch (e) {
        toast.error("Failed to load project memory");
      } finally {
        setLoading(false);
      }
    })();
  }, [folderId]);

  // Group by date (YYYY-MM-DD)
  const grouped = useMemo(() => {
    const out = new Map();
    for (const it of items) {
      const day = (it.created_at || "").slice(0, 10);
      if (!out.has(day)) out.set(day, []);
      out.get(day).push(it);
    }
    return Array.from(out.entries());
  }, [items]);

  return (
    <div className="min-h-[100dvh] bg-bg text-zinc-100 px-4 sm:px-8 py-6 max-w-3xl mx-auto" data-testid="project-memory-page">
      <button onClick={() => nav(-1)} className="text-zinc-400 hover:text-white text-sm mb-4 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
        <Clock className="w-7 h-7 text-purple-300" />
        {project?.name || "Project"} — Memory Timeline
      </h1>
      <p className="text-sm text-zinc-400 mt-1 mb-6">
        The chronological story of this project: decisions, risks, research, calls.
      </p>

      {loading ? (
        <div className="text-zinc-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-sm p-8 text-center text-zinc-500" data-testid="project-memory-empty">
          No memory captured yet for this project. Approve an AI answer, complete a call, or run smart-card extraction.
        </div>
      ) : (
        <div className="relative pl-6">
          <div className="absolute left-2 top-2 bottom-2 w-px bg-white/10" />
          {grouped.map(([day, dayItems]) => (
            <div key={day} className="mb-8" data-testid={`timeline-day-${day}`}>
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">{day}</div>
              <div className="space-y-3">
                {dayItems.map((it) => <TimelineItem key={it.id} item={it} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineItem({ item }) {
  const meta = TYPE_META[item.memory_type] || TYPE_META.note;
  const Icon = meta.icon;
  const SrcIcon = SOURCE_ICON[item.source_type] || Lightbulb;
  return (
    <div className="relative" data-testid={`timeline-item-${item.id}`}>
      <div className="absolute -left-4 top-3 w-2 h-2 rounded-full bg-purple-400" />
      <div className={`border rounded-sm p-3 ${meta.color}`}>
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-3.5 h-3.5" />
          <div className="text-[10px] font-mono uppercase tracking-widest opacity-70">{meta.label}</div>
          <div className="flex-1" />
          <SrcIcon className="w-3 h-3 opacity-50" />
          <div className="text-[10px] font-mono uppercase tracking-widest opacity-50">{item.source_type?.replace("_", " ")}</div>
        </div>
        <div className="font-medium text-white text-sm">{item.title}</div>
        <div className="text-xs text-zinc-300 mt-1 line-clamp-3">{item.summary || item.content}</div>
      </div>
    </div>
  );
}
