import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Braces, ShieldCheck, Database, Workflow, ClipboardList, BarChart3, Plug,
  Plus, Trash2, Sparkles, Loader2, Check, Wand2, Lightbulb, Rocket, LayoutTemplate, Lock,
} from "lucide-react";
import AppBuilderPanel from "@/pages/dev_os/AppBuilderPanel";
import TemplatesPanel from "@/pages/dev_os/TemplatesPanel";
import HireDevTeamButton from "@/components/chat/HireDevTeamButton";

/**
 * BuildersHub — the "Builders" tab. Visual, plain-English editors that
 * persist a structured spec per builder and auto-feed @devmanager on Build.
 */

const FIELD_TYPES = ["text", "number", "date", "email", "currency", "yes/no", "dropdown", "file"];
const PERMS = ["view", "create", "edit", "delete", "approve", "export", "settings"];
const CHARTS = ["bar chart", "line chart", "pie chart", "table only", "KPI cards"];
const SERVICES = ["Stripe", "Email", "SMS", "Slack", "Google Sheets", "Webhook", "Other"];

const listSentence = (arr) => arr.filter(Boolean).join("; ");

export const BUILDERS = [
  {
    key: "data", label: "Data Model", icon: Database, desc: "Things your app tracks",
    aiHint: "Track customers with name, email and phone; each customer has many orders with a total and status",
    empty: () => ({ entities: [] }),
    newItem: () => ({ name: "", fields: [{ name: "", type: "text" }], relations: "" }),
    itemsKey: "entities",
    compose: (spec) => {
      const parts = (spec.entities || []).filter((e) => e.name.trim()).map((e) =>
        `"${e.name}" with fields: ${e.fields.filter((f) => f.name.trim()).map((f) => `${f.name} (${f.type})`).join(", ")}${e.relations ? `. Relationships: ${e.relations}` : ""}`);
      if (!parts.length) return null;
      return `Update the app's data model to include these entities: ${listSentence(parts)}. For each entity build a list view, add/edit forms and a detail view, wired into the navigation. If an entity already exists, update it to match instead of duplicating.`;
    },
  },
  {
    key: "roles", label: "Roles & Permissions", icon: ShieldCheck, desc: "Who can do what",
    aiHint: "Admins can do everything; managers can approve and edit but not change settings; staff can only view and create",
    empty: () => ({ roles: [] }),
    newItem: () => ({ name: "", perms: { view: true }, notes: "" }),
    itemsKey: "roles",
    compose: (spec) => {
      const parts = (spec.roles || []).filter((r) => r.name.trim()).map((r) => {
        const can = PERMS.filter((p) => r.perms?.[p]);
        const cannot = PERMS.filter((p) => !r.perms?.[p]);
        return `"${r.name}" can ${can.join(", ") || "nothing"}; cannot ${cannot.join(", ") || "—"}${r.notes ? `. Notes: ${r.notes}` : ""}`;
      });
      if (!parts.length) return null;
      return `Set up these user roles and enforce them in every screen, menu and action of the app: ${listSentence(parts)}. Add a demo login for each role so it can be tested. Update existing roles to match instead of duplicating.`;
    },
  },
  {
    key: "logic", label: "Business Logic", icon: Braces, desc: "If-this-then-that rules",
    aiHint: "Orders over $100 get a 10% discount; overdue invoices are flagged red after 30 days",
    empty: () => ({ rules: [] }),
    newItem: () => ({ when: "", then: "" }),
    itemsKey: "rules",
    compose: (spec) => {
      const parts = (spec.rules || []).filter((r) => r.when.trim() && r.then.trim())
        .map((r) => `When ${r.when}, then ${r.then}`);
      if (!parts.length) return null;
      return `Implement these business rules end-to-end so they visibly work in the UI: ${listSentence(parts)}. Update existing rules to match instead of duplicating.`;
    },
  },
  {
    key: "workflow", label: "Workflows", icon: Workflow, desc: "Automate multi-step actions",
    aiHint: "When a new order comes in, notify the admin, then create a fulfillment task, then email the customer a receipt",
    empty: () => ({ flows: [] }),
    newItem: () => ({ trigger: "", steps: [""] }),
    itemsKey: "flows",
    compose: (spec) => {
      const parts = (spec.flows || []).filter((f) => f.trigger.trim())
        .map((f) => `when ${f.trigger}: ${f.steps.filter(Boolean).map((s, i) => `${i + 1}) ${s}`).join(" ")}`);
      if (!parts.length) return null;
      return `Add these workflow automations and show their results in the UI: ${listSentence(parts)}. Update existing automations to match instead of duplicating.`;
    },
  },
  {
    key: "form", label: "Forms", icon: ClipboardList, desc: "Forms that save data",
    aiHint: "A customer feedback form on its own page with a 1-5 rating, a comments box and an email field",
    empty: () => ({ forms: [] }),
    newItem: () => ({ name: "", where: "", fields: [{ label: "", type: "text" }] }),
    itemsKey: "forms",
    compose: (spec) => {
      const parts = (spec.forms || []).filter((f) => f.name.trim()).map((f) =>
        `"${f.name}" (${f.where || "new page in the nav"}) with fields: ${f.fields.filter((x) => x.label.trim()).map((x) => `${x.label} (${x.type})`).join(", ")}`);
      if (!parts.length) return null;
      return `Add these forms with input validation, save submissions and show them in a list view: ${listSentence(parts)}. Update existing forms to match instead of duplicating.`;
    },
  },
  {
    key: "report", label: "Reports", icon: BarChart3, desc: "Charts & summaries",
    aiHint: "Show orders per day as a line chart and revenue grouped by product as a bar chart",
    empty: () => ({ reports: [] }),
    newItem: () => ({ measure: "", group: "", chart: "bar chart" }),
    itemsKey: "reports",
    compose: (spec) => {
      const parts = (spec.reports || []).filter((r) => r.measure.trim())
        .map((r) => `${r.measure}${r.group ? ` grouped by ${r.group}` : ""} as a ${r.chart}`);
      if (!parts.length) return null;
      return `Build a Reports page showing: ${listSentence(parts)}. Add a summary table under each chart. Update existing reports to match instead of duplicating.`;
    },
  },
  {
    key: "integration", label: "Integrations", icon: Plug, desc: "Connect outside services",
    aiHint: "Take card payments with Stripe at checkout and send an email confirmation after every purchase",
    empty: () => ({ integrations: [] }),
    newItem: () => ({ service: "Stripe", what: "" }),
    itemsKey: "integrations",
    compose: (spec) => {
      const parts = (spec.integrations || []).filter((i) => i.what.trim())
        .map((i) => `${i.service} — ${i.what}`);
      if (!parts.length) return null;
      return `Add these integrations with the full UI flow, clearly stubbing external calls so real API keys can be plugged in later: ${listSentence(parts)}. Update existing integrations to match instead of duplicating.`;
    },
  },
];

