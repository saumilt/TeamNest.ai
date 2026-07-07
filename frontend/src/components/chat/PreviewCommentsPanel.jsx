import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bug, CheckCircle2, ListTodo, Loader2, MessageSquareText, Send } from "lucide-react";
import { api } from "@/lib/api";
import safeStorage from "@/lib/safeStorage";

/**
 * PreviewCommentsPanel — collaborative feedback on a build's preview.
 *
 * Two modes:
 *  • Team mode (projectId): full CRUD — resolve, convert to task/bug.
 *  • Guest mode (token): public share link visitors leave name + comment.
 *    No auth, no AI-credit spend, read/write comments only.
 */
export default function PreviewCommentsPanel({ projectId, token, dark = false }) {
  const guest = Boolean(token);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [guestName, setGuestName] = useState(() => safeStorage.get("tn:guest-name") || "");
  const [sending, setSending] = useState(false);

  const base = guest
    ? `/preview-share/${token}/comments`
    : `/dev-projects/${projectId}/preview-comments`;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(base);
      setComments(data.comments || []);
    } catch { /* noop */ } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      const body = guest
        ? { author_name: guestName.trim() || "Guest", comment: draft.trim() }
        : { comment: draft.trim(), screen_name: "" };
      if (guest && guestName.trim()) safeStorage.set("tn:guest-name", guestName.trim());
      await api.post(base, body);
      setDraft("");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not post comment");
    } finally {
      setSending(false);
    }
  };

  const resolve = async (c) => {
    try {
      await api.patch(`/dev-preview-comments/${c.id}`, { resolved: !c.resolved });
      await load();
    } catch { toast.error("Could not update"); }
  };

  const toTask = async (c) => {
    try {
      await api.post(`/dev-preview-comments/${c.id}/convert-to-task`);
      toast.success("Task created on the Dev OS board");
      await load();
    } catch { toast.error("Could not create task"); }
  };

  const toBug = async (c) => {
    try {
      await api.post(`/dev-preview-comments/${c.id}/convert-to-bug`);
      toast.success("Bug filed — QA will pick it up");
      await load();
    } catch { toast.error("Could not file bug"); }
  };

  const tone = dark
    ? { text: "text-zinc-100", mute: "text-zinc-500", box: "bg-zinc-900 ring-white/10" }
    : { text: "text-ink", mute: "text-ink-mute", box: "bg-surface-2 ring-hairline" };

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="preview-comments-panel">
      <div className={`px-3 py-2 text-[11px] uppercase tracking-wider ${tone.mute} flex items-center gap-1.5`}>
        <MessageSquareText className="w-3.5 h-3.5" />
        Preview feedback ({comments.length})
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 space-y-2">
        {loading && (
          <div className={`text-[12px] ${tone.mute} flex items-center gap-2 py-3`}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        )}
        {!loading && comments.length === 0 && (
          <p className={`text-[12px] ${tone.mute} italic py-3`}>
            No feedback yet — be the first to comment on this build.
          </p>
        )}
        {comments.map((c) => (
          <div
            key={c.id}
            data-testid={`preview-comment-${c.id}`}
            className={`rounded-lg ring-1 p-2.5 ${tone.box} ${c.resolved ? "opacity-55" : ""}`}
          >
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-semibold ${tone.text}`}>
                {c.is_guest ? `${c.author_name || "Guest"} · guest` : (c.author_name || "Teammate")}
              </span>
              <span className={`text-[10px] ${tone.mute}`}>
                {new Date(c.created_at).toLocaleString()}
              </span>
              {c.resolved && (
                <span className="ml-auto text-[10px] text-emerald-400 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> resolved
                </span>
              )}
            </div>
            <p className={`text-[12.5px] mt-1 ${tone.text}`}>{c.comment}</p>
            {!guest && (
              <div className="flex gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={() => resolve(c)}
                  data-testid={`comment-resolve-${c.id}`}
                  className={`h-6 px-2 rounded-full text-[10.5px] font-medium ring-1 ring-hairline ${tone.mute} hover:text-emerald-300`}
                >
                  {c.resolved ? "Reopen" : "Resolve"}
                </button>
                {!c.converted_to_task_id && (
                  <button
                    type="button"
                    onClick={() => toTask(c)}
                    data-testid={`comment-to-task-${c.id}`}
                    className={`h-6 px-2 rounded-full text-[10.5px] font-medium ring-1 ring-hairline ${tone.mute} hover:text-amber-300 inline-flex items-center gap-1`}
                  >
                    <ListTodo className="w-3 h-3" /> Task
                  </button>
                )}
                {!c.converted_to_bug_id && (
                  <button
                    type="button"
                    onClick={() => toBug(c)}
                    data-testid={`comment-to-bug-${c.id}`}
                    className={`h-6 px-2 rounded-full text-[10.5px] font-medium ring-1 ring-hairline ${tone.mute} hover:text-red-300 inline-flex items-center gap-1`}
                  >
                    <Bug className="w-3 h-3" /> Bug
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-2.5 space-y-1.5">
        {guest && (
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Your name"
            data-testid="guest-name-input"
            className={`w-full h-8 px-2.5 rounded-lg text-[12px] ring-1 outline-none ${tone.box} ${tone.text}`}
          />
        )}
        <div className="flex gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder="Leave feedback on this build…"
            data-testid="preview-comment-input"
            className={`flex-1 h-9 px-2.5 rounded-lg text-[12.5px] ring-1 outline-none ${tone.box} ${tone.text}`}
          />
          <button
            type="button"
            onClick={send}
            disabled={sending || !draft.trim()}
            data-testid="preview-comment-send"
            className="h-9 w-9 rounded-lg bg-amber-300 hover:bg-amber-200 text-black flex items-center justify-center disabled:opacity-40"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
