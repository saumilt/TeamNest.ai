import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, Rocket, X } from "lucide-react";

/**
 * AppBuilderPanel — guided plain-English Q&A inside the Builders tab.
 * Four simple questions → composes one instruction for @devmanager.
 */
const STEPS = [
  { key: "purpose", q: "What should your app do?", hint: "e.g. Track customer orders and send invoices", kind: "textarea", required: true },
  { key: "users", q: "Who will use it?", hint: "e.g. My sales team and our customers", kind: "text" },
  { key: "features", q: "What are the key features?", hint: "e.g. Order form", kind: "chips" },
  { key: "style", q: "Any look & feel preferences?", hint: "e.g. Clean and modern, dark theme, our brand is blue", kind: "text" },
];

export default function AppBuilderPanel({ onBuild, busy }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ purpose: "", users: "", features: [], style: "" });
  const [chipDraft, setChipDraft] = useState("");

  const s = STEPS[step];
  const canNext = s.required ? String(answers[s.key]).trim().length > 3 : true;
  const isLast = step === STEPS.length - 1;

  const addChip = () => {
    const v = chipDraft.trim();
    if (!v || answers.features.includes(v)) { setChipDraft(""); return; }
    setAnswers((a) => ({ ...a, features: [...a.features, v] }));
    setChipDraft("");
  };

  const compose = () => {
    const parts = [`Build or update the app so that: ${answers.purpose.trim()}.`];
    if (answers.users.trim()) parts.push(`Primary users: ${answers.users.trim()}.`);
    if (answers.features.length) parts.push(`Must-have features: ${answers.features.join("; ")}.`);
    if (answers.style.trim()) parts.push(`Look & feel: ${answers.style.trim()}.`);
    parts.push("Build all pages, navigation, working forms, demo data and a demo login.");
    return parts.join(" ");
  };

  const set = (v) => setAnswers((a) => ({ ...a, [s.key]: v }));

  return (
    <div className="h-full overflow-y-auto p-4" data-testid="app-builder-panel">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i <= step ? "bg-amber-300 w-8" : "bg-surface-3 w-4"}`} />
          ))}
          <span className="ml-2 text-[11px] text-ink-mute">Step {step + 1} of {STEPS.length}</span>
        </div>

        <div className="rounded-2xl bg-surface ring-1 ring-hairline p-5 space-y-3">
          <div className="text-[16px] font-semibold text-ink">{s.q}</div>
          {s.kind === "textarea" && (
            <textarea
              value={answers[s.key]} onChange={(e) => set(e.target.value)} rows={4} autoFocus
              placeholder={s.hint} data-testid={`ab-input-${s.key}`}
              className="w-full px-4 py-3 rounded-xl bg-surface-2 ring-1 ring-hairline focus:ring-amber-400/40 outline-none text-[14px] text-ink placeholder:text-ink-mute resize-none"
            />
          )}
          {s.kind === "text" && (
            <input
              type="text" value={answers[s.key]} onChange={(e) => set(e.target.value)} autoFocus
              placeholder={s.hint} data-testid={`ab-input-${s.key}`}
              className="w-full h-12 px-4 rounded-xl bg-surface-2 ring-1 ring-hairline focus:ring-amber-400/40 outline-none text-[14px] text-ink placeholder:text-ink-mute"
            />
          )}
          {s.kind === "chips" && (
            <div className="space-y-2.5">
              <div className="flex gap-2">
                <input
                  type="text" value={chipDraft} onChange={(e) => setChipDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChip(); } }}
                  placeholder={s.hint} data-testid="ab-input-features" autoFocus
                  className="flex-1 h-11 px-4 rounded-xl bg-surface-2 ring-1 ring-hairline focus:ring-amber-400/40 outline-none text-[14px] text-ink placeholder:text-ink-mute"
                />
                <button type="button" onClick={addChip} data-testid="ab-add-feature"
                  className="h-11 px-4 rounded-xl bg-surface-2 hover:bg-surface-3 ring-1 ring-hairline text-ink text-[13px] inline-flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
              {answers.features.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {answers.features.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-amber-400/10 ring-1 ring-amber-400/25 text-amber-200 text-[13px]">
                      {f}
                      <button type="button" onClick={() => setAnswers((a) => ({ ...a, features: a.features.filter((x) => x !== f) }))}
                        className="text-amber-200/60 hover:text-amber-100">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="text-[11px] text-ink-mute">Plain English — no tech talk needed. Skip anything optional.</div>
        </div>

        {isLast && answers.purpose.trim() && (
          <div className="rounded-xl bg-amber-400/[0.05] ring-1 ring-amber-400/15 p-3" data-testid="ab-preview">
            <div className="text-[10px] font-mono uppercase tracking-widest text-amber-200/70 mb-1">
              What @devmanager will be told
            </div>
            <div className="text-[12px] text-ink-dim leading-relaxed">{compose()}</div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button type="button" disabled={step === 0} onClick={() => setStep((x) => x - 1)}
            data-testid="ab-back"
            className="h-10 px-4 rounded-pill bg-surface-2 hover:bg-surface-3 ring-1 ring-hairline text-ink-dim text-[13px] inline-flex items-center gap-1.5 disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {!isLast ? (
            <button type="button" disabled={!canNext} onClick={() => setStep((x) => x + 1)}
              data-testid="ab-next"
              className="h-10 px-5 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[13px] inline-flex items-center gap-1.5 disabled:opacity-40">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" disabled={busy || !answers.purpose.trim()}
              onClick={() => onBuild(compose())}
              data-testid="ab-build"
              className="h-10 px-5 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[13px] inline-flex items-center gap-1.5 disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              {busy ? "Building…" : "Build my app"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
