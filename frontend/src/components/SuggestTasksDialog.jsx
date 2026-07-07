import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Sparkles, Wand2, ListTodo, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRIORITIES = ["low", "medium", "high", "urgent"];

const UNASSIGNED = "__unassigned__";

function toDateInput(iso) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/**
 * AI-driven Suggest Tasks dialog.
 * - Calls /api/ai/suggest-tasks with the source message body.
 * - Shows 1..N suggested tasks. Each row is editable + selectable.
 * - User picks assignee/priority/due per task, toggles include checkbox.
 * - "Create selected" creates each via /api/tasks and notifies assignees.
 */
export default function SuggestTasksDialog({
  open,
  onOpenChange,
  onCreated,
  sourceChatId,
  sourceMessage,
  folderId,
}) {
  const [members, setMembers] = useState([]);
  const [suggestions, setSuggestions] = useState([]); // [{include, title, description, priority, assigned_to, due_date}]
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState(null);

  const runSuggest = async () => {
    if (!sourceMessage?.body) return;
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.post("/ai/suggest-tasks", {
        message_body: sourceMessage.body,
        message_id: sourceMessage.id,
        chat_id: sourceChatId,
        max_tasks: 6,
      });
      const tasks = (data?.tasks || []).map((t, i) => ({
        _key: `s-${Date.now()}-${i}`,
        include: true,
        title: t.title || "",
        description: t.description || "",
        priority: t.priority || "medium",
        assigned_to: t.suggested_assignee_id || "",
        due_date: toDateInput(t.suggested_due_date),
      }));
      if (tasks.length === 0) {
        setSuggestions([{
          _key: `s-${Date.now()}-fb`,
          include: true,
          title: sourceMessage.body.slice(0, 100),
          description: sourceMessage.body,
          priority: "medium",
          assigned_to: "",
          due_date: "",
        }]);
      } else {
        setSuggestions(tasks);
      }
    } catch (e) {
      console.warn("[suggest-tasks] failed", e);
      setErr(e?.response?.data?.detail || "AI suggestion failed — you can still add tasks manually.");
      setSuggestions([{
        _key: `s-${Date.now()}-err`,
        include: true,
        title: sourceMessage.body.slice(0, 100),
        description: sourceMessage.body,
        priority: "medium",
        assigned_to: "",
        due_date: "",
      }]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    api.get("/workspace/members").then(({ data }) => setMembers(data));
    setSuggestions([]);
    setErr(null);
    if (sourceMessage?.body) runSuggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patch = (idx, field, value) => {
    setSuggestions((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  };

  const addBlank = () => {
    setSuggestions((prev) => [
      ...prev,
      { _key: `s-${Date.now()}-${prev.length}`, include: true, title: "", description: "", priority: "medium", assigned_to: "", due_date: "" },
    ]);
  };

  const removeRow = (idx) => {
    setSuggestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    const toCreate = suggestions.filter((t) => t.include && t.title.trim());
    if (toCreate.length === 0) {
      toast.error("Select at least one task to create");
      return;
    }
    setCreating(true);
    try {
      const created = [];
      for (const t of toCreate) {
        const { data } = await api.post("/tasks", {
          title: t.title.trim(),
          description: t.description.trim(),
          assigned_to: t.assigned_to || null,
          due_date: t.due_date ? new Date(t.due_date).toISOString() : null,
          priority: t.priority,
          status: "todo",
          project_folder_id: folderId || null,
          source_chat_id: sourceChatId || null,
          source_message_id: sourceMessage?.id || null,
        });
        created.push(data);
      }
      const assigneeCount = toCreate.filter((t) => t.assigned_to).length;
      toast.success(
        created.length === 1
          ? `Task created${assigneeCount ? " · assignee notified" : ""}`
          : `${created.length} tasks created${assigneeCount ? ` · ${assigneeCount} assignee(s) notified` : ""}`
      );
      onCreated?.(created);
      onOpenChange(false);
    } catch (e) {
      console.warn("[suggest-tasks] create failed", e);
      toast.error("One or more tasks failed to create");
    } finally {
      setCreating(false);
    }
  };

  const selectedCount = suggestions.filter((t) => t.include && t.title.trim()).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#0a0a0a] border-white/10 rounded-sm max-w-2xl max-h-[88vh] overflow-y-auto"
        data-testid="suggest-tasks-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-yellow-400" />
            AI-Suggested Tasks
            <span className="text-[9px] font-mono uppercase tracking-widest text-yellow-300 border border-yellow-500/30 px-1.5 py-0.5 rounded-sm flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              FROM MESSAGE
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Source preview */}
        {sourceMessage?.body && (
          <div className="border border-white/10 bg-[#121214] px-3 py-2 rounded-sm text-[11px] text-zinc-400 whitespace-pre-wrap line-clamp-4">
            <span className="label-mono mr-1">SOURCE ·</span>
            {sourceMessage.body.length > 320 ? sourceMessage.body.slice(0, 320) + "…" : sourceMessage.body}
          </div>
        )}

        {/* Status bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] text-zinc-300">
            <Wand2 className="w-3.5 h-3.5 text-yellow-400" />
            {busy ? (
              <span>AI is analyzing the message and drafting tasks…</span>
            ) : suggestions.length > 0 ? (
              <span>
                AI suggests <span className="text-yellow-300 font-medium">{suggestions.length}</span> task{suggestions.length === 1 ? "" : "s"}.
                Review, edit, and pick assignees below.
              </span>
            ) : (
              <span>Ready to analyze.</span>
            )}
          </div>
          <button
            data-testid="suggest-tasks-rerun"
            onClick={runSuggest}
            disabled={busy}
            className="text-[10px] font-mono uppercase tracking-widest text-yellow-300 hover:text-yellow-200 border border-yellow-500/30 hover:bg-yellow-500/10 px-2 py-1 rounded-sm disabled:opacity-30 shrink-0"
          >
            {busy ? "Drafting…" : "Re-analyze"}
          </button>
        </div>

        {err && (
          <div className="flex items-center gap-2 text-[11px] text-amber-300 border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 rounded-sm">
            <AlertCircle className="w-3.5 h-3.5" />
            {err}
          </div>
        )}

        {/* Task rows */}
        <div className="space-y-3" data-testid="suggested-task-list">
          {busy && suggestions.length === 0 && (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 shimmer rounded-sm" />
              ))}
            </div>
          )}
          {suggestions.map((t, idx) => (
            <div
              key={t._key || idx}
              data-testid={`suggested-task-${idx}`}
              className={`border rounded-sm p-3 transition-colors ${
                t.include ? "border-yellow-500/30 bg-yellow-500/[0.03]" : "border-white/10 bg-[#121214] opacity-60"
              }`}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  data-testid={`suggested-task-include-${idx}`}
                  checked={t.include}
                  onCheckedChange={(v) => patch(idx, "include", !!v)}
                  className="mt-1.5 border-yellow-500/40 data-[state=checked]:bg-yellow-500 data-[state=checked]:text-black"
                />
                <div className="flex-1 space-y-2">
                  <Input
                    data-testid={`suggested-task-title-${idx}`}
                    value={t.title}
                    onChange={(e) => patch(idx, "title", e.target.value)}
                    placeholder="Task title"
                    className="bg-[#0a0a0a] border-white/10 rounded-sm text-sm"
                  />
                  <Textarea
                    data-testid={`suggested-task-desc-${idx}`}
                    value={t.description}
                    onChange={(e) => patch(idx, "description", e.target.value)}
                    placeholder="Description"
                    rows={2}
                    className="bg-[#0a0a0a] border-white/10 rounded-sm text-xs min-h-[52px]"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Select
                      value={t.assigned_to || UNASSIGNED}
                      onValueChange={(v) => patch(idx, "assigned_to", v === UNASSIGNED ? "" : v)}
                    >
                      <SelectTrigger
                        data-testid={`suggested-task-assignee-${idx}`}
                        className="bg-[#0a0a0a] border-white/10 rounded-sm h-8 text-xs"
                      >
                        <SelectValue placeholder="Assign to…" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#121214] border-white/10">
                        <SelectItem value={UNASSIGNED} className="text-xs">Unassigned</SelectItem>
                        {members.map((m) => (
                          <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={t.priority}
                      onValueChange={(v) => patch(idx, "priority", v)}
                    >
                      <SelectTrigger
                        data-testid={`suggested-task-priority-${idx}`}
                        className="bg-[#0a0a0a] border-white/10 rounded-sm h-8 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#121214] border-white/10">
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      data-testid={`suggested-task-due-${idx}`}
                      type="date"
                      value={t.due_date}
                      onChange={(e) => patch(idx, "due_date", e.target.value)}
                      className="bg-[#0a0a0a] border-white/10 rounded-sm h-8 text-xs"
                    />
                  </div>
                </div>
                <button
                  onClick={() => removeRow(idx)}
                  className="text-zinc-500 hover:text-red-400 text-[10px] font-mono uppercase tracking-widest"
                  title="Remove this suggestion"
                  data-testid={`suggested-task-remove-${idx}`}
                >
                  remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            onClick={addBlank}
            data-testid="suggested-task-add-blank"
            className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-yellow-200 border border-white/10 hover:border-yellow-500/30 px-2.5 py-1.5 rounded-sm"
          >
            + Add another task
          </button>
          <Button
            data-testid="create-suggested-tasks"
            onClick={submit}
            disabled={creating || selectedCount === 0}
            className="bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase text-xs tracking-widest h-10 px-4"
          >
            {creating
              ? "Creating…"
              : selectedCount > 1
              ? `Create ${selectedCount} tasks & notify`
              : "Create task & notify"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
