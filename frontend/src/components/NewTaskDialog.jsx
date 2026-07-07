import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sparkles, Wand2 } from "lucide-react";
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
const STATUSES = ["todo", "in_progress", "needs_review", "completed"];

export default function NewTaskDialog({
  open,
  onOpenChange,
  onCreated,
  sourceChatId,
  sourceMessage,
  defaultTitle = "",
  defaultDescription = "",
  folderId: defaultFolder,
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState([]);
  const [folders, setFolders] = useState([]);
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");
  const [folderId, setFolderId] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSuggested, setAiSuggested] = useState(false);

  const runAISuggest = useCallback(async () => {
    if (!sourceMessage?.body) return;
    setAiBusy(true);
    try {
      const { data } = await api.post("/ai/extract-task", {
        message_body: sourceMessage.body,
        message_id: sourceMessage.id,
        chat_id: sourceChatId,
      });
      if (data.title) setTitle(data.title);
      if (data.description) setDescription(data.description);
      if (data.priority) setPriority(data.priority);
      if (data.suggested_assignee_id) setAssignedTo(data.suggested_assignee_id);
      setAiSuggested(true);
    } catch (err) {
      console.warn("[ai-extract-task] failed", err);
      // User can still fill manually
    } finally {
      setAiBusy(false);
    }
  }, [sourceMessage, sourceChatId]);

  useEffect(() => {
    if (!open) return;
    api.get("/workspace/members").then(({ data }) => setMembers(data));
    api.get("/folders").then(({ data }) => setFolders(data));
    setTitle(defaultTitle || sourceMessage?.body?.slice(0, 120) || "");
    setDescription(defaultDescription || sourceMessage?.body || "");
    setAssignedTo("");
    setDueDate("");
    setPriority("medium");
    setStatus("todo");
    setFolderId(defaultFolder || "");
    setAiSuggested(false);
    // Auto-trigger AI prefill when dialog is opened from a chat message
    if (sourceMessage?.body) {
      runAISuggest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (!title) return toast.error("Title required");
    try {
      const { data } = await api.post("/tasks", {
        title,
        description,
        assigned_to: assignedTo || null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        priority,
        status,
        project_folder_id: folderId || null,
        source_chat_id: sourceChatId || null,
        source_message_id: sourceMessage?.id || null,
      });
      toast.success(
        assignedTo
          ? `Task created · ${members.find((m) => m.id === assignedTo)?.name || "assigned"} notified in their AI assistant`
          : "Task created"
      );
      onCreated?.(data);
      onOpenChange(false);
    } catch {
      toast.error("Create failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-hairline rounded-2xl max-w-lg" data-testid="new-task-dialog">
        <DialogHeader>
          <DialogTitle className="tracking-tight flex items-center gap-2 text-[18px] font-bold">
            New task
            {sourceMessage && (
              <span className="text-[11px] font-medium text-brand bg-brand-tint px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                From message
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {sourceMessage && (
          <div
            className="bg-brand-tint/40 px-3 py-2 rounded-xl flex items-center justify-between gap-3"
            data-testid="ai-suggest-banner"
          >
            <div className="text-[12px] text-ink-dim flex items-center gap-2">
              <Wand2 className="w-3.5 h-3.5 text-brand shrink-0" />
              {aiBusy ? (
                <span>AI is drafting title, priority and suggested assignee…</span>
              ) : aiSuggested ? (
                <span>AI pre-filled this task from the message. Edit anything below.</span>
              ) : (
                <span>Open from a chat message — tap <span className="text-brand">AI Suggest</span> to auto-draft.</span>
              )}
            </div>
            <button
              data-testid="ai-suggest-btn"
              onClick={runAISuggest}
              disabled={aiBusy}
              className="h-7 px-2.5 rounded-full bg-brand-tint text-brand text-[12px] font-semibold hover:bg-brand/30 disabled:opacity-30 shrink-0"
            >
              {aiBusy ? "Drafting…" : aiSuggested ? "Re-suggest" : "AI Suggest"}
            </button>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <div className="text-[13px] text-ink-dim font-medium mb-1.5">Title</div>
            <Input data-testid="task-title" value={title} onChange={(e) => setTitle(e.target.value)} className="bg-surface-2 border-hairline rounded-xl h-11 px-3 text-[14px]" />
          </div>
          <div>
            <div className="text-[13px] text-ink-dim font-medium mb-1.5">Description</div>
            <Textarea data-testid="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="bg-surface-2 border-hairline rounded-xl min-h-[80px] px-3 py-2 text-[14px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[13px] text-ink-dim font-medium mb-1.5 flex items-center gap-1.5">
                Assign to
                {aiSuggested && assignedTo && (
                  <span className="text-[11px] text-brand">· AI suggested</span>
                )}
              </div>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger data-testid="task-assignee" className="bg-surface-2 border-hairline rounded-xl h-11">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent className="bg-surface border-hairline">
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-[13px] text-ink-dim font-medium mb-1.5">Due date</div>
              <Input data-testid="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-surface-2 border-hairline rounded-xl h-11 px-3 text-[14px]" />
            </div>
            <div>
              <div className="text-[13px] text-ink-dim font-medium mb-1.5 flex items-center gap-1.5">
                Priority
                {aiSuggested && (
                  <span className="text-[11px] text-brand">· AI suggested</span>
                )}
              </div>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="task-priority" className="bg-surface-2 border-hairline rounded-xl h-11 capitalize"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-surface border-hairline">
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-[13px] text-ink-dim font-medium mb-1.5">Status</div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="bg-surface-2 border-hairline rounded-xl h-11 capitalize"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-surface border-hairline">
                  {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <div className="text-[13px] text-ink-dim font-medium mb-1.5">Project folder</div>
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger data-testid="task-folder" className="bg-surface-2 border-hairline rounded-xl h-11"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent className="bg-surface border-hairline">
                {folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button data-testid="create-task-confirm" onClick={submit} className="w-full bg-brand text-black hover:bg-brand-deep rounded-2xl text-[14px] font-semibold h-12">
            Create task &amp; notify assignee
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
