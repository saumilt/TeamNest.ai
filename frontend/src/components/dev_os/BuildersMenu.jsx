import { useState } from "react";
import {
  Blocks, Braces, ShieldCheck, Database, Workflow, ClipboardList,
  BarChart3, Plug, ChevronRight, Send,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

/**
 * BuildersMenu — plain-English "Builders" for non-technical users.
 * Each builder opens a tiny guided form; on submit the answers are composed
 * into one clear instruction and sent to @devmanager via onSubmit().
 */
const BUILDERS = [
  {
    key: "logic", label: "Business Logic", icon: Braces,
    desc: "Add an if-this-then-that rule",
    fields: [
      { k: "when", label: "When…", ph: "a customer places an order over $100" },
      { k: "then", label: "Then…", ph: "apply a 10% discount and show a banner" },
    ],
    compose: (v) => `Add this business rule to the app: When ${v.when}, then ${v.then}. Implement it end-to-end so it actually works in the UI.`,
  },
  {
    key: "roles", label: "Roles & Permissions", icon: ShieldCheck,
    desc: "Who can see and do what",
    fields: [
      { k: "role", label: "Role name", ph: "Manager" },
      { k: "can", label: "They can…", ph: "approve orders and see all reports" },
      { k: "cannot", label: "They cannot…", ph: "delete customers or change settings" },
    ],
    compose: (v) => `Add a "${v.role}" role to the app. People with this role can ${v.can}. They cannot ${v.cannot}. Enforce this in every screen and menu.`,
  },
  {
    key: "data", label: "Data Model", icon: Database,
    desc: "Track a new kind of thing",
    fields: [
      { k: "thing", label: "What to track", ph: "Customers" },
      { k: "fields", label: "Fields to store", ph: "name, email, phone, status" },
      { k: "rel", label: "Related to (optional)", ph: "each customer has many orders", optional: true },
    ],
    compose: (v) => `Add a new data model "${v.thing}" with fields: ${v.fields}.${v.rel ? ` Relationships: ${v.rel}.` : ""} Build the list view, add/edit forms and a detail view for it, wired into the navigation.`,
  },
  {
    key: "workflow", label: "Workflow Automation", icon: Workflow,
    desc: "Automate multi-step actions",
    fields: [
      { k: "trigger", label: "When this happens…", ph: "a new order is created" },
      { k: "steps", label: "Do these steps…", ph: "mark it pending, notify the admin, add it to the queue" },
    ],
    compose: (v) => `Add a workflow automation: when ${v.trigger}, automatically ${v.steps}. Show the automation's results in the UI so users can see it worked.`,
  },
  {
    key: "form", label: "Form Builder", icon: ClipboardList,
    desc: "Add a form that saves data",
    fields: [
      { k: "purpose", label: "Form purpose", ph: "Customer feedback" },
      { k: "fields", label: "Form fields", ph: "name, rating 1-5, comments" },
      { k: "where", label: "Where it appears", ph: "a Feedback page in the nav" },
    ],
    compose: (v) => `Add a "${v.purpose}" form with these fields: ${v.fields}. Put it in ${v.where}, validate the inputs, and save submissions so they can be viewed later in a list.`,
  },
  {
    key: "report", label: "Report Builder", icon: BarChart3,
    desc: "Charts & summaries",
    fields: [
      { k: "measure", label: "What to measure", ph: "orders per day" },
      { k: "group", label: "Grouped by", ph: "status" },
      { k: "chart", label: "Chart type", ph: "bar chart" },
    ],
    compose: (v) => `Add a report showing ${v.measure}, grouped by ${v.group}, displayed as a ${v.chart}. Put it on a Reports page with a summary table under the chart.`,
  },
  {
    key: "integration", label: "Integration", icon: Plug,
    desc: "Connect an outside service",
    fields: [
      { k: "service", label: "Service", ph: "Stripe" },
      { k: "what", label: "What it should do", ph: "take card payments at checkout" },
    ],
    compose: (v) => `Add a ${v.service} integration: ${v.what}. Build the full UI flow and clearly stub the external calls so real API keys can be plugged in later.`,
  },
];

export default function BuildersMenu({ onSubmit, disabled }) {
  const [open, setOpen] = useState(false);
  const [builder, setBuilder] = useState(null);
  const [values, setValues] = useState({});

  const pick = (b) => {
    setBuilder(b);
    setValues({});
    setOpen(false);
  };

  const ready = builder
    ? builder.fields.every((f) => f.optional || (values[f.k] || "").trim())
    : false;

  const submit = () => {
    if (!builder || !ready) return;
    const clean = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, (v || "").trim()]),
    );
    onSubmit(builder.compose(clean));
    setBuilder(null);
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        data-testid="builders-menu-btn"
        className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-amber-400/10 hover:bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/30 font-medium disabled:opacity-40"
      >
        <Blocks className="w-3 h-3" /> Builders
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            data-testid="builders-menu-list"
            className="absolute bottom-[calc(100%+6px)] left-0 z-40 w-72 rounded-xl bg-[#101013] border border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-white/5 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              Describe it in plain English — @devmanager builds it
            </div>
            <ul className="py-1 max-h-80 overflow-y-auto">
              {BUILDERS.map((b) => (
                <li key={b.key}>
                  <button
                    type="button"
                    onClick={() => pick(b)}
                    data-testid={`builder-option-${b.key}`}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.06]"
                  >
                    <span className="w-7 h-7 rounded-lg bg-amber-400/10 ring-1 ring-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
                      <b.icon className="w-3.5 h-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-zinc-100 font-medium">{b.label}</span>
                      <span className="block text-[11px] text-zinc-500 truncate">{b.desc}</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <Dialog open={!!builder} onOpenChange={(v) => !v && setBuilder(null)}>
        <DialogContent className="sm:max-w-md bg-surface border-hairline" data-testid="builder-dialog">
          {builder && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-[15px]">
                  <builder.icon className="w-4 h-4 text-amber-300" />
                  {builder.label} Builder
                </DialogTitle>
                <DialogDescription className="text-[12px]">
                  Fill this in plain English — no code needed. @devmanager will build it.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {builder.fields.map((f) => (
                  <div key={f.k}>
                    <label className="block text-[11px] uppercase tracking-wider font-semibold text-ink-mute mb-1">
                      {f.label}
                    </label>
                    <input
                      type="text"
                      value={values[f.k] || ""}
                      onChange={(e) => setValues((s) => ({ ...s, [f.k]: e.target.value }))}
                      placeholder={`e.g. ${f.ph}`}
                      data-testid={`builder-field-${f.k}`}
                      className="w-full h-10 px-3 rounded-lg bg-surface-2 ring-1 ring-hairline focus:ring-amber-400/40 outline-none text-[13px] text-ink placeholder:text-ink-mute"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={submit}
                  disabled={!ready}
                  data-testid="builder-submit-btn"
                  className="w-full h-10 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[13px] inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" /> Build it
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
