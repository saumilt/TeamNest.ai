import { useEffect, useState } from "react";
import { Clock, DollarSign, ListChecks, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Savings dashboard for AI employees. Shows per-employee task count, hours
 * saved, and dollar savings calculated against market billable rates.
 *
 * Shown above the catalog so subscribers see the ROI of their AI hires.
 */
export default function AiSavingsDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api
      .get("/ai-employees/_/savings")
      .then(({ data }) => setData(data))
      .catch(() => {});
  }, []);

  if (!data || !data.employees?.length) return null;

  const t = data.totals;
  const fmt$ = (n) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Number(n || 0).toFixed(0)}`;

  return (
    <section
      data-testid="ai-savings-dashboard"
      className="border border-emerald-500/30 bg-emerald-500/[0.03] rounded-md p-5 space-y-5"
    >
      <div className="flex items-center gap-3">
        <TrendingUp className="w-5 h-5 text-emerald-400" />
        <div>
          <h3 className="text-sm font-mono uppercase tracking-widest text-emerald-300">
            Value delivered by your AI employees
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Hours saved × market billable rate per role.
          </p>
        </div>
      </div>

      {/* Workspace totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          icon={<ListChecks className="w-4 h-4" />}
          label="Tasks completed"
          value={t.tasks_completed.toLocaleString()}
        />
        <Stat
          icon={<Clock className="w-4 h-4" />}
          label="Hours saved"
          value={`${t.hours_saved.toFixed(1)} h`}
        />
        <Stat
          icon={<DollarSign className="w-4 h-4" />}
          label="Dollar savings (total)"
          value={fmt$(t.dollar_savings)}
          highlight
        />
        <Stat
          icon={<DollarSign className="w-4 h-4" />}
          label="This month"
          value={fmt$(t.monthly_dollar_savings)}
          highlight
        />
      </div>

      {/* Per-employee breakdown */}
      <div className="space-y-2">
        {data.employees.map((e) => (
          <div
            key={e.employee_key}
            data-testid={`savings-row-${e.employee_key}`}
            className="flex items-center justify-between gap-3 bg-[#121214] border border-white/5 rounded-md px-3 py-2.5 flex-wrap"
          >
            <div className="min-w-0">
              <div className="text-sm text-zinc-200 truncate">
                {e.display_full_name}
              </div>
              <div className="text-[11px] font-mono text-zinc-500">
                {e.employee_name} · ${e.market_billable_rate_usd}/h market rate
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <span className="text-zinc-400">
                <span className="text-zinc-200 font-medium">{e.tasks_completed}</span> tasks
              </span>
              <span className="text-zinc-400">
                <span className="text-zinc-200 font-medium">{e.hours_saved.toFixed(1)} h</span> saved
              </span>
              <span className="text-emerald-300 font-medium">
                {fmt$(e.dollar_savings)}
              </span>
              {e.monthly_roi_multiple && (
                <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400/80 bg-emerald-400/10 px-2 py-0.5 rounded-sm">
                  {e.monthly_roi_multiple}× ROI / mo
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ icon, label, value, highlight }) {
  return (
    <div className="bg-[#121214] border border-white/5 rounded-md px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
        {icon}
        {label}
      </div>
      <div
        className={
          "text-lg font-semibold mt-1 " + (highlight ? "text-emerald-300" : "text-zinc-100")
        }
      >
        {value}
      </div>
    </div>
  );
}