// ─── tiny shared inputs ──────────────────────────────────────────────────
const Input = ({ value, onChange, ph, testid, className = "" }) => (
  <input
    type="text" value={value || ""} onChange={(e) => onChange(e.target.value)}
    placeholder={ph} data-testid={testid}
    className={`h-9 px-3 rounded-lg bg-surface-2 ring-1 ring-hairline focus:ring-amber-400/40 outline-none text-[13px] text-ink placeholder:text-ink-mute w-full ${className}`}
  />
);

const Select = ({ value, onChange, options, testid }) => (
  <select
    value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid}
    className="h-9 px-2 rounded-lg bg-surface-2 ring-1 ring-hairline text-[12px] text-ink outline-none"
  >
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

const RemoveBtn = ({ onClick, testid }) => (
  <button type="button" onClick={onClick} data-testid={testid}
    className="p-1.5 rounded-md text-ink-mute hover:text-rose-300 hover:bg-rose-500/10 shrink-0">
    <Trash2 className="w-3.5 h-3.5" />
  </button>
);

const Card = ({ children }) => (
  <div className="rounded-xl bg-surface ring-1 ring-hairline p-3 space-y-2.5">{children}</div>
);

// ─── per-builder item editors ────────────────────────────────────────────
function DataEntityEditor({ item, update, idx }) {
  const setField = (i, patch) => update({
    ...item, fields: item.fields.map((f, x) => (x === i ? { ...f, ...patch } : f)),
  });
  return (
    <>
      <Input value={item.name} onChange={(v) => update({ ...item, name: v })} ph="What to track — e.g. Customers" testid={`bh-data-name-${idx}`} />
      {item.fields.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={f.name} onChange={(v) => setField(i, { name: v })} ph="Field — e.g. email" testid={`bh-data-field-${idx}-${i}`} />
          <Select value={f.type} onChange={(v) => setField(i, { type: v })} options={FIELD_TYPES} testid={`bh-data-type-${idx}-${i}`} />
          <RemoveBtn onClick={() => update({ ...item, fields: item.fields.filter((_, x) => x !== i) })} testid={`bh-data-field-remove-${idx}-${i}`} />
        </div>
      ))}
      <button type="button" data-testid={`bh-data-add-field-${idx}`}
        onClick={() => update({ ...item, fields: [...item.fields, { name: "", type: "text" }] })}
        className="text-[11px] text-amber-200 hover:text-amber-100 inline-flex items-center gap-1">
        <Plus className="w-3 h-3" /> Add field
      </button>
      <Input value={item.relations} onChange={(v) => update({ ...item, relations: v })} ph="Related to (optional) — e.g. each customer has many orders" testid={`bh-data-relations-${idx}`} />
    </>
  );
}

