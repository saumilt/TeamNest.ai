import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, Search, Zap, Plus, Trash2, ArrowUp, ArrowDown, GripVertical } from "lucide-react";

// Web-only visual node editor for an automation plan. Renders the plan as a
// draggable WHEN -> GET/THEN pipeline on a canvas, connected by SVG links, and
// edits the SAME plan object the natural-language builder produces (via onChange).
const NODE_W = 210;
const BADGE = {
  when: { label: "WHEN", cls: "text-sky-300 border-sky-400/40 bg-sky-500/10", Icon: Clock },
  get: { label: "GET", cls: "text-emerald-300 border-emerald-400/40 bg-emerald-500/10", Icon: Search },
  then: { label: "THEN", cls: "text-yellow-300 border-yellow-400/40 bg-yellow-500/10", Icon: Zap },
};

export default function AutomationNodeBuilder({ plan, onChange }) {
  // Ordered node list: trigger first, then steps in array order.
  const nodes = useMemo(() => {
    const list = [{ id: "trigger", kind: "when", label: plan.trigger?.label || "Manually", locked: true }];
    (plan.steps || []).forEach((s, i) => list.push({ id: `step-${i}`, kind: s.kind === "get" ? "get" : "then", label: s.label, index: i }));
    return list;
  }, [plan]);

  const [positions, setPositions] = useState({});
  const canvasRef = useRef(null);
  const drag = useRef(null);

  // Auto-layout any node without a saved position (vertical column).
  useEffect(() => {
    setPositions((prev) => {
      const next = { ...prev };
      let changed = false;
      nodes.forEach((n, i) => {
        if (!next[n.id]) { next[n.id] = { x: 60, y: 20 + i * 120 }; changed = true; }
      });
      Object.keys(next).forEach((k) => { if (!nodes.some((n) => n.id === k)) { delete next[k]; changed = true; } });
      return changed ? next : prev;
    });
  }, [nodes]);

  const onPointerDown = (e, id) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const p = positions[id] || { x: 0, y: 0 };
    drag.current = { id, offX: e.clientX - rect.left - p.x, offY: e.clientY - rect.top - p.y };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };
  const onPointerMove = useCallback((e) => {
    if (!drag.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left - drag.current.offX, rect.width - NODE_W));
    const y = Math.max(0, e.clientY - rect.top - drag.current.offY);
    setPositions((prev) => ({ ...prev, [drag.current.id]: { x, y } }));
  }, []);
  const onPointerUp = useCallback(() => {
    drag.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  // ---- plan mutations ----
  const setTriggerLabel = (label) => onChange({ ...plan, trigger: { ...(plan.trigger || {}), label } });
  const setStep = (i, patch) => {
    const steps = [...(plan.steps || [])];
    steps[i] = { ...steps[i], ...patch };
    onChange({ ...plan, steps });
  };
  const addStep = () => {
    const steps = [...(plan.steps || []), { kind: "then", label: "New action", config: {} }];
    onChange({ ...plan, steps });
  };
  const removeStep = (i) => onChange({ ...plan, steps: (plan.steps || []).filter((_, j) => j !== i) });
  const moveStep = (i, dir) => {
    const steps = [...(plan.steps || [])];
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    onChange({ ...plan, steps });
  };

  const canvasH = Math.max(360, 40 + nodes.reduce((m, n) => Math.max(m, (positions[n.id]?.y || 0) + 150), 0));

  return (
    <div data-testid="node-builder" className="mt-3">
      <div className="text-[11px] text-zinc-500 mb-2">Drag nodes to arrange. Click a node to edit it. The pipeline runs top-to-bottom in list order.</div>
      <div
        ref={canvasRef}
        className="relative w-full overflow-auto rounded-xl border border-white/10 bg-[#0a0a0a] bg-[radial-gradient(circle,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:20px_20px]"
        style={{ height: Math.min(canvasH, 560) }}
      >
        <div className="relative" style={{ height: canvasH, minWidth: "100%" }}>
          {/* connectors */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ height: canvasH }}>
            {nodes.slice(0, -1).map((n, i) => {
              const a = positions[n.id]; const b = positions[nodes[i + 1].id];
              if (!a || !b) return null;
              const x1 = a.x + NODE_W / 2, y1 = a.y + 34, x2 = b.x + NODE_W / 2, y2 = b.y + 34;
              const my = (y1 + y2) / 2;
              return <path key={i} d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`} stroke="rgba(250,204,21,0.4)" strokeWidth="2" fill="none" />;
            })}
          </svg>

          {nodes.map((n) => {
            const pos = positions[n.id] || { x: 0, y: 0 };
            const b = BADGE[n.kind];
            const isStep = !n.locked;
            return (
              <div
                key={n.id}
                data-testid={`node-${n.id}`}
                className="absolute rounded-xl border border-white/12 bg-[#141416] shadow-lg select-none"
                style={{ left: pos.x, top: pos.y, width: NODE_W }}
              >
                <div
                  onPointerDown={(e) => onPointerDown(e, n.id)}
                  className="flex items-center gap-1.5 px-2.5 py-2 border-b border-white/10 cursor-grab active:cursor-grabbing"
                >
                  <GripVertical className="w-3.5 h-3.5 text-zinc-600" />
                  <span className={`text-[9px] font-mono tracking-widest border rounded px-1.5 py-0.5 ${b.cls}`}>{b.label}</span>
                  <b.Icon className="w-3.5 h-3.5 text-zinc-400 ml-auto" />
                </div>
                <div className="p-2.5 space-y-2">
                  {n.locked ? (
                    <input
                      data-testid="node-trigger-label"
                      value={n.label}
                      onChange={(e) => setTriggerLabel(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-sky-400/40"
                    />
                  ) : (
                    <>
                      <input
                        data-testid={`node-label-${n.index}`}
                        value={n.label}
                        onChange={(e) => setStep(n.index, { label: e.target.value })}
                        className="w-full bg-[#0a0a0a] border border-white/10 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-yellow-400/40"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          data-testid={`node-kind-${n.index}`}
                          onClick={() => setStep(n.index, { kind: n.kind === "get" ? "then" : "get" })}
                          className="text-[9px] font-mono tracking-widest border border-white/10 rounded px-1.5 py-0.5 text-zinc-300 hover:bg-white/5"
                        >
                          {n.kind === "get" ? "→ THEN" : "→ GET"}
                        </button>
                        <div className="ml-auto flex items-center gap-0.5">
                          <button data-testid={`node-up-${n.index}`} onClick={() => moveStep(n.index, -1)} className="p-1 text-zinc-500 hover:text-white"><ArrowUp className="w-3.5 h-3.5" /></button>
                          <button data-testid={`node-down-${n.index}`} onClick={() => moveStep(n.index, 1)} className="p-1 text-zinc-500 hover:text-white"><ArrowDown className="w-3.5 h-3.5" /></button>
                          <button data-testid={`node-remove-${n.index}`} onClick={() => removeStep(n.index)} className="p-1 text-zinc-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <button data-testid="node-add-step" onClick={addStep} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold border border-white/10 rounded-lg px-3 py-1.5 text-zinc-200 hover:bg-white/5">
        <Plus className="w-3.5 h-3.5" /> Add step
      </button>
    </div>
  );
}
