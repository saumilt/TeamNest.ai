import { useEffect, useRef, useState } from "react";
import { Search, X, MessageSquare, Sparkles, Megaphone } from "lucide-react";
import { api } from "@/lib/api";

const SCOPES = [
  ["both", "Both"],
  ["human", "Human"],
  ["ai", "AI"],
];

const SOURCE_META = {
  human_message: { icon: MessageSquare, label: "Human message" },
  ai_discussion: { icon: Sparkles, label: "AI discussion" },
  publication: { icon: Megaphone, label: "Published summary" },
};

/**
 * ChatSearch — unified in-chat search across Human messages, AI discussions and
 * published summaries. Results are tagged by source; AI results open the panel.
 */
export default function ChatSearch({ chatId, memberMap = {}, onClose, onOpenDiscussion }) {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("both");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      api
        .get(`/chats/${chatId}/search`, { params: { q: term, scope } })
        .then(({ data }) => setResults(data.results || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, scope, chatId]);

  const openResult = (r) => {
    if (r.thread_id) {
      onOpenDiscussion?.(r.thread_id);
      onClose?.();
    } else {
      onClose?.();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-20 px-4" data-testid="chat-search">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-hairline bg-bg shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-hairline">
          <Search className="w-4 h-4 text-ink-mute" />
          <input
            ref={inputRef}
            data-testid="chat-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search messages & AI research…"
            className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-mute focus:outline-none"
          />
          <button
            data-testid="chat-search-close"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-ink-mute hover:text-ink hover:bg-white/5 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-1 px-3 py-2 border-b border-hairline">
          {SCOPES.map(([val, label]) => (
            <button
              key={val}
              data-testid={`chat-search-scope-${val}`}
              onClick={() => setScope(val)}
              className={`h-6 px-2.5 rounded-full text-[11px] font-semibold ${
                scope === val ? "bg-ai text-black" : "text-ink-dim hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2" data-testid="chat-search-results">
          {loading && <div className="text-center text-[12px] text-ink-mute py-6">Searching…</div>}
          {!loading && q.trim() && results.length === 0 && (
            <div className="text-center text-[12px] text-ink-mute py-6">No matches</div>
          )}
          {results.map((r) => {
            const meta = SOURCE_META[r.source_type] || SOURCE_META.human_message;
            const Icon = meta.icon;
            const who =
              r.sender_id != null
                ? memberMap[r.sender_id]?.name || "Someone"
                : memberMap[r.created_by]?.name || "Someone";
            return (
              <button
                key={`${r.source_type}-${r.id}`}
                data-testid={`chat-search-result-${r.id}`}
                onClick={() => openResult(r)}
                className="w-full text-left flex items-start gap-2.5 rounded-xl px-2.5 py-2 hover:bg-surface-2 transition-colors"
              >
                <span
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    r.source_type === "human_message"
                      ? "bg-surface-2 text-ink-dim"
                      : "bg-ai/15 text-ai"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-ink-mute">
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-ink-mute">· {who}</span>
                  </span>
                  <span className="block text-[13px] text-ink line-clamp-2">{r.snippet}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