function RoleEditor({ item, update, idx }) {
  return (
    <>
      <Input value={item.name} onChange={(v) => update({ ...item, name: v })} ph="Role name — e.g. Manager" testid={`bh-role-name-${idx}`} />
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
        {PERMS.map((p) => {
          const on = !!item.perms?.[p];
          return (
            <button key={p} type="button" data-testid={`bh-role-perm-${p}-${idx}`}
              onClick={() => update({ ...item, perms: { ...item.perms, [p]: !on } })}
              className={`h-8 rounded-lg text-[11px] font-medium capitalize inline-flex items-center justify-center gap-1 ring-1 ${
                on ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" : "bg-surface-2 text-ink-mute ring-hairline hover:text-ink"}`}>
              {on && <Check className="w-3 h-3" />}{p}
            </button>
          );
        })}
      </div>
      <Input value={item.notes} onChange={(v) => update({ ...item, notes: v })} ph="Notes (optional) — e.g. only sees their own region" testid={`bh-role-notes-${idx}`} />
    </>
  );
}

function RuleEditor({ item, update, idx }) {
  return (
    <>
      <Input value={item.when} onChange={(v) => update({ ...item, when: v })} ph="When… e.g. an order is over $100" testid={`bh-rule-when-${idx}`} />
      <Input value={item.then} onChange={(v) => update({ ...item, then: v })} ph="Then… e.g. apply a 10% discount" testid={`bh-rule-then-${idx}`} />
    </>
  );
}

function FlowEditor({ item, update, idx }) {
  return (
    <>
      <Input value={item.trigger} onChange={(v) => update({ ...item, trigger: v })} ph="When this happens… e.g. a new order is created" testid={`bh-flow-trigger-${idx}`} />
      {item.steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[11px] text-ink-mute w-5 shrink-0 text-right">{i + 1}.</span>
          <Input value={s} onChange={(v) => update({ ...item, steps: item.steps.map((x, y) => (y === i ? v : x)) })} ph="Step — e.g. notify the admin" testid={`bh-flow-step-${idx}-${i}`} />
          <RemoveBtn onClick={() => update({ ...item, steps: item.steps.filter((_, x) => x !== i) })} testid={`bh-flow-step-remove-${idx}-${i}`} />
        </div>
      ))}
      <button type="button" data-testid={`bh-flow-add-step-${idx}`}
        onClick={() => update({ ...item, steps: [...item.steps, ""] })}
        className="text-[11px] text-amber-200 hover:text-amber-100 inline-flex items-center gap-1">
        <Plus className="w-3 h-3" /> Add step
      </button>
    </>
  );
}

