import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import NewTaskDialog from "@/components/NewTaskDialog";
import TopActionBar from "@/components/TopActionBar";
import { ChevronDown, Clock, Plus, CheckSquare, Trash2, Undo2, X, Check } from "lucide-react";
import Avatar from "@/components/ui-v2/Avatar";
import SegmentedControl from "@/components/ui-v2/SegmentedControl";
import FAB from "@/components/ui-v2/FAB";
import EmptyState from "@/components/ui-v2/EmptyState";
import { toast } from "sonner";

/**
 * /tasks — kanban-style task board with collapsible sections.
 *
 * Per the v2 spec:
 *   - Sentence-case section headers + count badges (NO uppercase).
 *   - Status pill in card top-right (click to cycle status — no dropdown).
 *   - Priority dot (red high / amber medium / grey low).
 *   - Stacked assignees + due-date chip + linked-chat chip in card footer.
 *   - Mobile: vertical sections. Desktop: still vertical sections (not 5-col)
 *     because the new IA treats this as a phone-first list, not a Trello.
 */
const COLS = [
        { key: "todo", label: "To do" },
        { key: "in_progress", label: "In progress" },
        { key: "needs_review", label: "Needs review" },
        { key: "completed", label: "Done" },
        { key: "overdue", label: "Overdue" },
];

const SCOPE_OPTIONS = [
        { value: "all", label: "All" },
        { value: "mine", label: "Mine" },
        { value: "due_soon", label: "Due soon" },
];

const STATUS_NEXT = {
        todo: "in_progress",
        in_progress: "needs_review",
        needs_review: "completed",
        completed: "todo",
        overdue: "in_progress",
};

const STATUS_PILL = {
        todo:         { label: "To do",        bg: "bg-surface-3",      fg: "text-ink-dim" },
        in_progress:  { label: "In progress",  bg: "bg-brand-tint",     fg: "text-brand" },
        needs_review: { label: "Needs review", bg: "bg-ai-tint",        fg: "text-ai" },
        completed:    { label: "Done",         bg: "bg-tn-green/15",    fg: "text-tn-green" },
        overdue:      { label: "Overdue",      bg: "bg-tn-red/15",      fg: "text-tn-red" },
};

const PRIORITY_DOT = {
        urgent: "bg-tn-red",
        high:   "bg-tn-red",
        medium: "bg-brand",
        low:    "bg-ink-mute",
};

