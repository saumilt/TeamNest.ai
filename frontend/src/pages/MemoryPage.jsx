import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Brain, Plus, Trash2, Loader2, Sparkles, Building2, User } from "lucide-react";
import { api } from "@/lib/api";
import AIConversationSettings from "@/components/AIConversationSettings";

function MemoryList({ title, icon: Icon, items, scope, onChange }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await api.post("/memory/learned", { text, scope }); setText(""); toast.success("Memory saved"); onChange(); }
    catch { toast.error("Failed to save"); } finally { setBusy(false); }
  };
  const toggle = async (m) => {
    try { await api.patch(`/memory/learned/${m.id}`, { active: !m.active }); onChange(); }
    catch { toast.error("Failed"); }
  };
  const remove = async (m) => {
    try { await api.delete(`/memory/learned/${m.id}`); toast.success("Forgotten"); onChange(); }
    catch { toast.error("Failed"); }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-5" data-testid={`memory-${scope}`}>
      <h2 className="text-sm font-bold text-ink mb-1 flex items-center gap-2"><Icon className="w-4 h-4 text-ai" /> {title}</h2>
      <p className="text-xs text-ink-mute mb-4">{scope === "personal" ? "How you like the AI to work with you — applied to your answers." : "Shared facts about your team the AI uses for everyone."}</p>
      <div className="flex gap-2 mb-4">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          data-testid={`memory-add-input-${scope}`} placeholder="Add something to remember…"
          className="flex-1 h-10 rounded-xl bg-bg border border-line px-3 text-ink text-sm" />
        <button onClick={add} disabled={busy || !text.trim()} data-testid={`memory-add-btn-${scope}`}
          className="h-10 px-3 rounded-xl bg-ai text-black font-bold flex items-center gap-1 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}</button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-ink-mute">Nothing yet — the AI will learn as you chat, or add items above.</p>
      ) : (
        <div className="space-y-2">
          {items.map((m) => (
            <div key={m.id} className={`flex items-start gap-3 rounded-xl border border-line p-3 ${m.active ? "" : "opacity-50"}`} data-testid={`memory-item-${m.id}`}>
              <input type="checkbox" checked={m.active} onChange={() => toggle(m)} data-testid={`memory-toggle-${m.id}`}
                className="mt-1 accent-[var(--ai)]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink">{m.text}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-ink-mute">{m.kind}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-ink-mute flex items-center gap-1">{m.source === "auto" ? <><Sparkles className="w-2.5 h-2.5" /> learned</> : "added"}</span>
                </div>
              </div>
              <button onClick={() => remove(m)} data-testid={`memory-forget-${m.id}`} className="text-ink-mute hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function MemoryPage() {
  const [data, setData] = useState(null);
  const load = useCallback(() => {
    api.get("/memory/learned").then((r) => setData(r.data)).catch(() => toast.error("Failed to load memory"));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-bg text-ink px-5 pt-16 pb-8 md:px-10" data-testid="memory-page">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <Brain className="w-6 h-6 text-ai" />
          <h1 className="text-2xl font-bold">AI Memory</h1>
        </div>
        <p className="text-sm text-ink-dim mb-6">The AI learns durable facts and preferences from your chats and uses them to give more personalized answers over time. Say <span className="text-ai">&ldquo;@ai remember …&rdquo;</span> in any chat to teach it directly. You&apos;re always in control — uncheck to pause or delete to forget.</p>
        {!data ? <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-ai" /></div> : (
          <div className="space-y-4">
            <MemoryList title="About you" icon={User} items={data.personal} scope="personal" onChange={load} />
            <MemoryList title="About your workspace" icon={Building2} items={data.workspace} scope="workspace" onChange={load} />
            <AIConversationSettings />
          </div>
        )}
      </div>
    </div>
  );
}
