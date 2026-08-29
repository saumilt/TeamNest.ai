import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Sparkles, X, Loader2, CalendarClock, Plus, Users } from "lucide-react";

/**
 * "Prepare me" — shows the next upcoming meeting (from the in-app calendar),
 * lets you schedule one, and briefs you for it from chat + documents.
 */
export default function MeetingPrepButton({ chatId, callId, title, className = "" }) {
  const [open, setOpen] = useState(false);
  const [upcoming, setUpcoming] = useState([]);
  const [loadingUp, setLoadingUp] = useState(false);
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", start: "" });
  const [saving, setSaving] = useState(false);

  const loadUpcoming = useCallback(async () => {
    setLoadingUp(true);
    try {
      const { data } = await api.get("/meetings/upcoming", { params: chatId ? { chat_id: chatId } : {} });
      setUpcoming(data.items || []);
    } catch { setUpcoming([]); } finally { setLoadingUp(false); }
  }, [chatId]);

  const openDialog = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setOpen(true); setBrief(null); setError(""); setShowForm(false);
    setForm({ title: title ? `${title} sync` : "", start: "" });
    loadUpcoming();
  };
  const close = (e) => { if (e) { e.preventDefault(); e.stopPropagation(); } setOpen(false); };

  const run = async () => {
    setLoading(true); setError(""); setBrief(null);
    try {
      const { data } = await api.post("/ai/meeting-prep", { chat_id: chatId, call_id: callId });
      setBrief(data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Couldn't prepare a brief");
    } finally { setLoading(false); }
  };

  const schedule = async () => {
    if (!form.title.trim() || !form.start) return;
    setSaving(true);
    try {
      await api.post("/meetings", {
        title: form.title.trim(),
        start_at: new Date(form.start).toISOString(),
        chat_id: chatId || null,
      });
      setShowForm(false);
      setForm({ title: "", start: "" });
      await loadUpcoming();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const fmt = (iso) => { try { return new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };
  const next = upcoming[0];

  return (
    <>
      <button
        type="button"
        data-testid="meeting-prep-btn"
        onClick={openDialog}
        title="Prepare me for this meeting"
        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full border border-yellow-400/40 text-yellow-300 hover:bg-yellow-500/10 px-2.5 py-1 transition-colors ${className}`}
      >
        <Sparkles className="w-3 h-3" /> Prepare me
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6" data-testid="meeting-prep-dialog" onClick={close}>
          <div className="bg-[#0a0a0a] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto text-white" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#0a0a0a] border-b border-white/10 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold"><Sparkles className="w-4 h-4 text-yellow-400" /> Meeting prep{title ? ` · ${title}` : ""}</div>
              <button onClick={close} data-testid="meeting-prep-close" className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-4">
              {!brief && (
                <>
                  {/* upcoming */}
                  <div data-testid="meeting-upcoming" className="rounded-xl border border-white/10 bg-[#121214] p-4">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Next meeting</div>
                    {loadingUp ? (
                      <div className="flex items-center gap-2 text-zinc-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
                    ) : next ? (
                      <div className="flex items-start gap-3">
                        <CalendarClock className="w-5 h-5 text-yellow-400 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-100">{next.title}</div>
                          <div className="text-xs text-zinc-400 mt-0.5">{fmt(next.start_at)}</div>
                          {next.attendees?.length > 0 && (
                            <div className="text-[11px] text-zinc-500 mt-1 inline-flex items-center gap-1"><Users className="w-3 h-3" /> {next.attendees.join(", ")}</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-500">No meeting scheduled yet — schedule one or prep from the recent conversation.</div>
                    )}
                  </div>

                  {/* schedule */}
                  {showForm ? (
                    <div className="rounded-xl border border-white/10 bg-[#121214] p-4 space-y-3">
                      <input data-testid="meeting-schedule-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Meeting title" className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-yellow-400/40" />
                      <input data-testid="meeting-schedule-time" type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-yellow-400/40 text-zinc-200" />
                      <div className="flex gap-2">
                        <button data-testid="meeting-schedule-save" disabled={saving || !form.title.trim() || !form.start} onClick={schedule} className="bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-60 text-xs font-semibold rounded-lg px-3 py-2">{saving ? "Saving…" : "Save meeting"}</button>
                        <button onClick={() => setShowForm(false)} className="text-xs text-zinc-400 hover:text-white px-3 py-2">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button data-testid="meeting-schedule-open" onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-300 hover:text-white border border-white/10 rounded-lg px-3 py-2"><Plus className="w-3.5 h-3.5" /> Schedule a meeting</button>
                  )}

                  <button data-testid="meeting-prep-run" onClick={run} disabled={loading} className="w-full bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-60 text-sm font-semibold rounded-lg px-4 py-2.5 inline-flex items-center justify-center gap-2">
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing…</> : <><Sparkles className="w-4 h-4" /> Prepare me</>}
                  </button>
                  {error && <div className="text-red-400 text-sm">{error}</div>}
                </>
              )}

              {brief && (
                <div>
                  {brief.meeting && (
                    <div className="mb-3 rounded-lg border border-yellow-400/20 bg-yellow-500/[0.05] p-3 flex items-center gap-2 text-sm">
                      <CalendarClock className="w-4 h-4 text-yellow-400" />
                      <span className="font-semibold">{brief.meeting.title}</span>
                      <span className="text-zinc-400 text-xs">· {fmt(brief.meeting.start_at)}</span>
                    </div>
                  )}
                  <div data-testid="meeting-prep-brief" className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{brief.brief}</div>
                  <button onClick={() => setBrief(null)} className="mt-3 text-xs text-zinc-400 hover:text-white">← Back</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
