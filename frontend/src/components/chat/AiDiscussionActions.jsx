import { useState } from "react";
import { Lock, Users, UserCheck, Send, BookmarkPlus, Check, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const VIS = {
  private: { label: "Private", icon: Lock },
  chat: { label: "Shared with chat", icon: Users },
  shared: { label: "Shared with people", icon: UserCheck },
};

const PUBLISH_TYPES = [
  ["executive_summary", "Executive summary"],
  ["recommendation", "Recommendation"],
  ["key_findings", "Key findings"],
  ["action_items", "Action items"],
  ["risks", "Risks"],
  ["custom", "Custom excerpt"],
];

/**
 * AiDiscussionActions — the toolbar shown atop the AI discussion panel:
 * change visibility (creator only), publish a concise summary to the chat, or
 * save the research to institutional knowledge.
 */
export default function AiDiscussionActions({
  threadId,
  discussion,
  isCreator,
  members = [],
  onChanged,
  onPublished,
}) {
  const [visMenu, setVisMenu] = useState(false);
  const [visibility, setVisibility] = useState(discussion?.visibility || "private");
  const [shared, setShared] = useState([]);
  const [pubOpen, setPubOpen] = useState(false);
  const [pubType, setPubType] = useState("executive_summary");
  const [customText, setCustomText] = useState("");
  const [busy, setBusy] = useState(false);
  const Vis = VIS[visibility] || VIS.private;

  const applyVisibility = async (v, sharedIds) => {
    setVisibility(v);
    setVisMenu(false);
    try {
      await api.patch(`/ai/threads/${threadId}/visibility`, {
        visibility: v,
        shared_user_ids: v === "shared" ? sharedIds || shared : [],
      });
      toast.success(`Visibility: ${VIS[v].label}`);
      onChanged?.();
    } catch {
      toast.error("Couldn't update visibility");
    }
  };

  const doPublish = async () => {
    setBusy(true);
    try {
      await api.post(`/ai/threads/${threadId}/publish`, {
        publication_type: pubType,
        custom_text: pubType === "custom" ? customText : undefined,
      });
      toast.success("Published to chat");
      setPubOpen(false);
      setCustomText("");
      onPublished?.();
    } catch {
      toast.error("Publish failed");
    } finally {
      setBusy(false);
    }
  };

  const doSaveKnowledge = async () => {
    setBusy(true);
    try {
      await api.post(`/ai/threads/${threadId}/save-knowledge`, {});
      toast.success("Saved to Knowledge");
    } catch {
      toast.error("Save failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleShared = (id) =>
    setShared((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div
      className="flex items-center gap-1.5 px-3 py-2 border-b border-hairline bg-surface-2/40 relative"
      data-testid="ai-discussion-actions"
    >
      <div className="relative">
        <button
          type="button"
          data-testid="ai-visibility-btn"
          disabled={!isCreator}
          onClick={() => setVisMenu((v) => !v)}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-surface border border-hairline text-[11px] text-ink-dim hover:text-ink disabled:opacity-70"
        >
          <Vis.icon className="w-3 h-3" /> {Vis.label}
          {isCreator && <ChevronDown className="w-3 h-3" />}
        </button>
        {visMenu && isCreator && (
          <div className="absolute z-30 top-full mt-1 left-0 w-56 rounded-xl border border-hairline bg-bg shadow-xl p-1" data-testid="ai-visibility-menu">
            {["private", "chat", "shared"].map((v) => {
              const I = VIS[v].icon;
              return (
                <button
                  key={v}
                  type="button"
                  data-testid={`ai-visibility-${v}`}
                  onClick={() => (v === "shared" ? setVisibility("shared") : applyVisibility(v))}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-ink-dim hover:text-ink hover:bg-surface-2"
                >
                  <I className="w-3.5 h-3.5" /> {VIS[v].label}
                  {visibility === v && <Check className="w-3.5 h-3.5 ml-auto text-ai" />}
                </button>
              );
            })}
            {visibility === "shared" && (
              <div className="mt-1 border-t border-hairline pt-1 max-h-48 overflow-y-auto">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleShared(m.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-ink-dim hover:bg-surface-2"
                  >
                    <span className={`w-3.5 h-3.5 rounded border ${shared.includes(m.id) ? "bg-ai border-ai" : "border-hairline"} flex items-center justify-center`}>
                      {shared.includes(m.id) && <Check className="w-2.5 h-2.5 text-black" />}
                    </span>
                    {m.name}
                  </button>
                ))}
                <button
                  type="button"
                  data-testid="ai-visibility-apply-shared"
                  onClick={() => applyVisibility("shared", shared)}
                  className="w-full mt-1 h-7 rounded-lg bg-ai text-black text-[12px] font-semibold"
                >
                  Share with {shared.length || 0}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        data-testid="ai-publish-btn"
        onClick={() => setPubOpen(true)}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-ai text-black text-[11px] font-semibold hover:opacity-90"
      >
        <Send className="w-3 h-3" /> Publish
      </button>
      <button
        type="button"
        data-testid="ai-save-knowledge-btn"
        onClick={doSaveKnowledge}
        disabled={busy}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-surface border border-hairline text-[11px] text-ink-dim hover:text-ink disabled:opacity-50"
      >
        <BookmarkPlus className="w-3 h-3" /> Save to Knowledge
      </button>

      <Dialog open={pubOpen} onOpenChange={setPubOpen}>
        <DialogContent className="max-w-sm" data-testid="ai-publish-dialog">
          <DialogTitle className="text-[15px] font-semibold text-ink">
            Publish to chat
          </DialogTitle>
          <p className="text-[12px] text-ink-dim -mt-2">
            Post a concise summary into the human conversation.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PUBLISH_TYPES.map(([val, label]) => (
              <button
                key={val}
                type="button"
                data-testid={`ai-publish-type-${val}`}
                onClick={() => setPubType(val)}
                className={`px-2.5 h-8 rounded-full border text-[12px] ${
                  pubType === val
                    ? "bg-ai text-black border-ai"
                    : "border-hairline text-ink-dim hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {pubType === "custom" && (
            <textarea
              data-testid="ai-publish-custom"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              rows={4}
              placeholder="Paste or write the excerpt to publish…"
              className="w-full rounded-xl bg-surface-2 border border-hairline p-3 text-[13px] text-ink resize-none focus:outline-none focus:border-ai/40"
            />
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPubOpen(false)}
              className="h-9 px-3 rounded-full text-[13px] text-ink-mute hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="ai-publish-confirm"
              disabled={busy || (pubType === "custom" && !customText.trim())}
              onClick={doPublish}
              className="h-9 px-4 rounded-full bg-ai text-black font-semibold text-[13px] disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" /> {busy ? "Publishing…" : "Publish"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
