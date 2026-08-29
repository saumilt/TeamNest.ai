import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Wand2, X, Loader2, Copy, Zap, Mail, ArrowLeft } from "lucide-react";

/**
 * "Do this for me" — one-tap contextual AI actions for a task / document / chat.
 * Draft-only: shows AI output plus follow-ups (copy, automate, draft email).
 */
export default function DoThisForMe({ entityType, entityId, label = "Do this for me", compact = false, icon = false }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [actions, setActions] = useState([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [email, setEmail] = useState(null);

  const loadActions = useCallback(() => {
    api.get(`/ai/do-actions?entity_type=${entityType}`).then(({ data }) => setActions(data.actions || [])).catch(() => {});
  }, [entityType]);

  useEffect(() => { if (open && actions.length === 0) loadActions(); }, [open, actions.length, loadActions]);

  const reset = () => { setResult(null); setEmail(null); };
  const close = () => { setOpen(false); reset(); };

  const run = async (action) => {
    setRunning(true);
    reset();
    try {
      const { data } = await api.post("/ai/do-action", { entity_type: entityType, entity_id: entityId, action });
      setResult(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't run that");
    } finally { setRunning(false); }
  };

  const doFollowup = async (f) => {
    if (f.kind === "copy") { navigator.clipboard?.writeText(result.result); toast.success("Copied"); return; }
    if (f.kind === "automate") { nav(`/automations?prompt=${encodeURIComponent(f.prompt)}`); return; }
    if (f.kind === "draft_email") {
      setRunning(true);
      try {
        const { data } = await api.post("/ai/draft-email", { content: f.content || result.result });
        setEmail(data);
      } catch (e) { toast.error(e?.response?.data?.detail || "Draft failed"); }
      finally { setRunning(false); }
    }
  };

  return (
    <>
      <button
        data-testid={`do-this-for-me-${entityType}`}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        className={icon
          ? "w-9 h-9 flex items-center justify-center rounded-full text-yellow-400 hover:bg-yellow-500/10 active:scale-95"
          : compact
          ? "inline-flex items-center gap-1 text-[11px] text-yellow-400 hover:text-yellow-300 font-semibold"
          : "inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-yellow-400/30 text-yellow-300 hover:bg-yellow-500/10 font-semibold"}
        title="Let TeamNest do this for you"
      >
        <Wand2 className="w-3.5 h-3.5" /> {icon ? "" : compact ? "Do this" : label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6" data-testid="do-this-modal" onClick={close}>
          <div className="bg-[#0a0a0a] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#0a0a0a] border-b border-white/10 px-5 py-4 flex items-center justify-between">
              <div className="font-bold flex items-center gap-2"><Wand2 className="w-4 h-4 text-yellow-400" /> Do this for me</div>
              <button onClick={close} data-testid="do-this-close" className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5">
              {!result && !email && (
                <>
                  <p className="text-sm text-zinc-500 mb-3">Pick what TeamNest should do with this {entityType}.</p>
                  <div className="flex flex-wrap gap-2">
                    {actions.map((a) => (
                      <button key={a.key} data-testid={`do-action-${a.key}`} onClick={() => run(a.key)} disabled={running}
                        className="text-sm px-3 py-2 rounded-lg border border-white/10 bg-[#121214] text-zinc-200 hover:border-yellow-400/40 hover:bg-white/[0.03] disabled:opacity-60">
                        {a.label}
                      </button>
                    ))}
                  </div>
                  {running && <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin text-yellow-400" /> Working…</div>}
                </>
              )}

              {email ? (
                <div data-testid="do-this-email">
                  <button onClick={() => setEmail(null)} className="text-xs text-zinc-500 hover:text-white inline-flex items-center gap-1 mb-3"><ArrowLeft className="w-3 h-3" /> Back</button>
                  <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Subject</div>
                  <div className="text-sm text-zinc-100 mb-3 font-semibold">{email.subject}</div>
                  <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Body</div>
                  <div className="text-sm text-zinc-300 whitespace-pre-wrap bg-[#121214] border border-white/10 rounded-lg p-3">{email.body}</div>
                  <button onClick={() => { navigator.clipboard?.writeText(`${email.subject}\n\n${email.body}`); toast.success("Copied"); }} className="mt-3 text-xs px-3 py-1.5 rounded-lg bg-white text-black font-semibold inline-flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copy email</button>
                </div>
              ) : result ? (
                <div data-testid="do-this-result">
                  <button onClick={reset} className="text-xs text-zinc-500 hover:text-white inline-flex items-center gap-1 mb-3"><ArrowLeft className="w-3 h-3" /> Try another</button>
                  <div className="text-sm font-semibold text-zinc-100 mb-2">{result.title}</div>
                  <div className="text-sm text-zinc-300 whitespace-pre-wrap bg-[#121214] border border-white/10 rounded-lg p-3">{result.result}</div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {result.followups.map((f, i) => (
                      <button key={i} data-testid={`do-followup-${f.kind}`} onClick={() => doFollowup(f)} disabled={running}
                        className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:border-white/30 inline-flex items-center gap-1 disabled:opacity-60">
                        {f.kind === "copy" ? <Copy className="w-3.5 h-3.5" /> : f.kind === "automate" ? <Zap className="w-3.5 h-3.5 text-yellow-400" /> : <Mail className="w-3.5 h-3.5" />}
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