function FormEditor({ item, update, idx }) {
  const setField = (i, patch) => update({
    ...item, fields: item.fields.map((f, x) => (x === i ? { ...f, ...patch } : f)),
  });
  return (
    <>
      <Input value={item.name} onChange={(v) => update({ ...item, name: v })} ph="Form purpose — e.g. Customer feedback" testid={`bh-form-name-${idx}`} />
      <Input value={item.where} onChange={(v) => update({ ...item, where: v })} ph="Where it appears — e.g. a Feedback page in the nav" testid={`bh-form-where-${idx}`} />
      {item.fields.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={f.label} onChange={(v) => setField(i, { label: v })} ph="Field label — e.g. Rating 1-5" testid={`bh-form-field-${idx}-${i}`} />
          <Select value={f.type} onChange={(v) => setField(i, { type: v })} options={FIELD_TYPES} testid={`bh-form-type-${idx}-${i}`} />
          <RemoveBtn onClick={() => update({ ...item, fields: item.fields.filter((_, x) => x !== i) })} testid={`bh-form-field-remove-${idx}-${i}`} />
        </div>
      ))}
      <button type="button" data-testid={`bh-form-add-field-${idx}`}
        onClick={() => update({ ...item, fields: [...item.fields, { label: "", type: "text" }] })}
        className="text-[11px] text-amber-200 hover:text-amber-100 inline-flex items-center gap-1">
        <Plus className="w-3 h-3" /> Add field
      </button>
    </>
  );
}

function ReportEditor({ item, update, idx }) {
  return (
    <>
      <Input value={item.measure} onChange={(v) => update({ ...item, measure: v })} ph="What to measure — e.g. orders per day" testid={`bh-report-measure-${idx}`} />
      <div className="flex items-center gap-2">
        <Input value={item.group} onChange={(v) => update({ ...item, group: v })} ph="Grouped by — e.g. status" testid={`bh-report-group-${idx}`} />
        <Select value={item.chart} onChange={(v) => update({ ...item, chart: v })} options={CHARTS} testid={`bh-report-chart-${idx}`} />
      </div>
    </>
  );
}

function IntegrationEditor({ item, update, idx }) {
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {SERVICES.map((s) => (
          <button key={s} type="button" data-testid={`bh-int-service-${s.toLowerCase().replace(/\s/g, "-")}-${idx}`}
            onClick={() => update({ ...item, service: s })}
            className={`h-7 px-2.5 rounded-full text-[11px] font-medium ring-1 ${
              item.service === s ? "bg-amber-400/15 text-amber-200 ring-amber-400/30" : "bg-surface-2 text-ink-mute ring-hairline hover:text-ink"}`}>
            {s}
          </button>
        ))}
      </div>
      <Input value={item.what} onChange={(v) => update({ ...item, what: v })} ph="What it should do — e.g. take card payments at checkout" testid={`bh-int-what-${idx}`} />
    </>
  );
}

const EDITORS = {
  data: DataEntityEditor, roles: RoleEditor, logic: RuleEditor,
  workflow: FlowEditor, form: FormEditor, report: ReportEditor, integration: IntegrationEditor,
};

// ─── hub shell ───────────────────────────────────────────────────────────
const RAIL_TOP = [
  { key: "appbuilder", label: "App Builder", icon: Rocket, desc: "Answer simple questions — AI builds it" },
];
const RAIL_BOTTOM = [
  { key: "templates", label: "Templates", icon: LayoutTemplate, desc: "Start from a ready-made app" },
];

