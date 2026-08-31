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

/**
 * First-run layout picker. When a new user lands on Home for the first time
 * (no explicit layout chosen yet), a centered modal presents all four looks so
 * they set their default up front. Shows once; changeable later from the
 * top-bar "Change layout" switcher. Dispatches `tn:layout-onboarded` on finish
 * so the welcome-tips tour can open afterwards.
 */
export default function HomeLayoutOnboarding() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState("start");

  useEffect(() => {
    if (!user) return;
    if (!hasStoredVariant() && !isLayoutOnboarded(user)) {
      setPicked(getHomeVariant(user)); // highlight the current default
      setOpen(true);
    }
  }, [user]);

  const finish = (value) => {
    if (value) setHomeVariant(value);
    markLayoutOnboarded(user);
    setOpen(false);
    window.dispatchEvent(new Event("tn:layout-onboarded"));
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      data-testid="layout-onboarding"
    >
      <div className="w-full max-w-2xl bg-[#101013] border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-amber-300 mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Make it yours
          </div>
          <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">
            Choose your Home layout{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h2>
          <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
            Pick the style you like best. You can switch anytime from{" "}
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
                onClick={() => setPicked(l.value)}
                className={`text-left rounded-xl p-4 border transition-all flex items-start gap-3 active:scale-[0.99] ${
                  active
                    ? "border-amber-400/60 bg-amber-400/10 ring-1 ring-amber-400/40"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20"
                }`}
              >
                <span
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    active ? "bg-amber-400/20 text-amber-200" : "bg-white/5 text-zinc-300"
                  }`}
                >
                  <I className="w-5 h-5" strokeWidth={1.8} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[15px] font-semibold text-white">{l.label}</span>
                    {active && <Check className="w-4 h-4 text-amber-300" />}
                  </span>
                  <span className="block text-[12.5px] text-zinc-400 mt-0.5 leading-snug">{l.desc}</span>
                </span>
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
            Skip
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
