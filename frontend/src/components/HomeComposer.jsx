import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, GitCompareArrows, Paperclip } from "lucide-react";

/** Prompt-first composer used by the Ask (ChatGPT-style) and Focus
 *  (Claude-style) home looks. Submitting drops the prompt into the user's
 *  personal AI chat via ?ask= (single answer) or compare mode (all models). */
export default function HomeComposer({ placeholder = "Ask anything — research, compare AIs, summarize docs…", chips = [] }) {
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [compare, setCompare] = useState(false);
  const ref = useRef(null);

  const submit = () => {
    const q = text.trim();
    if (!q) return;
    nav(`/my-ai?ask=${encodeURIComponent(q)}${compare ? "&mode=compare" : ""}`);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const applyChip = (c) => {
    setText(c);
    ref.current?.focus();
  };

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-white/15 bg-[#121214] focus-within:border-yellow-400/50 transition-colors p-3">
        <textarea
          ref={ref}
          data-testid="home-composer-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={placeholder}
          className="w-full bg-transparent resize-none outline-none text-[15px] text-white placeholder:text-zinc-500 px-1 py-1 max-h-40"
        />
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="home-composer-compare"
              onClick={() => setCompare((c) => !c)}
              aria-pressed={compare}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 h-8 text-xs font-semibold transition-colors ${
                compare
                  ? "border-yellow-400/50 bg-yellow-400/10 text-yellow-300"
                  : "border-white/10 text-zinc-400 hover:text-white hover:bg-white/5"
              }`}
              title="Ask several AI models and compare their answers"
            >
              <GitCompareArrows className="w-3.5 h-3.5" /> Compare models
            </button>
            <span className="hidden sm:flex items-center gap-1 text-[11px] text-zinc-600">
              <Paperclip className="w-3 h-3" /> attach in chat
            </span>
          </div>
          <button
            type="button"
            data-testid="home-composer-send"
            onClick={submit}
            disabled={!text.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-sm h-9 px-4"
          >
            <Send className="w-4 h-4" /> Ask AI
          </button>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              data-testid={`composer-chip-${c.slice(0, 16).replace(/\s+/g, "-").toLowerCase()}`}
              onClick={() => applyChip(c)}
              className="text-[13px] rounded-full border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] px-3 py-1.5 text-zinc-300"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
