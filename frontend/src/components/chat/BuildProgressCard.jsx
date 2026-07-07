import { useEffect, useRef, useState } from "react";
import { Check, Hammer, Loader2, X } from "lucide-react";
import { api } from "@/lib/api";

/**
 * BuildProgressCard — Emergent-style live activity feed for an AI build.
 * Renders inside the chat as a full-width card, polling the activity doc
 * every 1.5s while the build is running. Each step ticks off in real time:
 * planning → writing files → testing → deploying.
 */
const STATUS_META = {
  running: { label: "Working…", cls: "bg-amber-400/15 text-amber-300 ring-amber-400/30" },
  done: { label: "Complete", cls: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30" },
  error: { label: "Failed", cls: "bg-red-400/15 text-red-300 ring-red-400/30" },
};

function elapsedLabel(activity) {
  const start = new Date(activity.created_at).getTime();
  const end = activity.finished_at ? new Date(activity.finished_at).getTime() : Date.now();
  const s = Math.max(0, Math.round((end - start) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function BuildProgressCard({ activityId, onDone }) {
  const [activity, setActivity] = useState(null);
  const [, setTick] = useState(0);
  const errorsRef = useRef(0);
  const doneRef = useRef(false);
  const stepsEndRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const load = async () => {
      try {
        const { data } = await api.get(`/build-activities/${activityId}`);
        if (cancelled) return;
        errorsRef.current = 0;
        setActivity(data);
        if (data.status === "running") timer = setTimeout(load, 1500);
        else if (!doneRef.current) {
          doneRef.current = true;
          onDone?.(data);
        }
      } catch {
        if (cancelled) return;
        errorsRef.current += 1;
        if (errorsRef.current < 4) timer = setTimeout(load, 4000);
      }
    };
    load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activityId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 1s ticker keeps the elapsed counter moving while running.
  useEffect(() => {
    if (activity?.status !== "running") return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [activity?.status]);

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [activity?.steps?.length]);

  if (!activity) {
    return (
      <div
        data-testid="build-progress-card"
        className="rounded-xl bg-surface ring-1 ring-hairline px-4 py-3 text-[12px] text-ink-mute inline-flex items-center gap-2"
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
        Loading build activity…
      </div>
    );
  }

  const meta = STATUS_META[activity.status] || STATUS_META.running;
  const steps = activity.steps || [];

  return (
    <div
      data-testid="build-progress-card"
      className="rounded-xl bg-surface ring-1 ring-amber-400/20 overflow-hidden max-w-xl w-full"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-amber-400/[0.06] border-b border-amber-400/15">
        <div className="w-7 h-7 rounded-lg bg-amber-300 text-black flex items-center justify-center shrink-0">
          {activity.status === "running"
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Hammer className="w-3.5 h-3.5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-ink truncate">{activity.title}</div>
          <div className="text-[10.5px] text-ink-mute">
            TeamNest AI dev team · {elapsedLabel(activity)}
          </div>
        </div>
        <span
          data-testid="build-progress-status"
          className={`shrink-0 inline-flex items-center h-5 px-2 rounded-full ring-1 text-[10.5px] font-semibold ${meta.cls}`}
        >
          {meta.label}
        </span>
      </div>

      {/* Steps */}
      <div className="px-4 py-2.5 max-h-52 overflow-y-auto space-y-1.5">
        {steps.length === 0 && (
          <div className="text-[11.5px] text-ink-mute inline-flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Starting up…
          </div>
        )}
        {steps.map((s, i) => (
          <div
            key={s.id || i}
            data-testid={`build-step-${i}`}
            className="flex items-center gap-2 text-[12px]"
          >
            <span className="w-4 shrink-0 flex items-center justify-center">
              {s.status === "done" && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              {s.status === "running" && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />}
              {s.status === "error" && <X className="w-3.5 h-3.5 text-red-400" />}
            </span>
            <span className="shrink-0">{s.icon}</span>
            <span className={s.status === "running" ? "text-ink" : "text-ink-dim"}>
              {s.label}
            </span>
          </div>
        ))}
        <div ref={stepsEndRef} />
      </div>

      {/* Footer summary */}
      {activity.status !== "running" && activity.summary && (
        <div
          data-testid="build-progress-summary"
          className={`px-4 py-2.5 border-t border-hairline text-[12px] ${
            activity.status === "error" ? "text-red-300" : "text-emerald-300"
          }`}
        >
          {activity.summary}
          {(activity.files_changed || []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {activity.files_changed.slice(0, 8).map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center h-5 px-1.5 rounded bg-surface-2 text-ink-mute text-[10.5px] font-mono"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Output screenshot */}
      {activity.status === "done" && activity.screenshot_b64 && (
        <div className="px-4 pb-3 pt-1">
          <div className="text-[10px] font-mono uppercase tracking-widest text-ink-mute mb-1.5">
            Output preview
          </div>
          <img
            data-testid="build-progress-screenshot"
            src={activity.screenshot_b64}
            alt="Live preview screenshot"
            loading="lazy"
            className="w-full rounded-lg ring-1 ring-hairline"
          />
        </div>
      )}
    </div>
  );
}