export default function BuildersHub({ projectId, onBuild, busy, locked = false, relatedChatId }) {
  const [specs, setSpecs] = useState(null);
  const [active, setActive] = useState(locked ? "templates" : "appbuilder");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState({});
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => { setAiText(""); }, [active]);

  useEffect(() => {
    let cancelled = false;
    api.get(`/dev-projects/${projectId}/builders`)
      .then(({ data }) => { if (!cancelled) setSpecs(data.specs || {}); })
      .catch(() => { if (!cancelled) setSpecs({}); });
    return () => { cancelled = true; };
  }, [projectId]);

  const isSpecial = active === "appbuilder" || active === "templates";
  const builder = isSpecial ? null : BUILDERS.find((b) => b.key === active);
  const spec = builder ? (specs?.[active] || builder.empty()) : {};
  const items = builder ? (spec[builder.itemsKey] || []) : [];

  const setSpec = (next) => {
    setSpecs((s) => ({ ...s, [active]: next }));
    setDirty((d) => ({ ...d, [active]: true }));
  };

  const save = useCallback(async (key, specToSave) => {
    setSaving(true);
    try {
      await api.put(`/dev-projects/${projectId}/builders/${key}`, { spec: specToSave });
      setDirty((d) => ({ ...d, [key]: false }));
      return true;
    } catch {
      toast.error("Couldn't save the spec");
      return false;
    } finally {
      setSaving(false);
    }
  }, [projectId]);

  const instruction = builder ? builder.compose(spec) : null;

  const saveAndApply = async () => {
    if (busy || saving) return;
    const ok = await save(active, spec);
    if (!ok) return;
    if (instruction) {
      onBuild(instruction);
      toast.success("Applied — @devmanager is building it into your app");
    } else {
      toast.success("Saved");
    }
  };

  const generateAI = async () => {
    if (!aiText.trim() || aiBusy) return;
    setAiBusy(true);
    try {
      const { data } = await api.post(
        `/dev-projects/${projectId}/builders/${active}/generate`, { text: aiText },
      );
      setSpecs((s) => ({ ...s, [active]: data.spec }));
      setDirty((d) => ({ ...d, [active]: false }));
      setAiText("");
      toast.success("Spec generated — review the cards, then Save & Apply");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "AI generation failed — try again");
    } finally {
      setAiBusy(false);
    }
  };

  const suggestAI = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    try {
      const { data } = await api.post(
        `/dev-projects/${projectId}/builders/${active}/suggest`,
      );
      setSpecs((s) => ({ ...s, [active]: data.spec }));
      setDirty((d) => ({ ...d, [active]: false }));
      toast.success("Suggestions added — review, edit, then Save & Apply");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't suggest — try again");
    } finally {
      setAiBusy(false);
    }
  };

  if (specs === null) {
    return (
      <div className="h-full flex items-center justify-center text-ink-mute">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading builders…
      </div>
    );
  }

  const Editor = builder ? EDITORS[active] : null;

  return (
    <div className="h-full flex min-h-0" data-testid="builders-hub">
      {/* rail */}
      <div className="w-14 sm:w-52 shrink-0 border-r border-hairline bg-surface overflow-y-auto py-2">
        {[...RAIL_TOP, ...BUILDERS, ...RAIL_BOTTOM].map((b) => {
          const isActive = b.key === active;
          const count = b.itemsKey ? (specs[b.key]?.[b.itemsKey] || []).length : 0;
          const showLock = locked && b.key !== "templates";
          return (
            <button key={b.key} type="button" data-testid={`bh-nav-${b.key}`}
              onClick={() => setActive(b.key)}
              className={`w-full flex items-center gap-2.5 px-3 sm:px-4 py-2.5 text-left ${
                isActive ? "bg-amber-400/[0.08] text-amber-200" : "text-ink-dim hover:text-ink hover:bg-surface-2"}`}>
              <b.icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:block min-w-0 flex-1">
                <span className="block text-[12px] font-medium">{b.label}</span>
                <span className="block text-[10px] text-ink-mute truncate">{b.desc}</span>
              </span>
              {showLock && <Lock className="hidden sm:block w-3 h-3 text-amber-300/70 shrink-0" />}
              {!showLock && count > 0 && (
                <span className="hidden sm:inline-flex text-[10px] font-mono px-1.5 rounded-full bg-emerald-500/10 text-emerald-300">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* editor pane */}
      <div className="flex-1 min-w-0 flex flex-col">
        {active === "templates" ? (
          <TemplatesPanel locked={locked} relatedChatId={relatedChatId} onBuild={onBuild} busy={busy} />
        ) : locked ? (
          <LockedBuildersPanel relatedChatId={relatedChatId} />
        ) : active === "appbuilder" ? (
          <AppBuilderPanel onBuild={onBuild} busy={busy} />
        ) : (
          <>
        <div className="px-4 py-3 border-b border-hairline flex items-center gap-2 shrink-0">
          <builder.icon className="w-4 h-4 text-amber-300" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-ink">{builder.label} Builder</div>
            <div className="text-[11px] text-ink-mute truncate">Plain English — no code. @devmanager builds it into your app.</div>
          </div>
          <button type="button" data-testid="bh-build-btn" disabled={busy || saving || (!dirty[active] && !instruction)}
            onClick={saveAndApply}
            className="h-8 px-3.5 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[12px] inline-flex items-center gap-1.5 disabled:opacity-40">
            {busy || saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {busy ? "Building…" : "Save & Apply"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Plain-English AI assist */}
          <div className="rounded-xl bg-surface ring-1 ring-hairline p-3 space-y-2" data-testid="bh-ai-panel">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-amber-200/70">
              <Wand2 className="w-3 h-3" /> Describe it — AI fills in the cards
            </div>
            <textarea
              value={aiText} onChange={(e) => setAiText(e.target.value)} rows={2}
              data-testid="bh-ai-text"
              placeholder={`e.g. ${builder.aiHint}`}
              className="w-full px-3 py-2 rounded-lg bg-surface-2 ring-1 ring-hairline focus:ring-amber-400/40 outline-none text-[13px] text-ink placeholder:text-ink-mute resize-none"
            />
            <div className="flex justify-between items-center gap-2">
              <button type="button" data-testid="bh-ai-suggest" disabled={aiBusy}
                onClick={suggestAI}
                title="AI reads your app's code and specs, then proposes entries it's missing"
                className="h-8 px-3 rounded-pill bg-surface-2 hover:bg-surface-3 ring-1 ring-hairline text-ink-dim hover:text-amber-200 font-medium text-[12px] inline-flex items-center gap-1.5 disabled:opacity-40">
                {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5" />}
                Suggest for me
              </button>
              <button type="button" data-testid="bh-ai-generate" disabled={!aiText.trim() || aiBusy}
                onClick={generateAI}
                className="h-8 px-3.5 rounded-pill bg-surface-2 hover:bg-surface-3 ring-1 ring-amber-400/30 text-amber-200 font-semibold text-[12px] inline-flex items-center gap-1.5 disabled:opacity-40">
                {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                {aiBusy ? "Working…" : "Generate with AI"}
              </button>
            </div>
          </div>

          {items.length === 0 && (
            <div className="text-[12px] text-ink-mute rounded-xl bg-surface ring-1 ring-hairline p-4">
              Nothing here yet. Describe what you want above and let AI fill in the cards,
              or add an entry manually below — then hit{" "}
              <span className="text-amber-200 font-medium">Save &amp; Apply</span> and
              @devmanager will wire it into the app.
            </div>
          )}
          {items.map((item, i) => (
            <Card key={i}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0 space-y-2.5">
                  <Editor item={item} idx={i} update={(next) => setSpec({
                    ...spec, [builder.itemsKey]: items.map((x, y) => (y === i ? next : x)),
                  })} />
                </div>
                <RemoveBtn testid={`bh-item-remove-${i}`}
                  onClick={() => setSpec({ ...spec, [builder.itemsKey]: items.filter((_, x) => x !== i) })} />
              </div>
            </Card>
          ))}
          <button type="button" data-testid="bh-add-item"
            onClick={() => setSpec({ ...spec, [builder.itemsKey]: [...items, builder.newItem()] })}
            className="w-full h-10 rounded-xl border border-dashed border-hairline text-[12px] text-ink-dim hover:text-amber-200 hover:border-amber-400/30 inline-flex items-center justify-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add {builder.label.replace(/s$/, "").toLowerCase()}
          </button>

          {instruction && (
            <div className="rounded-xl bg-amber-400/[0.05] ring-1 ring-amber-400/15 p-3" data-testid="bh-instruction-preview">
              <div className="text-[10px] font-mono uppercase tracking-widest text-amber-200/70 mb-1">
                What @devmanager will be told
              </div>
              <div className="text-[12px] text-ink-dim leading-relaxed">{instruction}</div>
            </div>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
}


function LockedBuildersPanel({ relatedChatId }) {
  return (
    <div className="h-full flex items-center justify-center p-6" data-testid="builders-locked">
      <div className="max-w-md text-center space-y-3">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-400/15 ring-1 ring-amber-400/30 flex items-center justify-center text-amber-300">
          <Lock className="w-5 h-5" />
        </div>
        <div className="text-[15px] font-semibold text-ink">
          Builders unlock when you hire @devmanager
        </div>
        <div className="text-[12px] text-ink-dim leading-relaxed">
          One-time payment, no subscription. @devmanager plans, builds, tests and
          ships everything you configure here — the guided App Builder, data models,
          roles, rules, workflows, forms, reports and integrations.
        </div>
        <div className="flex justify-center">
          {relatedChatId ? (
            <HireDevTeamButton chatId={relatedChatId} variant="toolbar" />
          ) : (
            <span className="text-[12px] text-ink-mute italic">
              Open the linked chat to hire @devmanager.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
