import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import safeStorage from "@/lib/safeStorage";
import { openWalkthrough } from "@/lib/showMeHow";
import { Check, ChevronDown, X, Rocket, ArrowRight, PartyPopper } from "lucide-react";

const DISMISS_KEY = "tn:checklist:dismissed";
const FORCE_KEY = "tn:checklist:force";
const CELEBRATE_KEY = "tn:checklist:celebrated";
const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const ITEMS = [
  { key: "first_chat", label: "Send your first chat", to: "/chats?new=chat" },
  { key: "started_research", label: "Start your first AI Research", to: "/research", wt: "research" },
  { key: "compared_models", label: "Compare two AI models", to: "/research", wt: "research" },
  { key: "hosted_meeting", label: "Host a meeting", to: "/calls", wt: "meetings" },
  { key: "uploaded_document", label: "Upload a document", to: "/knowledge" },
  { key: "created_task", label: "Create a task", to: "/tasks?new=1" },
  { key: "saved_memory", label: "Save something to memory", to: "/ai-memory", wt: "memory" },
];

function withinNewWindow(user) {
  const c = user?.created_at;
  if (!c) return false;
  const t = new Date(c).getTime();
  return Number.isFinite(t) && Date.now() - t < NEW_WINDOW_MS;
}

/** "Get more from TeamNest" checklist. Auto-ticks from real activity, deep-links
 *  into each feature, re-openable from Show Me How, and celebrates completion. */
export default function SetupChecklist() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [forced, setForced] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [dismissed, setDismissed] = useState(() => safeStorage.get(DISMISS_KEY) === "1");
  const [celebrated, setCelebrated] = useState(() => safeStorage.get(CELEBRATE_KEY) === "1");

  const load = useCallback(() => {
    api.get("/home/checklist").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  const forceOpen = useCallback(() => {
    safeStorage.set(DISMISS_KEY, "0");
    setDismissed(false);
    setForced(true);
    setCollapsed(false);
    load();
  }, [load]);

  useEffect(() => {
    load();
    if (safeStorage.get(FORCE_KEY) === "1") {
      safeStorage.set(FORCE_KEY, "0");
      forceOpen();
    }
    window.addEventListener("tn:open-checklist", forceOpen);
    return () => window.removeEventListener("tn:open-checklist", forceOpen);
  }, [load, forceOpen]);

  const allDone = !!data && data.complete >= data.total;
  const isNew = withinNewWindow(user);

  // First time everything's done (for someone who's actually seeing the
  // checklist), throw a small confetti party — once, ever.
  useEffect(() => {
    if (!allDone || celebrated || !(forced || isNew)) return;
    setCelebrating(true);
    setCelebrated(true);
    safeStorage.set(CELEBRATE_KEY, "1");
    const fire = () =>
      confetti({ particleCount: 130, spread: 75, origin: { y: 0.35 }, colors: ["#facc15", "#fde68a", "#ffffff"] });
    fire();
    const t = setTimeout(fire, 250);
    return () => clearTimeout(t);
  }, [allDone, celebrated, forced, isNew]);

  if (!data) return null;

  const visible = forced || celebrating || (isNew && !dismissed && !allDone);
  if (!visible) return null;

  const showCelebration = allDone && (celebrating || forced);
  const pct = Math.round((data.complete / data.total) * 100);

  const dismiss = () => {
    safeStorage.set(DISMISS_KEY, "1");
    setDismissed(true);
    setForced(false);
    setCelebrating(false);
  };

  if (showCelebration) {
    return (
      <div
        data-testid="setup-checklist"
        className="rounded-2xl border border-yellow-400/30 bg-gradient-to-b from-yellow-400/[0.10] to-transparent mb-6 p-6 text-center relative"
      >
        <button
          type="button"
          data-testid="checklist-dismiss"
          onClick={dismiss}
          className="absolute right-3 top-3 text-zinc-500 hover:text-white p-1 rounded-md hover:bg-white/5"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="mx-auto w-12 h-12 rounded-2xl bg-yellow-400 text-black flex items-center justify-center mb-3">
          <PartyPopper className="w-6 h-6" strokeWidth={1.8} />
        </div>
        <div className="font-display text-xl font-bold tracking-tight" data-testid="checklist-celebration">
          You're a TeamNest pro! 🎉
        </div>
        <p className="text-sm text-zinc-400 mt-1">You've completed all {data.total} setup steps. Nice work.</p>
        <button
          type="button"
          data-testid="checklist-celebrate-done"
          onClick={dismiss}
          className="mt-4 rounded-lg bg-yellow-400 text-black hover:bg-yellow-300 font-semibold text-sm h-9 px-5"
        >
          Awesome
        </button>
      </div>
    );
  }

  return (
    <div data-testid="setup-checklist" className="rounded-2xl border border-white/10 bg-[#0c0c0e] mb-6 overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <div className="w-9 h-9 rounded-lg bg-yellow-400 text-black flex items-center justify-center shrink-0">
          <Rocket className="w-[18px] h-[18px]" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-bold tracking-tight">Get more from TeamNest</div>
          <div className="text-[12px] text-zinc-500">{`${data.complete} of ${data.total} complete`}</div>
        </div>
        <div className="hidden sm:block w-40">
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-yellow-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button
          type="button"
          data-testid="checklist-toggle"
          onClick={() => setCollapsed((c) => !c)}
          className="text-zinc-500 hover:text-white p-1 rounded-md hover:bg-white/5"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        </button>
        <button
          type="button"
          data-testid="checklist-dismiss"
          onClick={dismiss}
          className="text-zinc-500 hover:text-white p-1 rounded-md hover:bg-white/5"
          title="Hide — re-open from Show Me How"
          aria-label="Hide checklist"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {!collapsed && (
        <div className="border-t border-white/5 divide-y divide-white/5">
          {ITEMS.map((it) => {
            const done = !!data.items?.[it.key];
            return (
              <div key={it.key} data-testid={`checklist-item-${it.key}`} className="flex items-center gap-3 px-4 py-2.5">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    done ? "bg-yellow-400 text-black" : "border border-white/20 text-transparent"
                  }`}
                >
                  <Check className="w-3 h-3" strokeWidth={3} />
                </div>
                <span className={`text-sm flex-1 min-w-0 truncate ${done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>
                  {it.label}
                </span>
                {it.wt && !done && (
                  <button
                    type="button"
                    data-testid={`checklist-show-${it.key}`}
                    onClick={() => openWalkthrough(it.wt)}
                    className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 hover:text-white"
                  >
                    Show me
                  </button>
                )}
                {!done && (
                  <button
                    type="button"
                    data-testid={`checklist-go-${it.key}`}
                    onClick={() => nav(it.to)}
                    className="flex items-center gap-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold h-7 px-2.5 text-white"
                  >
                    Go <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
