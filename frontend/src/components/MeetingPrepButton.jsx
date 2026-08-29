import { useState } from "react";
import { api } from "@/lib/api";
import { Sparkles, X, Loader2 } from "lucide-react";

/**
 * "Prepare me" — briefs the user before a meeting from its chat + documents.
 * Self-contained: renders a small button + a dialog with the AI brief.
 */
export default function MeetingPrepButton({ chatId, callId, title, className = "" }) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setOpen(true);
    setLoading(true);
    setError("");
    setBrief(null);
    try {
      const { data } = await api.post("/ai/meeting-prep", { chat_id: chatId, call_id: callId });
      setBrief(data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Couldn't prepare a brief");
    } finally {
      setLoading(false);
    }
  };

  const close = (e) => { if (e) { e.preventDefault(); e.stopPropagation(); } setOpen(false); };

  return (
    <>
      <button
        type="button"
        data-testid="meeting-prep-btn"
        onClick={run}
        title="Prepare me for this meeting"
        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full border border-yellow-400/40 text-yellow-300 hover:bg-yellow-500/10 px-2.5 py-1 transition-colors ${className}`}
      >
        <Sparkles className="w-3 h-3" /> Prepare me
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6"
          data-testid="meeting-prep-dialog"
          onClick={close}
        >
          <div
            className="bg-[#0a0a0a] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[#0a0a0a] border-b border-white/10 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold">
                <Sparkles className="w-4 h-4 text-yellow-400" /> Meeting prep{title ? ` · ${title}` : ""}
              </div>
              <button onClick={close} data-testid="meeting-prep-close" className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5">
              {loading && (
                <div className="flex items-center gap-2 text-zinc-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Preparing your brief…</div>
              )}
              {error && <div className="text-red-400 text-sm">{error}</div>}
              {brief && (
                <div data-testid="meeting-prep-brief" className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{brief.brief}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
