import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { X, Sparkles, Calculator, Megaphone, Briefcase, Scale } from "lucide-react";
import safeStorage from "@/lib/safeStorage";

/**
 * EmployeeCrossSell — a slim, dismissible "meet this AI employee" banner that
 * docks just under the top-right credits pill. It only shows to FREE-plan
 * workspaces (an upsell) and never on an open chat (the in-chat SmartHireBanner
 * covers that context, and a floating card would overlap the composer).
 *
 * Auto-hides after a few seconds so it never lingers over content. Dismissing
 * remembers the choice for 3 days.
 *
 * Lives at the top of AppShell so it sees every authenticated route.
 */
const EMPLOYEE_PITCHES = {
  cmo: {
    name: "AI CMO",
    icon: Megaphone,
    iconColor: "text-amber-300",
    pitch: "One-line brief → a 30-day marketing calendar. $149/mo · 7-day free trial.",
    cta: "Try AI CMO",
  },
  sales: {
    name: "AI Sales Employee",
    icon: Briefcase,
    iconColor: "text-emerald-300",
    pitch: "Research prospects, draft cold emails, build follow-ups. $99/mo · 7-day free trial.",
    cta: "Try AI Sales",
  },
  paralegal: {
    name: "AI Paralegal",
    icon: Scale,
    iconColor: "text-violet-300",
    pitch: "Extract every deadline + red flag from contracts. $199/mo · 7-day free trial.",
    cta: "Try AI Paralegal",
  },
  bookkeeper: {
    name: "AI QuickBooks Bookkeeper",
    icon: Calculator,
    iconColor: "text-amber-300",
    pitch: "Upload a CSV — AI categorizes rows and syncs to QuickBooks. $249/mo · 7-day free trial.",
    cta: "Try AI Bookkeeper",
  },
};

const DISMISS_DAYS = 3;
const AUTO_HIDE_MS = 10000;
const SUPPRESS_PATHS = ["/employees", "/bookkeeper", "/sms", "/login", "/signup", "/billing"];

function isDismissed(key) {
  const ts = safeStorage.getNumber(`crosssell-${key}`, 0);
  if (!ts) return false;
  const age = Date.now() - ts;
  return age >= 0 && age < DISMISS_DAYS * 86400 * 1000;
}

function dismiss(key) {
  safeStorage.set(`crosssell-${key}`, Date.now());
}

export default function EmployeeCrossSell() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [pitch, setPitch] = useState(null);
  const [isFree, setIsFree] = useState(null);

  // Plan gate — this nudge is a free-plan upsell only.
  useEffect(() => {
    let cancelled = false;
    api
      .get("/billing/usage")
      .then(({ data }) => {
        if (!cancelled) setIsFree(data?.plan_id === "free" && !data?.unlimited);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Never on an open chat (in-chat banner covers it), suppressed paths, or
    // for paid workspaces. `isFree === null` = plan not known yet → wait.
    const onOpenChat = /^\/chats\/[^/]+/.test(pathname);
    if (
      isFree !== true ||
      onOpenChat ||
      SUPPRESS_PATHS.some((p) => pathname.startsWith(p)) ||
      pathname.startsWith("/dev-os/projects/")
    ) {
      setPitch(null);
      return undefined;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/ai-employees");
        if (cancelled) return;
        const unsubscribed = (data.employees || []).filter(
          (e) => e.status === "active" && !e.subscription && !isDismissed(e.key) && EMPLOYEE_PITCHES[e.key],
        );
        if (unsubscribed.length === 0) return;
        const day = Math.floor(Date.now() / 86400000);
        const choice = unsubscribed[day % unsubscribed.length];
        setPitch({ key: choice.key, ...EMPLOYEE_PITCHES[choice.key] });
      } catch {
        /* ignore — not logged in / no employees */
      }
    }, 3500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pathname, isFree]);

  // Auto-hide so the banner never lingers (soft hide — may resurface later).
  useEffect(() => {
    if (!pitch) return undefined;
    const t = setTimeout(() => setPitch(null), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [pitch]);

  if (!pitch) return null;
  const Icon = pitch.icon;
  return (
    <div
      data-testid="employee-cross-sell"
      className="fixed top-[60px] right-3 z-30 w-[300px] max-w-[calc(100vw-24px)] animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <div className="flex items-start gap-2.5 rounded-xl bg-surface-1/95 backdrop-blur border border-hairline shadow-2xl px-3 py-2.5">
        <div className={`w-8 h-8 rounded-full bg-bg flex items-center justify-center shrink-0 ${pitch.iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-ink-dim">
            <Sparkles className="w-2.5 h-2.5" /> AI Employee · free-plan pick
          </div>
          <div className="text-[13px] font-semibold text-ink leading-tight truncate">Meet {pitch.name}</div>
          <p className="text-[11px] text-ink-dim leading-snug mt-0.5 line-clamp-2">{pitch.pitch}</p>
          <button
            data-testid="cross-sell-cta"
            onClick={() => {
              dismiss(pitch.key);
              nav("/employees");
            }}
            className="mt-1.5 h-7 px-3 rounded-full bg-brand text-black hover:bg-brand-deep font-mono uppercase text-[10px] tracking-widest inline-flex items-center gap-1"
          >
            {pitch.cta} →
          </button>
        </div>
        <button
          onClick={() => {
            dismiss(pitch.key);
            setPitch(null);
          }}
          data-testid="cross-sell-dismiss"
          aria-label="Dismiss"
          className="text-ink-dim hover:text-ink shrink-0 -mt-0.5 -mr-0.5 p-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
