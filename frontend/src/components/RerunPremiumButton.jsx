import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Crown, Loader2 } from "lucide-react";

const FAST_MODELS = new Set(["gpt-4o-mini", "claude-haiku", "gemini-flash"]);

/** Re-run a prior AI question with a premium model.
 *
 * Only renders when:
 *   - we know the original question (parent_message body or metadata)
 *   - the current answer used a fast model
 *
 * Posts a system message like `@ai ask claude <question>` to the chat — the
 * existing inline-command parser picks it up and re-runs through the chosen
 * premium model.
 */
export function RerunPremiumButton({ question, currentModelKey, chatId, parentMessageId }) {
  const [busy, setBusy] = useState(false);
  if (!chatId || !currentModelKey || !FAST_MODELS.has(currentModelKey)) return null;

  const rerun = async (e) => {
    e.stopPropagation();
    let prompt = (question || "").trim();
    if (!prompt && parentMessageId) {
      // Best-effort: try to fetch the parent message body
      try {
        const { data } = await api.get(`/chats/${chatId}/messages?limit=200`);
        const parent = (data || []).find((m) => m.id === parentMessageId);
        if (parent?.body) prompt = parent.body;
      } catch (e) { console.debug("[rerun] couldn't fetch parent:", e?.message); }
    }
    if (!prompt) {
      toast.error("Couldn't find the original question to re-run.");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/chats/${chatId}/messages`, {
        body: `@ai ask claude ${prompt}`,
        message_type: "text",
      });
      toast.success("Re-running with Claude Sonnet — 34 credits");
      window.dispatchEvent(new CustomEvent("teamnest:credits-changed"));
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || "Could not re-run");
    } finally { setBusy(false); }
  };

  return (
    <button
      data-testid="rerun-premium-btn"
      onClick={rerun}
      disabled={busy}
      title="Re-ask with Claude Sonnet (34 credits) for deeper reasoning"
      className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-yellow-300 hover:text-yellow-100 border border-yellow-400/20 hover:border-yellow-400/50 hover:bg-yellow-500/5 px-2 py-1 rounded-sm transition-colors mb-2"
    >
      {busy ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Crown className="w-3 h-3" />
      )}
      {busy ? "Running…" : "↻ Re-run with Premium"}
    </button>
  );
}
