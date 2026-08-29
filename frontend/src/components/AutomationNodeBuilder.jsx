import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clock, Search, Zap, Plus, Trash2, ArrowUp, ArrowDown, GripVertical,
  Play, Sparkles, Mail, Send, Database, AppWindow, Settings2, X, CalendarClock, GitBranch, Bell,
} from "lucide-react";

/* ---------- option catalogues (mirror the backend plan schema) ---------- */
const TRIGGER_TYPES = [
  { value: "manual", label: "Manually", icon: Play },
  { value: "scheduled", label: "On a schedule", icon: CalendarClock },
  { value: "condition", label: "When a condition is met", icon: GitBranch },
  { value: "event", label: "When an event happens", icon: Zap },
];
const FREQS = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "hourly", label: "Every hour" },
];
const WEEKDAYS = [
  { value: "mon", label: "Monday" }, { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" }, { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" }, { value: "sat", label: "Saturday" }, { value: "sun", label: "Sunday" },
];
const CONDITIONS = [
  { value: "overdue_tasks", label: "Tasks are overdue" },
  { value: "stalled_projects", label: "Projects have stalled" },
];
const EVENTS = [
  { value: "crm_lead_created", label: "A new CRM lead is created" },
  { value: "task_created", label: "A new task is created" },
  { value: "email_received", label: "An email arrives" },
];
const GET_SOURCES = [
  { value: "overdue_tasks", label: "Overdue tasks" },
  { value: "recent_research", label: "Recent AI research" },
  { value: "crm_leads", label: "CRM leads" },
];
const STEP_TYPES = [
  { value: "get", label: "Get data", icon: Database, badge: "GET" },
  { value: "summarize", label: "Summarize (AI)", icon: Sparkles, badge: "THEN" },
  { value: "draft_email", label: "Draft email (AI)", icon: Mail, badge: "THEN" },
  { value: "post", label: "Post to a chat", icon: Send, badge: "THEN" },
  { value: "app", label: "App action", icon: AppWindow, badge: "THEN" },
];
const APP_ACTIONS = [
  { value: "update_crm", label: "Update CRM" },
  { value: "notify", label: "Send a notification" },
  { value: "create_task", label: "Create a task" },
];

/* ---------- label suggestions from config ---------- */
function suggestTriggerLabel(t) {
  const c = t.config || {};
  if (t.type === "scheduled") {
    const s = c.schedule || {};
    const time = s.time || "08:00";
    if (s.freq === "hourly") return "Every hour";
    if (s.freq === "weekly") return `Every ${(WEEKDAYS.find((w) => w.value === s.weekday)?.label) || "Monday"} at ${time}`;
    return `Every day at ${time}`;
  }
  if (t.type === "condition") return `When ${(CONDITIONS.find((x) => x.value === c.condition)?.label || "tasks are overdue").toLowerCase()}`;
  if (t.type === "event") return (EVENTS.find((x) => x.value === c.event)?.label) || "When an event happens";
  return "Manually — run on demand";
}
function suggestStepLabel(step, chats) {
  const c = step.config || {};
  if (step.kind === "get") return `Get ${(GET_SOURCES.find((x) => x.value === c.source)?.label || "data").toLowerCase()}`;
  if (step.kind === "ai") return c.op === "draft_email" ? "Draft an email" : "Summarize with AI";
  if (step.kind === "post") {
    const name = (chats || []).find((ch) => ch.id === c.target || ch.name === c.target)?.name || c.target;
    return name ? `Post to ${name}` : "Post to a chat";
  }
  if (step.kind === "app") return (APP_ACTIONS.find((x) => x.value === c.action)?.label) || "App action";
  return step.label || "Step";
}

function stepTypeOf(step) {
  if (step.kind === "get") return "get";
  if (step.kind === "ai") return step.config?.op === "draft_email" ? "draft_email" : "summarize";
  if (step.kind === "post") return "post";
  return "app";
}
function stepForType(type, chats) {
  let step;
  if (type === "get") step = { kind: "get", config: { source: "overdue_tasks" } };
  else if (type === "summarize") step = { kind: "ai", config: { op: "summarize" } };
  else if (type === "draft_email") step = { kind: "ai", config: { op: "draft_email" } };
  else if (type === "post") step = { kind: "post", config: { target: (chats || [])[0]?.id || null } };
  else step = { kind: "app", config: { action: "update_crm" } };
  step.label = suggestStepLabel(step, chats);
  return step;
}

