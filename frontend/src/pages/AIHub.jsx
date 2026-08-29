import { useSearchParams } from "react-router-dom";
import { Sparkles, Bot, Zap, Activity as ActivityIcon } from "lucide-react";
import Research from "@/pages/Research";
import AIEmployees from "@/pages/AIEmployees";
import Automations from "@/pages/Automations";
import AIActivity from "@/components/AIActivity";

// AI hub — organizes AI as Ask / Do / Watch across four tabs. Each panel reuses
// an existing surface (no duplication); old routes (/research, /employees,
// /automations) still work directly.
const TABS = [
  { key: "research", label: "Research", icon: Sparkles, mode: "ASK" },
  { key: "employees", label: "Employees", icon: Bot, mode: "DO" },
  { key: "automations", label: "Automations", icon: Zap, mode: "WATCH" },
  { key: "activity", label: "Activity", icon: ActivityIcon, mode: "" },
];

const LEGEND = [
  { m: "Ask", d: "research, reason, analyze" },
  { m: "Do", d: "AI performs work" },
  { m: "Watch", d: "monitor over time" },
];

export default function AIHub() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab = TABS.some((t) => t.key === raw) ? raw : "research";
  const setTab = (k) => setParams({ tab: k }, { replace: true });

  return (
    <div data-testid="ai-hub">
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/5 px-6 lg:px-10 pt-6">
        <div className="label-mono mb-2">WORKSPACE / AI</div>
        <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tighter">AI</h1>
        <div className="flex flex-wrap gap-2 mt-3">
          {LEGEND.map((x) => (
            <span
              key={x.m}
              className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 border border-white/10 rounded px-2 py-1"
            >
              <span className="text-yellow-400">{x.m}</span> · {x.d}
            </span>
          ))}
        </div>
        <div className="flex gap-1 mt-4 -mb-px overflow-x-auto" role="tablist">
          {TABS.map((t) => {
            const I = t.icon;
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                data-testid={`ai-tab-${t.key}`}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                  active
                    ? "border-yellow-400 text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-200"
                }`}
              >
                <I className="w-4 h-4" strokeWidth={1.8} />
                {t.label}
                {t.mode && <span className="text-[9px] font-mono text-zinc-600">{t.mode}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div data-testid={`ai-panel-${tab}`}>
        {tab === "research" && <Research embedded />}
        {tab === "employees" && <AIEmployees embedded />}
        {tab === "automations" && <Automations embedded />}
        {tab === "activity" && <AIActivity />}
      </div>
    </div>
  );
}
