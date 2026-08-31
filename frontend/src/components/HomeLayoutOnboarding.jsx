import { useEffect, useState } from "react";
import { LayoutDashboard, Sparkles, MessageSquareText, Bot, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  HOME_LOOKS,
  getHomeVariant,
  setHomeVariant,
  hasStoredVariant,
  isLayoutOnboarded,
  markLayoutOnboarded,
} from "@/lib/homeVariant";

const ICONS = {
  classic: LayoutDashboard,
  start: Sparkles,
  ask: MessageSquareText,
  focus: Bot,
};

const REOPEN_KEY = "tn:reopen-layout-picker";

/** Tiny live-style wireframe of each layout so people see the shape before
 *  choosing. Pure CSS mini-mockups — amber accents when selected. */
function LayoutThumb({ variant, active }) {
  const cell = active ? "bg-white/[0.09]" : "bg-white/[0.06]";
  const pop = active ? "bg-amber-400/40" : "bg-amber-400/20";
  const line = active ? "bg-white/25" : "bg-white/15";
  const bar = active ? "bg-white/[0.10]" : "bg-white/[0.07]";
  return (
    <div
      className={`h-[74px] w-full rounded-lg overflow-hidden border ${active ? "border-amber-400/40" : "border-white/10"} bg-[#0b0b0d]`}
      aria-hidden="true"
    >
      {variant === "classic" && (
        <div className="flex h-full gap-1 p-1.5">
          <div className="w-2.5 rounded-[3px] bg-white/12" />
          <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-1">
            <div className={`rounded-[3px] ${cell}`} />
            <div className={`rounded-[3px] ${cell}`} />
            <div className={`rounded-[3px] ${pop}`} />
            <div className={`rounded-[3px] ${cell}`} />
          </div>
        </div>
      )}
      {variant === "start" && (
        <div className="flex flex-col h-full p-1.5 gap-1.5">
          <div className={`h-1.5 w-8 rounded-full ${line}`} />
          <div className="flex-1 grid grid-cols-4 gap-1">
            <div className={`rounded-[3px] ${cell}`} />
            <div className={`rounded-[3px] ${cell}`} />
            <div className={`rounded-[3px] ${pop}`} />
            <div className={`rounded-[3px] ${cell}`} />
          </div>
        </div>
      )}
      {variant === "ask" && (
        <div className="flex flex-col items-center justify-center h-full px-3 gap-1.5">
          <div className={`h-1.5 w-10 rounded-full ${line}`} />
          <div className={`h-4 w-full rounded-md border ${active ? "border-amber-400/30" : "border-white/10"} ${bar}`} />
          <div className="flex gap-1">
            <div className={`h-1.5 w-6 rounded-full ${pop}`} />
            <div className={`h-1.5 w-6 rounded-full ${line}`} />
            <div className={`h-1.5 w-6 rounded-full ${line}`} />
          </div>
        </div>
      )}
      {variant === "focus" && (
        <div className="flex flex-col justify-center h-full px-3 gap-2">
          <div className={`h-1.5 w-12 rounded-full mx-auto ${line}`} />
          <div className={`h-5 w-full rounded-md border ${active ? "border-amber-400/30" : "border-white/10"} ${bar}`} />
        </div>
      )}
    </div>
  );
}

/**
 * First-run layout picker. When a new user lands on Home for the first time
 * (no explicit layout chosen yet), a centered modal presents all four looks —
 * each with a live-style thumbnail — so they set their default up front. Shows
 * once; changeable later from the top-bar "Change layout" switcher or Profile →
 * Home layout (which re-opens this picker via sessionStorage / the
 * `tn:open-layout-picker` event). Dispatches `tn:layout-onboarded` on the
 * first-run finish so the welcome-tips tour can open afterwards.
 */
export default function HomeLayoutOnboarding() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState("start");
  const [firstRun, setFirstRun] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Re-opened from Profile → Home layout (one-shot flag survives navigation).
    try {
      if (typeof window !== "undefined" && window.sessionStorage.getItem(REOPEN_KEY) === "1") {
        window.sessionStorage.removeItem(REOPEN_KEY);
        setPicked(getHomeVariant(user));
        setFirstRun(false);
        setOpen(true);
        return;
      }
    } catch { /* ignore */ }
    // Genuine first run: no explicit layout chosen yet.
    if (!hasStoredVariant() && !isLayoutOnboarded(user)) {
      setPicked(getHomeVariant(user));
      setFirstRun(true);
      setOpen(true);
    }
  }, [user]);

  // Reopen on demand while already mounted.
  useEffect(() => {
    const onOpen = () => {
      setPicked(getHomeVariant(user));
      setFirstRun(false);
      setOpen(true);
    };
    window.addEventListener("tn:open-layout-picker", onOpen);
    return () => window.removeEventListener("tn:open-layout-picker", onOpen);
  }, [user]);

  const finish = (value) => {
    if (value) setHomeVariant(value);
    markLayoutOnboarded(user);
    setOpen(false);
    if (firstRun) window.dispatchEvent(new Event("tn:layout-onboarded"));
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      data-testid="layout-onboarding"
    >
      <div className="w-full max-w-2xl bg-[#101013] border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-amber-300 mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Make it yours
          </div>
          <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">
            Choose your Home layout{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h2>
          <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
            Preview each style and pick the one you like best. You can switch anytime from{" "}
            <b className="text-zinc-200">Change layout</b> at the top right.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {HOME_LOOKS.map((l) => {
            const I = ICONS[l.value] || LayoutDashboard;
            const active = picked === l.value;
            return (
              <button
                key={l.value}
                type="button"
                data-testid={`layout-onboarding-${l.value}`}
                aria-pressed={active}
                onClick={() => setPicked(l.value)}
                className={`text-left rounded-xl p-3 border transition-all flex flex-col gap-2.5 active:scale-[0.99] ${
                  active
                    ? "border-amber-400/60 bg-amber-400/10 ring-1 ring-amber-400/40"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20"
                }`}
              >
                <LayoutThumb variant={l.value} active={active} />
                <div className="flex items-start gap-2.5 px-0.5">
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      active ? "bg-amber-400/20 text-amber-200" : "bg-white/5 text-zinc-300"
                    }`}
                  >
                    <I className="w-4 h-4" strokeWidth={1.8} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[14px] font-semibold text-white">{l.label}</span>
                      {active && <Check className="w-3.5 h-3.5 text-amber-300 shrink-0" />}
                    </span>
                    <span className="block text-[12px] text-zinc-400 mt-0.5 leading-snug">{l.desc}</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-6 gap-3">
          <button
            type="button"
            data-testid="layout-onboarding-skip"
            onClick={() => finish(null)}
            className="text-[12px] text-zinc-500 hover:text-zinc-300 font-mono uppercase tracking-widest"
          >
            {firstRun ? "Skip" : "Cancel"}
          </button>
          <button
            type="button"
            data-testid="layout-onboarding-confirm"
            onClick={() => finish(picked)}
            className="h-11 px-6 rounded-lg bg-amber-300 hover:bg-amber-200 text-black font-semibold text-sm active:scale-[0.98] transition-transform"
          >
            Use this layout
          </button>
        </div>
      </div>
    </div>
  );
}