const BADGE_CLS = {
  WHEN: "bg-yellow-500/15 text-yellow-300 border-yellow-400/30",
  GET: "bg-sky-500/15 text-sky-300 border-sky-400/30",
  THEN: "bg-violet-500/15 text-violet-300 border-violet-400/30",
};
const NODE_W = 210;
const NODE_H = 74;

function iconForStep(step) {
  const t = STEP_TYPES.find((s) => s.value === stepTypeOf(step));
  return t?.icon || Zap;
}
function badgeForStep(step) {
  return step.kind === "get" ? "GET" : "THEN";
}

export default function AutomationNodeBuilder({ plan, onChange, chats = [] }) {
  const canvasRef = useRef(null);
  const [selected, setSelected] = useState("trigger");
  const [positions, setPositions] = useState({});
  const drag = useRef(null);

  const nodes = useMemo(() => {
    const list = [{ id: "trigger", isTrigger: true }];
    (plan.steps || []).forEach((_, i) => list.push({ id: `s${i}`, index: i }));
    return list;
  }, [plan.steps]);

  // auto-layout any node without a stored position (vertical column)
  useEffect(() => {
    setPositions((prev) => {
      const next = { ...prev };
      let changed = false;
      nodes.forEach((n, i) => {
        if (!next[n.id]) { next[n.id] = { x: 40, y: 24 + i * 104 }; changed = true; }
      });
      Object.keys(next).forEach((id) => { if (!nodes.find((n) => n.id === id)) { delete next[id]; changed = true; } });
      return changed ? next : prev;
    });
  }, [nodes]);

  const canvasHeight = Math.max(320, nodes.length * 104 + 60);

  const onPointerDown = (e, id) => {
    e.stopPropagation();
    const p = positions[id] || { x: 40, y: 24 };
    drag.current = { id, startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y };
    setSelected(id);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const nx = Math.max(0, d.origX + (e.clientX - d.startX));
    const ny = Math.max(0, d.origY + (e.clientY - d.startY));
    setPositions((prev) => ({ ...prev, [d.id]: { x: nx, y: ny } }));
  };
  const onPointerUp = () => {
    drag.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  /* mutations */
  const setTrigger = (t) => onChange({ ...plan, trigger: t });
  const setSteps = (steps) => onChange({ ...plan, steps });
  const updateStep = (i, patch) => {
    const steps = [...(plan.steps || [])];
    steps[i] = { ...steps[i], ...patch };
    setSteps(steps);
  };
  const addStep = () => {
    const step = stepForType("get", chats);
    const steps = [...(plan.steps || []), step];
    setSteps(steps);
    setSelected(`s${steps.length - 1}`);
  };
  const removeStep = (i) => {
    const steps = (plan.steps || []).filter((_, idx) => idx !== i);
    setSteps(steps);
    setSelected("trigger");
  };
  const moveStep = (i, dir) => {
    const steps = [...(plan.steps || [])];
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    setSteps(steps);
    setSelected(`s${j}`);
  };

  const center = (id) => {
    const p = positions[id] || { x: 40, y: 24 };
    return { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 };
  };

  return (
    <div className="mt-3" data-testid="node-builder">
      <div
        ref={canvasRef}
        className="relative rounded-xl border border-white/10 overflow-auto bg-[#0b0b0d]"
        style={{
          height: 360,
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
        onPointerDown={() => setSelected("trigger")}
      >
        <div className="relative" style={{ height: canvasHeight, minWidth: 480 }}>
          <svg className="absolute inset-0 pointer-events-none" width="100%" height={canvasHeight}>
            {nodes.slice(0, -1).map((n, i) => {
              const a = center(n.id);
              const b = center(nodes[i + 1].id);
              return (
                <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="rgba(250,204,21,0.35)" strokeWidth="2" strokeDasharray="4 4" />
              );
            })}
          </svg>

          {nodes.map((n) => {
            const isTrigger = n.isTrigger;
            const step = isTrigger ? null : plan.steps[n.index];
            const badge = isTrigger ? "WHEN" : badgeForStep(step);
            const Icon = isTrigger ? (TRIGGER_TYPES.find((t) => t.value === plan.trigger?.type)?.icon || Clock) : iconForStep(step);
            const label = isTrigger ? (plan.trigger?.label || "Trigger") : (step.label || suggestStepLabel(step, chats));
            const pos = positions[n.id] || { x: 40, y: 24 };
            const isSel = selected === n.id;
            return (
              <div
                key={n.id}
                data-testid={isTrigger ? "node-trigger" : `node-step-${n.index}`}
                onPointerDown={(e) => onPointerDown(e, n.id)}
                onClick={(e) => { e.stopPropagation(); setSelected(n.id); }}
                className={`absolute rounded-lg border bg-[#141416] cursor-grab active:cursor-grabbing select-none ${isSel ? "border-yellow-400/70 ring-1 ring-yellow-400/30" : "border-white/10"}`}
                style={{ left: pos.x, top: pos.y, width: NODE_W }}
              >
                <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/5">
                  <GripVertical className="w-3.5 h-3.5 text-zinc-600" />
                  <span className={`text-[9px] font-mono uppercase tracking-widest border rounded px-1.5 py-0.5 ${BADGE_CLS[badge]}`}>{badge}</span>
                  <div className="flex-1" />
                  <Settings2 className={`w-3.5 h-3.5 ${isSel ? "text-yellow-400" : "text-zinc-600"}`} />
                </div>
                <div className="px-2.5 py-2 flex items-center gap-2">
                  <Icon className="w-4 h-4 text-zinc-300 shrink-0" />
                  <div className="text-[12px] text-zinc-100 leading-tight line-clamp-2">{label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button data-testid="node-add-step" onClick={addStep} className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-white/10 px-3 py-1.5 text-zinc-200 hover:bg-white/5">
          <Plus className="w-3.5 h-3.5" /> Add step
        </button>
        <span className="text-[11px] text-zinc-500">Click a node to configure it. Drag to arrange.</span>
      </div>

      {/* settings panel */}
      <div className="mt-3 rounded-xl border border-white/10 bg-[#0e0e10] p-4" data-testid="node-settings">
        {selected === "trigger" ? (
          <TriggerSettings trigger={plan.trigger || { type: "manual", label: "Manually", config: {} }} onChange={setTrigger} />
        ) : (
          (() => {
            const i = Number(selected.replace("s", ""));
            const step = plan.steps?.[i];
            if (!step) return <div className="text-sm text-zinc-500">Select a node to configure it.</div>;
            return (
              <StepSettings
                index={i}
                step={step}
                chats={chats}
                onChange={(patch) => updateStep(i, patch)}
                onRemove={() => removeStep(i)}
                onMove={(dir) => moveStep(i, dir)}
                canUp={i > 0}
                canDown={i < (plan.steps.length - 1)}
              />
            );
          })()
        )}
      </div>
    </div>
  );
}

/* ---------- settings sub-panels ---------- */
function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
      {children}
    </div>
  );
}
const selectCls = "w-full bg-[#141416] border border-white/10 rounded-lg text-sm text-zinc-100 px-2.5 py-2 focus:outline-none focus:border-yellow-400/40";
const inputCls = selectCls;

function TriggerSettings({ trigger, onChange }) {
  const cfg = trigger.config || {};
  const setType = (type) => {
    let config = {};
    if (type === "scheduled") config = { schedule: { freq: "daily", time: "08:00", weekday: null } };
    else if (type === "condition") config = { condition: "overdue_tasks" };
    else if (type === "event") config = { event: "crm_lead_created" };
    const t = { type, config };
    onChange({ ...t, label: suggestTriggerLabel(t) });
  };
  const patchCfg = (patch) => {
    const t = { ...trigger, config: { ...cfg, ...patch } };
    onChange({ ...t, label: suggestTriggerLabel(t) });
  };
  const patchSched = (patch) => {
    const sched = { ...(cfg.schedule || {}), ...patch };
    const t = { ...trigger, config: { ...cfg, schedule: sched } };
    onChange({ ...t, label: suggestTriggerLabel(t) });
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono uppercase tracking-widest border rounded px-1.5 py-0.5 bg-yellow-500/15 text-yellow-300 border-yellow-400/30">WHEN</span>
        <div className="text-sm font-semibold text-zinc-100">Trigger</div>
      </div>
      <Field label="Run this automation">
        <select data-testid="trigger-type-select" className={selectCls} value={trigger.type} onChange={(e) => setType(e.target.value)}>
          {TRIGGER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>
      {trigger.type === "scheduled" && (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Frequency">
            <select data-testid="trigger-sched-freq" className={selectCls} value={cfg.schedule?.freq || "daily"} onChange={(e) => patchSched({ freq: e.target.value })}>
              {FREQS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
          {cfg.schedule?.freq !== "hourly" && (
            <Field label="Time">
              <input data-testid="trigger-sched-time" type="time" className={inputCls} value={cfg.schedule?.time || "08:00"} onChange={(e) => patchSched({ time: e.target.value })} />
            </Field>
          )}
          {cfg.schedule?.freq === "weekly" && (
            <Field label="Day">
              <select data-testid="trigger-sched-weekday" className={selectCls} value={cfg.schedule?.weekday || "mon"} onChange={(e) => patchSched({ weekday: e.target.value })}>
                {WEEKDAYS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </Field>
          )}
        </div>
      )}
      {trigger.type === "condition" && (
        <Field label="Condition">
          <select data-testid="trigger-condition-select" className={selectCls} value={cfg.condition || "overdue_tasks"} onChange={(e) => patchCfg({ condition: e.target.value })}>
            {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
      )}
      {trigger.type === "event" && (
        <Field label="Event">
          <select data-testid="trigger-event-select" className={selectCls} value={cfg.event || "crm_lead_created"} onChange={(e) => patchCfg({ event: e.target.value })}>
            {EVENTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
      )}
      <Field label="Label">
        <input data-testid="trigger-label-input" className={inputCls} value={trigger.label || ""} onChange={(e) => onChange({ ...trigger, label: e.target.value })} />
      </Field>
    </div>
  );
}

function StepSettings({ index, step, chats, onChange, onRemove, onMove, canUp, canDown }) {
  const type = stepTypeOf(step);
  const c = step.config || {};
  const setType = (newType) => {
    const s = stepForType(newType, chats);
    onChange({ kind: s.kind, config: s.config, label: s.label });
  };
  const patchCfg = (patch) => {
    const next = { ...step, config: { ...c, ...patch } };
    onChange({ config: next.config, label: suggestStepLabel(next, chats) });
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono uppercase tracking-widest border rounded px-1.5 py-0.5 bg-violet-500/15 text-violet-300 border-violet-400/30">STEP {index + 1}</span>
        <div className="text-sm font-semibold text-zinc-100 flex-1">Configure step</div>
        <button data-testid={`node-up-${index}`} disabled={!canUp} onClick={() => onMove(-1)} className="w-7 h-7 flex items-center justify-center rounded border border-white/10 text-zinc-300 disabled:opacity-40 hover:bg-white/5"><ArrowUp className="w-3.5 h-3.5" /></button>
        <button data-testid={`node-down-${index}`} disabled={!canDown} onClick={() => onMove(1)} className="w-7 h-7 flex items-center justify-center rounded border border-white/10 text-zinc-300 disabled:opacity-40 hover:bg-white/5"><ArrowDown className="w-3.5 h-3.5" /></button>
        <button data-testid={`node-remove-${index}`} onClick={onRemove} className="w-7 h-7 flex items-center justify-center rounded border border-red-400/20 text-red-300 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      <Field label="Step type">
        <select data-testid={`node-type-select-${index}`} className={selectCls} value={type} onChange={(e) => setType(e.target.value)}>
          {STEP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>
      {type === "get" && (
        <Field label="Data source">
          <select data-testid={`node-source-select-${index}`} className={selectCls} value={c.source || "overdue_tasks"} onChange={(e) => patchCfg({ source: e.target.value })}>
            {GET_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
      )}
      {type === "post" && (
        <Field label="Post to chat">
          <select data-testid={`node-post-target-${index}`} className={selectCls} value={c.target || ""} onChange={(e) => patchCfg({ target: e.target.value })}>
            <option value="">Select a chat…</option>
            {(chats || []).map((ch) => <option key={ch.id} value={ch.id}>{ch.name || ch.id}</option>)}
          </select>
        </Field>
      )}
      {type === "app" && (
        <Field label="Action">
          <select data-testid={`node-app-action-${index}`} className={selectCls} value={c.action || "update_crm"} onChange={(e) => patchCfg({ action: e.target.value })}>
            {APP_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </Field>
      )}
      {(type === "summarize" || type === "draft_email") && (
        <div className="text-[12px] text-zinc-500 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
          {type === "draft_email" ? "AI drafts an email from the data above (draft only — never sends)." : "AI summarizes the data gathered above."}
        </div>
      )}
      <Field label="Label">
        <input data-testid={`node-label-${index}`} className={inputCls} value={step.label || ""} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
    </div>
  );
}
