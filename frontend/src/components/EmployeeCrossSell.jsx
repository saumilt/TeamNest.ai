import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { X, Sparkles, Calculator, Megaphone, Briefcase, Scale, ArrowRight } from "lucide-react";
import safeStorage from "@/lib/safeStorage";
import { fetchEmployeeRecommendation } from "@/hooks/useEmployeeRecommendation";

/**
 * EmployeeCrossSell — rotates a "you haven't tried this AI employee yet" prompt
 * in the bottom-right of authenticated app pages. Auto-shows once per session
 * per employee. Dismissing one employee suggestion remembers the dismissal for 3 days.
 *
 * Lives at the top of AppShell so it sees every authenticated route.
 */
const EMPLOYEE_PITCHES = {
  cmo: {
    name: "AI CMO",
    icon: Megaphone,
    accent: "from-amber-500/20 to-amber-500/0",
    iconColor: "text-amber-300",
    pitch: "Turn a one-line brief into a 30-day marketing calendar. $149/mo · 7-day free trial.",
    cta: "Try AI CMO →",
  },
  sales: {
    name: "AI Sales Employee",
    icon: Briefcase,
    accent: "from-emerald-500/20 to-emerald-500/0",
    iconColor: "text-emerald-300",
    pitch: "Research prospects, draft cold emails, build follow-up sequences. $99/mo · 7-day free trial.",
    cta: "Try AI Sales →",
  },
  paralegal: {
    name: "AI Paralegal",
    icon: Scale,
    accent: "from-violet-500/20 to-violet-500/0",
    iconColor: "text-violet-300",
    pitch: "Extract every deadline + red flag from contracts. Save your attorney 4 hours. $199/mo · 7-day free trial.",
    cta: "Try AI Paralegal →",
  },
  bookkeeper: {
    name: "AI QuickBooks Bookkeeper",
    icon: Calculator,
    accent: "from-amber-500/20 to-amber-500/0",
    iconColor: "text-amber-300",
    pitch: "Upload a CSV. AI categorizes every row, asks staff in chat, syncs to QuickBooks. $249/mo · 7-day free trial.",
    cta: "Try AI Bookkeeper →",
  },
};

const DISMISS_DAYS = 3;
const SUPPRESS_PATHS = ["/employees", "/bookkeeper", "/sms", "/login", "/signup"];

function isDismissed(key) {
  // Validate the stored timestamp is a recent, plausible epoch ms — otherwise
  // treat as un-dismissed so a tampered/corrupt value re-shows the pitch
  // gracefully instead of suppressing it forever.
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

  useEffect(() => {
    if (SUPPRESS_PATHS.some((p) => pathname.startsWith(p))) {
      setPitch(null);
      return;
    }

    // On an open chat, mirror the content-aware recommendation so this nudge
    // matches what the chat is about (instead of the generic day-rotation).
    // For a devmanager/no-match chat we stay silent — the in-chat SmartHireBanner
    // already covers it, so we don't double up or contradict it.
    const chatMatch = pathname.match(/^\/chats\/([^/]+)/);
    if (chatMatch) {
      let cancelled = false;
      fetchEmployeeRecommendation(chatMatch[1]).then((d) => {
        if (cancelled) return;
        const r = d.recommendation;
        const key = `reco-${chatMatch[1]}`;
        if (r && (r.kind === "marketplace" || r.kind === "employee") && !isDismissed(key)) {
          setPitch({
            key, name: r.name, icon: Sparkles,
            accent: "from-amber-500/20 to-amber-500/0", iconColor: "text-amber-300",
            pitch: r.reason || "Best match for what this chat is working on.",
            cta: r.cta_label || "Hire →", link: r.link,
          });
        } else {
          setPitch(null);
        }
      });
      return () => { cancelled = true; };
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/ai-employees");
        if (cancelled) return;
        // Find an active employee the workspace has NOT subscribed to and
        // hasn't dismissed. Filter to keys we actually have a pitch for —
        // a new employee on the backend without a matching EMPLOYEE_PITCHES
        // entry would otherwise render `<undefined />` and crash the tree.
        const unsubscribed = (data.employees || []).filter(
          (e) =>
            e.status === "active" &&
            !e.subscription &&
            !isDismissed(e.key) &&
            EMPLOYEE_PITCHES[e.key],
        );
        if (unsubscribed.length === 0) return;
        // Rotate by day-of-year so the same workspace sees different employees on different days.
        const day = Math.floor(Date.now() / 86400000);
        const choice = unsubscribed[day % unsubscribed.length];
        setPitch({ key: choice.key, ...EMPLOYEE_PITCHES[choice.key] });
      } catch {
        // ignore — user might not be logged in yet
      }
    }, 4500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pathname]);

  // Auto-hide so the nudge never lingers over the composer / content. This is
  // a soft hide (no persisted dismissal) — it may resurface on a later route.
  useEffect(() => {
    if (!pitch) return undefined;
    const t = setTimeout(() => setPitch(null), 12000);
    return () => clearTimeout(t);
  }, [pitch]);

  if (!pitch || pathname.startsWith("/dev-os/projects/")) return null;
  const Icon = pitch.icon;
  return (
    <div
      data-testid="employee-cross-sell"
      className="fixed bottom-28 md:bottom-4 right-4 z-30 w-[320px] max-w-[calc(100vw-32px)] bg-surface-1 border border-hairline rounded-card shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-300"
    >
      <div className={`bg-gradient-to-b ${pitch.accent} px-4 pt-4 pb-3`}>
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full bg-bg flex items-center justify-center shrink-0 ${pitch.iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-ink-dim mb-1">
              <Sparkles className="w-3 h-3" /> AI Employee · new
            </div>
            <div className="text-[14px] font-semibold text-ink leading-tight">
              Have you met {pitch.name}?
            </div>
          </div>
          <button
            onClick={() => {
              dismiss(pitch.key);
              setPitch(null);
            }}
            data-testid="cross-sell-dismiss"
            aria-label="Dismiss"
            className="text-ink-dim hover:text-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="px-4 pb-4 space-y-3">
        <p className="text-[12px] text-ink-dim leading-relaxed">{pitch.pitch}</p>
        <div className="flex items-center gap-2">
          <button
            data-testid="cross-sell-cta"
            onClick={() => {
              dismiss(pitch.key);
              nav(pitch.link || "/employees");
            }}
            className="flex-1 h-9 rounded-full bg-brand text-black hover:bg-brand-deep font-mono uppercase text-[10px] tracking-widest inline-flex items-center justify-center gap-1.5"
          >
            {pitch.cta}
          </button>
          <button
            data-testid="cross-sell-later"
            onClick={() => {
              dismiss(pitch.key);
              setPitch(null);
            }}
            className="h-9 px-3 rounded-full border border-hairline text-ink-dim hover:bg-white/5 text-[11px]"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
