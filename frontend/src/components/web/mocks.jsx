/** Product surface mocks — all SVG/CSS based, no screenshots. */
import { Sparkles, Hash, Pin, Plus, ListChecks, Mic, Phone, Folder, MessageSquare, AtSign, Send } from "lucide-react";

/** Mini chat list panel (used in hero left-side of the product surface). */
export function ChatListPanel({ active = "launch" }) {
  const chats = [
    { id: "ai", title: "My AI assistant", preview: "✦ ChatGPT, Claude, Gemini…", avatar: "★", color: "from-purple-400 to-pink-400", ai: true },
    { id: "launch", title: "Q2 product launch", preview: "Sam: synthesized answer pinned", avatar: "Q", color: "from-rose-400 to-orange-400" },
    { id: "hiring", title: "Engineering hiring", preview: "Priya: pipeline review notes", avatar: "E", color: "from-emerald-400 to-teal-400" },
    { id: "marketing", title: "Marketing site refresh", preview: "Raj: hero copy locked", avatar: "M", color: "from-sky-400 to-indigo-400" },
  ];
  return (
    <div className="w-full h-full flex flex-col bg-[var(--w-surface-2)]">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <span className="text-[15px] font-bold text-[var(--w-text)]">Chats</span>
        <div className="w-7 h-7 rounded-full bg-[var(--w-surface-3)] flex items-center justify-center text-[var(--w-text-dim)]">
          <Plus className="w-4 h-4" />
        </div>
      </div>
      <div className="px-3 py-2">
        <div className="h-9 rounded-full bg-[var(--w-surface)] border border-[var(--w-hairline)] px-3 flex items-center text-[12px] text-[var(--w-text-mute)]">
          Search chats, people, AI
        </div>
      </div>
      <div className="px-2 mt-1 flex-1 overflow-hidden">
        {chats.map((c) => (
          <div
            key={c.id}
            className={`flex items-center gap-3 h-14 px-2 rounded-[12px] ${
              c.id === active ? "bg-[var(--w-surface)]" : "bg-transparent"
            }`}
          >
            <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${c.color} text-white flex items-center justify-center text-[13px] font-bold shrink-0`}>
              {c.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="text-[13px] font-semibold text-[var(--w-text)] truncate">{c.title}</div>
                {c.ai && (
                  <span className="text-[8px] uppercase tracking-widest font-bold text-[var(--w-ai)] border border-[var(--w-ai)]/40 px-1 rounded">AI</span>
                )}
              </div>
              <div className="text-[11px] text-[var(--w-text-mute)] truncate">{c.preview}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Group-chat message + AI-compare card (used right side of hero). */
export function ChatDetailWithCompare() {
  return (
    <div className="w-full h-full flex flex-col bg-[var(--w-surface)]">
      {/* Header */}
      <div className="h-14 px-4 flex items-center gap-3 border-b border-[var(--w-hairline)]">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-400 to-orange-400 text-white flex items-center justify-center text-[13px] font-bold">Q</div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-[var(--w-text)]">Q2 product launch</div>
          <div className="text-[11px] text-[var(--w-text-mute)]">Sam, Priya, Raj · pricing &amp; markets</div>
        </div>
        <Phone className="w-4 h-4 text-[var(--w-text-mute)]" />
        <Mic className="w-4 h-4 text-[var(--w-text-mute)]" />
      </div>

      {/* Messages */}
      <div className="flex-1 px-4 py-4 space-y-3 overflow-hidden">
        {/* User message */}
        <div className="flex justify-end">
          <div className="max-w-[80%] bg-[var(--w-brand-tint)] text-[var(--w-text)] rounded-[14px] rounded-tr-[4px] px-3.5 py-2 text-[13px] leading-5">
            @ai compare 3 — should we launch the Pro tier in the US or EU first?
          </div>
        </div>

        {/* AI compare card */}
        <AICompareCard />

        {/* Synth pill */}
        <div className="flex justify-start ml-1">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--w-brand)] text-black font-semibold text-[13px] shadow-[0_8px_24px_-8px_rgba(255,210,63,0.4)] hover:scale-[1.02] transition-transform">
            <Sparkles className="w-4 h-4" />
            Synthesize best answer
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="px-4 py-3 border-t border-[var(--w-hairline)] flex items-center gap-2">
        <div className="flex-1 h-10 rounded-full bg-[var(--w-surface-2)] border border-[var(--w-hairline)] px-4 flex items-center text-[13px] text-[var(--w-text-mute)]">
          Type a message…
        </div>
        <div className="w-10 h-10 rounded-full bg-[var(--w-brand)] flex items-center justify-center">
          <Send className="w-4 h-4 text-black" />
        </div>
      </div>
    </div>
  );
}

/** The 3-column AI compare card inside the chat. */
export function AICompareCard() {
  const cols = [
    { model: "GPT-4o", color: "text-emerald-300 border-emerald-400/30 bg-emerald-400/5", confidence: 84, text: "US first. The SMB market is 4× larger and pricing tolerance is higher for early SaaS adopters." },
    { model: "Claude Sonnet", color: "text-orange-300 border-orange-400/30 bg-orange-400/5", confidence: 91, text: "US for the launch wave, then EU in Q3 once GDPR-grade DPA + sub-processors are signed." },
    { model: "Gemini Pro", color: "text-sky-300 border-sky-400/30 bg-sky-400/5", confidence: 78, text: "Both viable. EU has higher ACV; US has volume. Lead with US for halo effect, then expand." },
  ];
  return (
    <div className="border border-[var(--w-hairline)] bg-[var(--w-surface-2)] rounded-[16px] overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-[var(--w-hairline)]">
        <Sparkles className="w-3.5 h-3.5 text-[var(--w-ai)]" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--w-ai)]">AI Compare · 3 models</span>
      </div>
      <div className="grid grid-cols-3 gap-px bg-[var(--w-hairline)]">
        {cols.map((c) => (
          <div key={c.model} className="bg-[var(--w-surface)] p-3 flex flex-col gap-2 min-h-[120px]">
            <span className={`inline-flex self-start items-center px-2 py-0.5 rounded-md border text-[10px] font-mono font-semibold ${c.color}`}>
              {c.model}
            </span>
            <p className="text-[11px] leading-[1.45] text-[var(--w-text-dim)] flex-1">
              {c.text}
            </p>
            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-1 rounded-full bg-[var(--w-surface-3)] overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[var(--w-brand)] to-[var(--w-ai)]" style={{ width: `${c.confidence}%` }} />
              </div>
              <span className="text-[9px] font-mono text-[var(--w-text-mute)]">{c.confidence}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Wide 6-model comparison strip — the hook section. */
export function SixModelStrip() {
  const models = [
    { name: "GPT-4o", color: "from-emerald-400 to-emerald-500", confidence: 84, text: "US first. SMB market is 4× larger and pricing tolerance is higher." },
    { name: "Claude Sonnet", color: "from-orange-400 to-orange-500", confidence: 91, text: "US for the launch wave — EU in Q3 once GDPR-grade DPA is signed." },
    { name: "Gemini Pro", color: "from-sky-400 to-sky-500", confidence: 78, text: "Both viable. EU has higher ACV; US has volume. Lead US for halo." },
    { name: "DeepSeek", color: "from-indigo-400 to-indigo-500", confidence: 73, text: "EU. Lower CAC + easier compliance with a single regulator." },
    { name: "Perplexity", color: "from-teal-400 to-teal-500", confidence: 81, text: "US. Recent data shows 28% YoY SMB SaaS growth in our category." },
    { name: "Grok", color: "from-purple-400 to-purple-500", confidence: 76, text: "US if budget allows full-stack support. Otherwise pilot EU first." },
  ];
  const synth = "US first — capture SMB volume now, then expand to EU in Q3 once SOC 2 + DPA are signed.";
  return (
    <div className="rounded-[20px] border border-[var(--w-hairline)] bg-[var(--w-surface)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--w-hairline)] flex items-center gap-2 sticky top-16 bg-[var(--w-surface)] z-[1]">
        <AtSign className="w-4 h-4 text-[var(--w-brand)]" />
        <span className="text-[14px] font-semibold text-[var(--w-text)]">
          Should we launch the Pro tier in the US or EU first?
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-[var(--w-hairline)] divide-y md:divide-y-0">
        {models.map((m) => (
          <div key={m.name} className="p-4 min-h-[160px] flex flex-col gap-2">
            <span className="inline-flex self-start items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold text-[var(--w-text)]">
              <span className={`w-2 h-2 rounded-full bg-gradient-to-br ${m.color}`} />
              {m.name}
            </span>
            <p className="text-[11px] leading-[1.5] text-[var(--w-text-dim)] flex-1">
              {m.text}
            </p>
            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-1 rounded-full bg-[var(--w-surface-3)] overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[var(--w-brand)] to-[var(--w-ai)]" style={{ width: `${m.confidence}%` }} />
              </div>
              <span className="text-[9px] font-mono text-[var(--w-text-mute)]">{m.confidence}%</span>
            </div>
          </div>
        ))}
      </div>
      <div className="p-5 border-t-2 border-[var(--w-ai)] bg-gradient-to-r from-[var(--w-ai-tint)] to-transparent">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--w-ai-tint)] border border-[var(--w-ai)]/40 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-[var(--w-ai)]" />
          </div>
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-widest font-bold text-[var(--w-ai)] mb-1">Synthesized answer</div>
            <p className="text-[14px] leading-6 text-[var(--w-text)]">{synth}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Group chat mock for feature card A. */
export function GroupChatMock() {
  const msgs = [
    { who: "Priya", color: "from-rose-400 to-orange-400", text: "Q2 launch plan is looking tight." },
    { who: "Sam", color: "from-emerald-400 to-teal-400", text: "@task assign Raj — finalise launch vendor SLA by Mar 15", isTask: true },
    { who: "Raj", color: "from-sky-400 to-indigo-400", text: "On it 👍" },
  ];
  return (
    <div className="rounded-[16px] border border-[var(--w-hairline)] bg-[var(--w-surface-2)] p-4 space-y-3">
      {msgs.map((m, i) => (
        <div key={`${m.who}-${i}`} className="flex items-start gap-2.5">
          <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${m.color} text-white flex items-center justify-center text-[11px] font-bold shrink-0`}>
            {m.who[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-[var(--w-text)]">{m.who}</div>
            <p className="text-[13px] text-[var(--w-text)] leading-5">
              {m.isTask ? (
                <>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--w-brand-tint)] text-[var(--w-brand)] text-[10px] font-bold mr-1">
                    <ListChecks className="w-3 h-3" />@task
                  </span>
                  assign Raj — finalise launch vendor SLA by Mar 15
                </>
              ) : (
                m.text
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Task card mock for feature card B. */
export function TaskCardMock() {
  return (
    <div className="rounded-[14px] border border-[var(--w-hairline)] bg-[var(--w-surface-2)] p-4">
      <div className="flex items-start gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-[var(--w-red)] mt-2 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-[var(--w-text)]">Finalise launch vendor SLA</div>
          <div className="text-[11px] text-[var(--w-text-mute)] mt-0.5">Q2 product launch · created from chat</div>
        </div>
        <span className="px-2 py-0.5 rounded-md bg-[var(--w-surface-3)] text-[10px] font-mono uppercase text-[var(--w-text-dim)]">
          In progress
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex -space-x-1.5">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-sky-400 to-indigo-400 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[var(--w-surface-2)]">R</div>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--w-brand-tint)] text-[var(--w-brand)] text-[10px] font-semibold">
          Due Mar 15
        </span>
      </div>
    </div>
  );
}

/** Call transcript mock for feature card C. */
export function CallTranscriptMock() {
  const lines = [
    { who: "Priya", t: "10:14", text: "Two scenarios on the table: US launch in March or EU launch in May." },
    { who: "Sam", t: "10:14", text: "What's the ACV delta?" },
    { who: "Raj", t: "10:15", text: "About 38% — EU 1 enterprise deal ≈ US 2 SMB deals.", highlight: "decision" },
  ];
  return (
    <div className="rounded-[14px] border border-[var(--w-hairline)] bg-[var(--w-surface-2)] p-4 space-y-2.5">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full bg-[var(--w-red)] animate-pulse" />
        <span className="text-[11px] uppercase tracking-widest font-bold text-[var(--w-text-dim)]">Live transcript</span>
      </div>
      {lines.map((l, i) => (
        <div key={`${l.t}-${i}`} className={`flex items-start gap-2 ${l.highlight ? "border-l-2 border-[var(--w-brand)] pl-2 -ml-2 bg-[var(--w-brand-tint)] py-1 rounded-r-md" : ""}`}>
          <span className="text-[10px] font-mono text-[var(--w-text-mute)] mt-0.5">{l.t}</span>
          <div className="flex-1 min-w-0">
            <span className="text-[12px] font-semibold text-[var(--w-brand)] mr-1.5">{l.who}</span>
            <span className="text-[12px] text-[var(--w-text)] leading-5">{l.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Project folder tabs mock for feature card D. */
export function FolderTabsMock() {
  const tabs = ["Overview", "Chats", "Research", "Tasks", "Files"];
  return (
    <div className="rounded-[14px] border border-[var(--w-hairline)] bg-[var(--w-surface-2)]">
      <div className="px-4 pt-3 flex items-center gap-2 border-b border-[var(--w-hairline)]">
        <Folder className="w-4 h-4 text-[var(--w-brand)]" />
        <span className="text-[13px] font-semibold text-[var(--w-text)]">Q2 product launch — Pro tier</span>
      </div>
      <div className="flex border-b border-[var(--w-hairline)]">
        {tabs.map((t, i) => (
          <div
            key={t}
            className={`px-3 py-2.5 text-[12px] font-medium ${
              i === 0 ? "text-[var(--w-brand)] border-b-2 border-[var(--w-brand)] -mb-px" : "text-[var(--w-text-mute)]"
            }`}
          >
            {t}
          </div>
        ))}
      </div>
      <div className="p-4 grid grid-cols-3 gap-2">
        {[
          { icon: MessageSquare, label: "12 chats" },
          { icon: ListChecks, label: "8 tasks" },
          { icon: Sparkles, label: "5 syntheses" },
        ].map((s) => (
          <div key={s.label} className="rounded-[10px] bg-[var(--w-surface)] border border-[var(--w-hairline)] p-2.5">
            <s.icon className="w-3.5 h-3.5 text-[var(--w-text-dim)] mb-1" />
            <div className="text-[11px] font-semibold text-[var(--w-text)]">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
