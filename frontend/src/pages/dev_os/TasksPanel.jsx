import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";

const STATUS_ORDER = ["backlog", "in_progress", "in_review", "done", "deployed"];
const STATUS_META = {
  backlog: { label: "Backlog", cls: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30" },
  in_progress: { label: "In progress", cls: "bg-amber-400/15 text-amber-300 ring-amber-400/30" },
  in_review: { label: "In review", cls: "bg-blue-500/15 text-blue-300 ring-blue-500/30" },
  done: { label: "Done", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  deployed: { label: "Deployed", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
};
const NEXT_STATUS = { backlog: "in_progress", in_progress: "in_review", in_review: "done" };

/** TasksPanel — simple flat task list for the Build Room's Tasks tab. */
export default function TasksPanel({ projectId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/dev-tasks?project_id=${projectId}`);
      setTasks(Array.isArray(data) ? data : []);
    } catch { setTasks([]); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || adding) return;
    setAdding(true);
    try {
      await api.post("/dev-tasks", { project_id: projectId, title: t });
      setTitle("");
      await load();
    } catch { toast.error("Could not add task"); }
    setAdding(false);
  };

  const advance = async (task) => {
    const next = NEXT_STATUS[task.status];
    if (!next) return;
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    try {
      await api.patch(`/dev-tasks/${task.id}`, { status: next });
    } catch {
      toast.error("Could not update task");
      load();
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-ink-mute text-[13px]" data-testid="ds-tasks-panel">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading tasks…
      </div>
    );
  }

  const grouped = STATUS_ORDER.map((s) => ({
    status: s,
    items: tasks.filter((t) => t.status === s),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="h-full overflow-y-auto p-4" data-testid="ds-tasks-panel">
      <form onSubmit={add} className="flex gap-2 mb-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task — e.g. 'Polish the checkout page'"
          data-testid="ds-task-input"
          className="flex-1 h-10 px-4 rounded-pill bg-surface-2 ring-1 ring-hairline focus:ring-amber-400/40 outline-none text-[13px] text-ink placeholder:text-ink-mute"
        />
        <button
          type="submit"
          disabled={adding || !title.trim()}
          data-testid="ds-task-add"
          className="h-10 px-4 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[13px] inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </form>

      {tasks.length === 0 && (
        <div className="text-[13px] text-ink-mute italic">
          No tasks yet. Add one above, or ask @devmanager in the chat — every build request becomes a task automatically.
        </div>
      )}

      {grouped.map((g) => (
        <div key={g.status} className="mb-5">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-mute mb-2">
            {STATUS_META[g.status].label} · {g.items.length}
          </div>
          <ul className="space-y-2">
            {g.items.map((t) => (
              <li
                key={t.id}
                data-testid="ds-task-row"
                className="rounded-xl bg-surface-2 ring-1 ring-hairline p-3 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink">{t.title}</div>
                  {t.description && (
                    <div className="text-[11px] text-ink-mute mt-0.5 line-clamp-2">{t.description}</div>
                  )}
                  <span className={`inline-flex mt-1.5 px-2 py-0.5 rounded-full text-[10px] ring-1 ${STATUS_META[t.status]?.cls || STATUS_META.backlog.cls}`}>
                    {STATUS_META[t.status]?.label || t.status}
                  </span>
                </div>
                {NEXT_STATUS[t.status] ? (
                  <button
                    type="button"
                    onClick={() => advance(t)}
                    data-testid="ds-task-advance"
                    title={`Move to ${STATUS_META[NEXT_STATUS[t.status]].label}`}
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-surface hover:bg-surface-3 text-ink-dim hover:text-ink ring-1 ring-hairline"
                  >
                    {STATUS_META[NEXT_STATUS[t.status]].label} <ArrowRight className="w-3 h-3" />
                  </button>
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