export default function Tasks() {
        const { user } = useAuth();
        const [tasks, setTasks] = useState([]);
        const [members, setMembers] = useState({});
        const [scope, setScope] = useState("all");
        const [statusFilter, setStatusFilter] = useState("active");
        const [showNew, setShowNew] = useState(false);
        const [collapsed, setCollapsed] = useState({ completed: true, overdue: false });
        const [busyId, setBusyId] = useState(null);

        const load = useCallback(() => {
                api.get(`/tasks?scope=${scope}&status_filter=${statusFilter}`).then(({ data }) => setTasks(data));
        }, [scope, statusFilter]);

        useEffect(() => {
                load();
        }, [load]);

        useEffect(() => {
                api.get("/workspace/members").then(({ data }) => {
                        const map = {};
                        data.forEach((m) => (map[m.id] = m));
                        setMembers(map);
                });
        }, []);

        const grouped = useMemo(() => {
                const g = {};
                COLS.forEach((c) => (g[c.key] = []));
                tasks.forEach((t) => {
                        const k = COLS.find((c) => c.key === t.status) ? t.status : "todo";
                        g[k].push(t);
                });
                return g;
        }, [tasks]);

        const stats = useMemo(() => {
                return {
                        todo: grouped.todo.length,
                        in_progress: grouped.in_progress.length,
                        done: grouped.completed.length,
                };
        }, [grouped]);

        const updateStatus = async (id, status) => {
                await api.patch(`/tasks/${id}`, { status });
                load();
        };

        const completeTask = async (id) => {
                setBusyId(id);
                try {
                        await api.patch(`/tasks/${id}`, { status: "completed" });
                        toast.success("Marked done");
                        load();
                } catch (e) {
                        toast.error("Couldn't mark done");
                } finally { setBusyId(null); }
        };

        const softDelete = async (id) => {
                setBusyId(id);
                try {
                        await api.delete(`/tasks/${id}`);
                        toast.success("Moved to Recently deleted", {
                                action: { label: "Undo", onClick: () => restoreTask(id) },
                                duration: 6000,
                        });
                        load();
                } catch (e) {
                        toast.error("Couldn't delete");
                } finally { setBusyId(null); }
        };

        const restoreTask = async (id) => {
                setBusyId(id);
                try {
                        await api.post(`/tasks/${id}/restore`);
                        toast.success("Restored");
                        load();
                } catch (e) {
                        toast.error("Couldn't restore");
                } finally { setBusyId(null); }
        };

        const purgeNow = async (id) => {
                if (!confirm("Delete this task permanently? It can't be undone.")) return;
                setBusyId(id);
                try {
                        await api.delete(`/tasks/${id}/purge`);
                        toast.success("Deleted permanently");
                        load();
                } catch (e) {
                        toast.error("Couldn't purge");
                } finally { setBusyId(null); }
        };

        const toggle = (key) => setCollapsed((s) => ({ ...s, [key]: !s[key] }));

        const totalCount = tasks.length;

        return (
                <div className="min-h-[100dvh] bg-bg pb-24 md:pb-8 text-ink">
                        <div className="px-4 md:px-8 pt-6">
                                <TopActionBar />
                        </div>
                        {/* Title */}
                        <div className="px-4 md:px-8 pt-8 md:pt-12 pb-4">
                                <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                                        <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.02em]">Tasks</h1>
                                        <div className="hidden md:flex">
                                                <button
                                                        data-testid="new-task-btn-desktop"
                                                        onClick={() => setShowNew(true)}
                                                        className="h-10 px-4 rounded-full bg-brand text-black font-semibold inline-flex items-center gap-1.5 hover:bg-brand-deep"
                                                >
                                                        <Plus className="w-4 h-4" /> New task
                                                </button>
                                        </div>
                                </div>
                                <p className="text-[13px] text-ink-dim">
                                        {stats.todo} to do · {stats.in_progress} in progress · {stats.done} done
                                </p>
                        </div>

                        {/* Status tabs: Active · Completed · Recently deleted (30d) */}
                        <div className="px-4 md:px-8 pb-2 flex items-center gap-1.5" data-testid="task-status-tabs">
                                {[
                                        { key: "active", label: "Active" },
                                        { key: "completed", label: "Completed" },
                                        { key: "deleted", label: "Recently deleted" },
                                ].map((s) => (
                                        <button
                                                key={s.key}
                                                onClick={() => setStatusFilter(s.key)}
                                                data-testid={`task-status-tab-${s.key}`}
                                                className={`px-3 h-8 text-[12px] font-medium rounded-full border transition-colors ${
                                                        statusFilter === s.key
                                                                ? "bg-brand text-black border-brand"
                                                                : "border-hairline text-ink-dim hover:text-ink hover:bg-white/5"
                                                }`}
                                        >
                                                {s.label}
                                        </button>
                                ))}
                                {statusFilter === "deleted" && (
                                        <span className="text-[10px] font-mono uppercase tracking-widest text-ink-mute ml-2">
                                                auto-purged after 30 days
                                        </span>
                                )}
                        </div>

                        {/* Filter */}
                        <div className="px-4 md:px-8 pb-4">
                                <SegmentedControl
                                        testid="task-scope-tabs"
                                        value={scope}
                                        onChange={setScope}
                                        options={SCOPE_OPTIONS}
                                />
                        </div>

                        {/* Sections */}
                        {totalCount === 0 ? (
                                <EmptyState
                                        icon={CheckSquare}
                                        title="No tasks yet."
                                        sub="Type @task in any chat to capture an action."
                                        cta="New task"
                                        onCta={() => setShowNew(true)}
                                        ctaTestid="empty-new-task"
                                />
                        ) : (
                                <div className="px-2 md:px-6 space-y-3">
                                        {COLS.map((c) => {
                                                const items = grouped[c.key];
                                                if (items.length === 0 && c.key !== "todo" && c.key !== "in_progress") return null;
                                                const isCollapsed = !!collapsed[c.key];
                                                return (
                                                        <section key={c.key} data-testid={`section-${c.key}`}>
                                                                <button
                                                                        type="button"
                                                                        onClick={() => toggle(c.key)}
                                                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/[0.03] active:bg-white/[0.05]"
                                                                >
                                                                        <ChevronDown
                                                                                className={`w-4 h-4 text-ink-mute transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                                                                        />
                                                                        <span className="text-[14px] font-semibold text-ink">{c.label}</span>
                                                                        <span className="text-[11px] text-ink-mute bg-surface-2 rounded-full px-2 py-0.5">
                                                                                {items.length}
                                                                        </span>
                                                                </button>
                                                                {!isCollapsed && (
                                                                        <div className="mt-2 space-y-2">
                                                                                {items.length === 0 && (
                                                                                        <div className="px-3 py-3 text-[13px] text-ink-mute">
                                                                                                {c.key === "todo" ? "Nothing to do — nice." : "Nothing yet."}
                                                                                        </div>
                                                                                )}
                                                                                {items.map((t) => (
                                                                                        <TaskCard
                                                                                                key={t.id}
                                                                                                task={t}
                                                                                                member={members[t.assigned_to]}
                                                                                                onCycle={() => updateStatus(t.id, STATUS_NEXT[t.status] || "todo")}
                                                                                                onComplete={() => completeTask(t.id)}
                                                                                                onDelete={() => softDelete(t.id)}
                                                                                                onRestore={() => restoreTask(t.id)}
                                                                                                onPurge={() => purgeNow(t.id)}
                                                                                                inDeleted={statusFilter === "deleted"}
                                                                                                busy={busyId === t.id}
                                                                                        />
                                                                                ))}
                                                                        </div>
                                                                )}
                                                        </section>
                                                );
                                        })}
                                </div>
                        )}

                        <FAB testid="tasks-fab" icon={Plus} onClick={() => setShowNew(true)} label="New task" />

                        <NewTaskDialog open={showNew} onOpenChange={setShowNew} onCreated={load} />
                </div>
        );
}

function TaskCard({ task, member, onCycle, onComplete, onDelete, onRestore, onPurge, inDeleted, busy }) {
        const pill = STATUS_PILL[task.status] || STATUS_PILL.todo;
        const isDoneOrOverdue = task.status === "completed" || task.status === "overdue";
        const dueDate = task.due_date ? new Date(task.due_date) : null;
        const isOverdueDate = dueDate && dueDate < new Date() && task.status !== "completed";
        const isCompleted = task.status === "completed";
        return (
                <div
                        data-testid={`task-card-${task.id}`}
                        className="group relative mx-1 bg-surface hover:bg-surface-2 transition-colors p-3.5 rounded-[14px]"
                >
                        <div className="flex items-start gap-2 mb-2">
                                {!inDeleted && (
                                        <button
                                                type="button"
                                                data-testid={`task-check-${task.id}`}
                                                onClick={onComplete}
                                                disabled={busy || isCompleted}
                                                aria-label={isCompleted ? "Completed" : "Mark as complete"}
                                                className={`mt-1 w-4 h-4 rounded-[3px] border flex items-center justify-center shrink-0 transition-colors ${
                                                        isCompleted
                                                                ? "bg-tn-green border-tn-green text-black"
                                                                : "border-ink-mute hover:border-brand hover:bg-brand/10"
                                                }`}
                                        >
                                                {isCompleted && <Check className="w-3 h-3" />}
                                        </button>
                                )}
                                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] || "bg-ink-mute"}`} />
                                <div className={`flex-1 text-[15px] leading-[20px] font-semibold ${isDoneOrOverdue && task.status === "completed" ? "line-through text-ink-mute" : "text-ink"}`}>
                                        {task.title}
                                </div>
                                <button
                                        type="button"
                                        data-testid={`task-status-pill-${task.id}`}
                                        onClick={onCycle}
                                        className={`shrink-0 h-6 px-2.5 rounded-full text-[11px] font-semibold ${pill.bg} ${pill.fg} hover:opacity-90 active:scale-95 transition-transform`}
                                        title="Tap to cycle status"
                                >
                                        {pill.label}
                                </button>
                        </div>
                        {task.description && (
                                <p className="text-[13px] leading-[18px] text-ink-dim mb-2 line-clamp-2">{task.description}</p>
                        )}
                        <div className="flex items-center justify-between gap-2 mt-2">
                                <div className="flex items-center gap-1.5">
                                        {task.metadata?.ai_assignee_role ? (
                                                <>
                                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-ai-tint text-ai text-[10px] font-bold ring-1 ring-ai/30">
                                                                AI
                                                        </span>
                                                        <span className="text-[12px] text-ai-soft truncate max-w-[160px]">
                                                                AI {task.metadata.ai_assignee_label || task.metadata.ai_assignee_role}
                                                        </span>
                                                </>
                                        ) : member ? (
                                                <>
                                                        <Avatar name={member.name} src={member.avatar} size={20} />
                                                        <span className="text-[12px] text-ink-dim truncate max-w-[120px]">{member.name?.split(" ")[0]}</span>
                                                </>
                                        ) : (
                                                <span className="text-[12px] text-ink-mute">Unassigned</span>
                                        )}
                                </div>
                                {dueDate && (
                                        <span
                                                className={`inline-flex items-center gap-1 px-2 h-6 rounded-full text-[11px] font-medium ${
                                                        isOverdueDate ? "bg-tn-red/15 text-tn-red" : "bg-surface-2 text-ink-dim"
                                                }`}
                                        >
                                                <Clock className="w-3 h-3" />
                                                {dueDate.toLocaleDateString([], { month: "short", day: "numeric" })}
                                        </span>
                                )}
                        </div>
                        {inDeleted ? (
                                <div className="flex items-center justify-end gap-1.5 mt-2 pt-2 border-t border-hairline" data-testid={`task-deleted-actions-${task.id}`}>
                                        <button onClick={onRestore} disabled={busy} className="text-[11px] font-mono uppercase tracking-widest text-ink-dim hover:text-brand px-2 h-7 rounded-full hover:bg-brand/10 inline-flex items-center gap-1" data-testid={`task-restore-${task.id}`}>
                                                <Undo2 className="w-3 h-3" /> Restore
                                        </button>
                                        <button onClick={onPurge} disabled={busy} className="text-[11px] font-mono uppercase tracking-widest text-tn-red/80 hover:text-tn-red px-2 h-7 rounded-full hover:bg-tn-red/10 inline-flex items-center gap-1" data-testid={`task-purge-${task.id}`}>
                                                <X className="w-3 h-3" /> Delete now
                                        </button>
                                </div>
                        ) : (
                                <button
                                        onClick={onDelete}
                                        disabled={busy}
                                        data-testid={`task-delete-${task.id}`}
                                        aria-label="Delete task"
                                        className="absolute top-2 right-2 w-7 h-7 rounded-full text-ink-mute hover:text-tn-red hover:bg-tn-red/10 hidden group-hover:inline-flex items-center justify-center"
                                >
                                        <Trash2 className="w-3.5 h-3.5" />
                                </button>
                        )}
                </div>
        );
}
