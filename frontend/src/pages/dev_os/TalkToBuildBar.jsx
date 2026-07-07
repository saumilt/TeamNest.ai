import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, Send, FileCode, RefreshCw } from "lucide-react";

/**
 * "Talk to your build" — natural-language editor.
 *
 * Sits as a sticky composer at the bottom of the BuildConsole. The user
 * types something like "make the hero red and bigger" → POST /talk → the
 * backend asks the LLM to rewrite the relevant file(s) → we surface a tiny
 * conversation log inline and invoke `onChanged()` so the parent reloads
 * the file tree and the live preview iframe.
 *
 * Keeps last 5 exchanges in component state so the user has a feedback
 * loop without bloating the UI. Persistence to the audit log happens
 * server-side (`/api/dev-projects/{pid}/talk` writes to dev_audit_logs).
 */
export default function TalkToBuildBar({ projectId, onChanged }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);

  // Quick-start suggestions to kick off the loop.
  const SUGGESTIONS = [
    "Make the hero gradient red and bigger",
    "Add a footer with a contact email",
    "Add a new POST /api/feedback endpoint",
    "Change the brand color to teal",
  ];

  const submit = async (instruction) => {
    const value = (instruction ?? text).trim();
    if (!value || busy) return;
    setBusy(true);
    setText("");
    // Optimistic chat bubble.
    const id = Date.now();
    setHistory((h) => [
      { id, kind: "user", text: value },
      { id: id + 0.1, kind: "thinking" },
      ...h,
    ].slice(0, 12));

    try {
      const { data } = await api.post(`/dev-projects/${projectId}/talk`, {
        instruction: value,
      });
      setHistory((h) => {
        const filtered = h.filter((m) => m.kind !== "thinking");
        return [
          {
            id: id + 0.2,
            kind: "ai",
            text: data.summary || "Done.",
            files: data.files_changed || [],
            ok: data.ok !== false,
          },
          ...filtered,
        ].slice(0, 10);
      });
      if (data.ok !== false && (data.files_changed || []).length > 0) {
        toast.success(`Updated ${data.files_changed.length} file(s)`);
        onChanged?.(data.files_changed);
      } else if (data.ok === false) {
        toast.error(data.summary || "Couldn't apply the change");
      } else {
        toast.info("No file changes needed for that request");
      }
    } catch (e) {
      setHistory((h) => h.filter((m) => m.kind !== "thinking"));
      toast.error(e?.response?.data?.detail || "Request failed");
    }
    setBusy(false);
    inputRef.current?.focus();
  };

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div
      data-testid="talk-to-build"
      className="mt-4 rounded-2xl bg-gradient-to-br from-amber-400/[0.06] to-fuchsia-400/[0.04] ring-1 ring-amber-400/20 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-400/15 bg-amber-400/5">
        <Sparkles className="w-4 h-4 text-amber-300" />
        <div className="text-[12px] font-semibold uppercase tracking-wider text-amber-200">
          Talk to your build
        </div>
        <span className="text-[11px] text-ink-mute ml-1 normal-case tracking-normal font-normal">
          AI rewrites the right files instantly — preview refreshes on the next request
        </span>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="px-4 py-3 space-y-2 max-h-[200px] overflow-y-auto">
          {history.map((m) => {
            if (m.kind === "user") {
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-brand-tint text-brand px-3 py-1.5 text-[13px]">
                    {m.text}
                  </div>
                </div>
              );
            }
            if (m.kind === "thinking") {
              return (
                <div key={m.id} className="flex items-center gap-2 text-[12px] text-ink-mute">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  AI is editing your code…
                </div>
              );
            }
            // ai
            return (
              <div key={m.id} className="flex">
                <div className={`max-w-[85%] rounded-2xl rounded-bl-md px-3 py-2 text-[13px] ${
                  m.ok ? "bg-surface-2 text-ink" : "bg-rose-500/10 text-rose-200 ring-1 ring-rose-500/30"
                }`}>
                  <div>{m.text}</div>
                  {m.files?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.files.map((p) => (
                        <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-[10px] font-mono">
                          <FileCode className="w-3 h-3" /> {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="px-3 py-3 flex items-center gap-2"
      >
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          placeholder="Describe a change — e.g. 'make the hero red and bigger'"
          data-testid="talk-to-build-input"
          className="flex-1 h-10 px-4 rounded-pill bg-surface-2 ring-1 ring-hairline focus:ring-amber-400/40 outline-none text-[13px] text-ink placeholder:text-ink-mute"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          data-testid="talk-to-build-send"
          className="h-10 px-4 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[13px] inline-flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="w-3.5 h-3.5" />
          {busy ? "Editing…" : "Apply"}
        </button>
      </form>

      {/* Suggestions */}
      {history.length === 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              disabled={busy}
              data-testid="talk-to-build-suggestion"
              className="text-[11px] px-2.5 py-1 rounded-full bg-surface-2 hover:bg-surface-3 text-ink-dim hover:text-ink ring-1 ring-hairline"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
