import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ArrowRight, ArrowLeft, ChevronRight, ListChecks } from "lucide-react";
import { WALKTHROUGHS, getWalkthrough } from "@/lib/walkthroughs";
import { openSetupChecklist } from "@/lib/showMeHow";

/** Global host for the "Show Me How" walkthroughs. Mounted once in AppShell;
 *  opened from anywhere via window events (see lib/showMeHow.js). */
export default function ShowMeHow() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null); // walkthrough object, or null = menu
  const [step, setStep] = useState(0);

  useEffect(() => {
    const onMenu = () => {
      setActive(null);
      setStep(0);
      setOpen(true);
    };
    const onGuide = (e) => {
      const w = getWalkthrough(e?.detail?.id);
      if (!w) return;
      setActive(w);
      setStep(0);
      setOpen(true);
    };
    window.addEventListener("tn:show-me-how", onMenu);
    window.addEventListener("tn:walkthrough", onGuide);
    return () => {
      window.removeEventListener("tn:show-me-how", onMenu);
      window.removeEventListener("tn:walkthrough", onGuide);
    };
  }, []);

  const close = () => setOpen(false);

  const goTo = (to) => {
    close();
    nav(to);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-[#141414] border-white/10 text-white max-w-lg">
        <DialogTitle className="sr-only">Show Me How</DialogTitle>
        {!active ? (
          <MenuView
            onPick={(w) => {
              setActive(w);
              setStep(0);
            }}
            onChecklist={() => {
              close();
              openSetupChecklist();
              nav("/dashboard");
            }}
          />
        ) : (
          <GuideView
            w={active}
            step={step}
            setStep={setStep}
            onBackToMenu={() => setActive(null)}
            onGoTo={goTo}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MenuView({ onPick, onChecklist }) {
  return (
    <div data-testid="show-me-how-menu">
      <div className="mb-1 text-[11px] font-mono uppercase tracking-widest text-yellow-400">Show Me How</div>
      <h2 className="font-display text-xl font-bold tracking-tight mb-4">Learn TeamNest in a minute</h2>
      <div className="space-y-2">
        {WALKTHROUGHS.map((w) => (
          <button
            key={w.id}
            type="button"
            data-testid={`smh-guide-${w.id}`}
            onClick={() => onPick(w)}
            className="w-full text-left flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] p-3 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-white/5 text-zinc-200 flex items-center justify-center shrink-0">
              <w.icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{w.title}</div>
              <div className="text-[12px] text-zinc-500 truncate">{w.blurb}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
          </button>
        ))}
      </div>
      <button
        type="button"
        data-testid="smh-open-checklist"
        onClick={onChecklist}
        className="mt-3 w-full flex items-center gap-2 justify-center rounded-xl border border-yellow-400/30 bg-yellow-400/[0.06] hover:bg-yellow-400/[0.12] text-yellow-300 p-2.5 text-sm font-semibold"
      >
        <ListChecks className="w-4 h-4" /> Open my setup checklist
      </button>
    </div>
  );
}

function GuideView({ w, step, setStep, onBackToMenu, onGoTo }) {
  const total = w.steps.length;
  const last = step === total - 1;
  const s = w.steps[step];
  return (
    <div data-testid="show-me-how-guide">
      <button
        type="button"
        onClick={onBackToMenu}
        className="flex items-center gap-1 text-[11px] font-mono uppercase tracking-widest text-zinc-500 hover:text-white mb-3"
      >
        <ArrowLeft className="w-3 h-3" /> All guides
      </button>

      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-yellow-400 text-black flex items-center justify-center shrink-0">
          <w.icon className="w-5 h-5" strokeWidth={1.8} />
        </div>
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">
            Step {step + 1} of {total}
          </div>
          <h2 className="font-display text-lg font-bold tracking-tight">{w.title}</h2>
        </div>
      </div>

      {/* progress dots */}
      <div className="flex gap-1.5 mb-5">
        {w.steps.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= step ? "bg-yellow-400" : "bg-white/10"}`}
          />
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 mb-5 min-h-[92px]">
        <div className="text-sm font-semibold mb-1">{s.title}</div>
        <p className="text-[13px] text-zinc-400 leading-relaxed">{s.body}</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid="smh-prev"
          onClick={() => setStep((v) => Math.max(0, v - 1))}
          disabled={step === 0}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed text-sm h-9 px-3 text-zinc-300"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {last ? (
          <button
            type="button"
            data-testid="smh-goto"
            onClick={() => onGoTo(w.cta.to)}
            className="flex items-center gap-1.5 rounded-lg bg-yellow-400 text-black hover:bg-yellow-300 font-semibold text-sm h-9 px-4"
          >
            {w.cta.label} <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            data-testid="smh-next"
            onClick={() => setStep((v) => Math.min(total - 1, v + 1))}
            className="flex items-center gap-1.5 rounded-lg bg-yellow-400 text-black hover:bg-yellow-300 font-semibold text-sm h-9 px-4"
          >
            Next <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
