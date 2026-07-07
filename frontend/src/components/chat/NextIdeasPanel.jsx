import { useCallback, useEffect, useState } from "react";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

/**
 * NextIdeasPanel — sticky strip of 4 AI-generated "what to do next"
 * chips that lives directly above the chat composer. Lifted from the
 * Emergent IDE pattern: keep momentum visible, let the user one-tap a
 * follow-up prompt instead of having to dream one up.
 *
 * Each chip injects its full prompt into the composer (`onPick(text)`)
 * — the user can edit before sending, so it's an accelerator, not an
 * autopilot.
 *
 * Behavior:
 *   • Fetches `/chats/{chatId}/next-ideas` on mount + whenever the chat
 *     changes. 60-second server-side cache means re-mounts are cheap.
 *   • Refreshes automatically whenever a new outgoing message lands —
 *     so the ideas always reflect the latest turn of conversation.
 *   • Manual ↻ button forces a fresh LLM call.
 *   • Minimized by default — expands via the "Suggestions" chip; the
 *     expanded/minimized choice is persisted per chat in localStorage.
 *     No fetching happens while minimized.
 */
export default function NextIdeasPanel({ chatId, lastMessageId, onPick }) {
  const storageKey = `chat:next-ideas:hidden:${chatId}`;
  // Minimized by default; only "0" (user explicitly expanded) shows the panel.
  const readHidden = () => {
    try { return localStorage.getItem(storageKey) !== "0"; } catch { return true; }
  };
  const [hidden, setHidden] = useState(readHidden);
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Re-sync the minimized state when switching chats without a remount.
  useEffect(() => { setHidden(readHidden()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [storageKey]);

  const load = useCallback(async (force = false) => {
    if (!chatId) return;
    if (force) setRefreshing(true); else setLoading(true);
    try {
      const { data } = await api.get(`/chats/${chatId}/next-ideas${force ? "?refresh=1" : ""}`);
      setIdeas(Array.isArray(data?.ideas) ? data.ideas.slice(0, 4) : []);
    } catch {
      // silent — the panel just stays empty
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [chatId]);

  // Initial + on chat change / expand — never fetch while minimized.
  useEffect(() => { if (!hidden) load(false); }, [load, hidden]);

  // Re-fetch a freshly-cached set whenever a new message arrives (cheap —
  // the 60s server cache makes this nearly free; the LLM only runs when
  // the cache window expires).
  useEffect(() => {
    if (!lastMessageId || hidden) return;
    const t = setTimeout(() => load(false), 1500);
    return () => clearTimeout(t);
  }, [lastMessageId, load, hidden]);

  const toggleHidden = () => {
    const next = !hidden;
    setHidden(next);
    try { localStorage.setItem(storageKey, next ? "1" : "0"); } catch { /* noop */ }
  };

  if (hidden) {
    return (
      <button
        type="button"
        onClick={toggleHidden}
        data-testid="next-ideas-show"
        className="self-end mr-3 mb-1 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-amber-400/10 hover:bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/30 text-[11px] font-medium"
        title="Show AI suggestions"
      >
        <Sparkles className="w-3 h-3" />
        Suggestions
      </button>
    );
  }

  return (
    <div
      data-testid="next-ideas-panel"
      className="mx-3 md:mx-4 mb-1 rounded-xl bg-gradient-to-r from-amber-400/[0.06] via-amber-300/[0.04] to-transparent ring-1 ring-amber-400/20 px-3 py-2"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-amber-200/90">
          <Sparkles className="w-3 h-3" />
          What to try next
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || refreshing}
            data-testid="next-ideas-refresh"
            className="text-amber-200/70 hover:text-amber-200 p-1 rounded hover:bg-white/[0.04] disabled:opacity-50"
            title="Regenerate suggestions"
          >
            {refreshing
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />}
          </button>
          <button
            type="button"
            onClick={toggleHidden}
            data-testid="next-ideas-hide"
            className="text-amber-200/70 hover:text-amber-200 px-1.5 rounded hover:bg-white/[0.04] text-[11px]"
            title="Hide suggestions"
          >
            Hide
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {loading && ideas.length === 0 ? (
          <div className="text-[11px] text-ink-mute py-1.5 inline-flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Thinking up next moves…
          </div>
        ) : ideas.length === 0 ? (
          <div className="text-[11px] text-ink-mute py-1.5">
            No ideas yet — keep chatting and we&apos;ll suggest follow-ups.
          </div>
        ) : (
          ideas.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick?.(it.prompt)}
              data-testid={`next-idea-chip-${i}`}
              title={it.prompt}
              className="group inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-zinc-900/80 hover:bg-amber-300 hover:text-black ring-1 ring-white/10 hover:ring-amber-300 text-ink text-[12px] font-medium transition-colors max-w-[280px]"
            >
              <span className="truncate">{it.label}</span>
              <span className="text-amber-300 group-hover:text-black opacity-70 group-hover:opacity-100 text-[10px]">↵</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
