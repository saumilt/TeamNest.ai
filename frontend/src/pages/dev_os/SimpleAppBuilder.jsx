import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  ChevronLeft, ChevronRight, Sparkles, Loader2, LayoutTemplate, PencilRuler,
  Database, ShieldCheck, Plus, X, Check, Rocket,
} from "lucide-react";

/**
 * SimpleAppBuilder — guided, plain-English project start.
 * Step 0: start from a template OR from scratch.
 * Steps 1-3 (scratch): describe the app → what it tracks → who uses it.
 * Finish: creates the project, seeds Builder specs, kicks off the first build.
 */

const ROLE_PRESETS = ["Admin", "Manager", "Staff", "Customer"];
const TRACK_HINTS = ["Customers", "Orders", "Products", "Invoices", "Appointments", "Tasks"];

const ChipInput = ({ items, setItems, placeholder, hints, testid }) => {
  const [draft, setDraft] = useState("");
  const add = (v) => {
    const val = (v ?? draft).trim();
    if (!val || items.includes(val)) { setDraft(""); return; }
    setItems([...items, val]);
    setDraft("");
  };
  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <input
          value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder} data-testid={testid}
          className="flex-1 h-11 px-4 rounded-xl bg-surface-2 ring-1 ring-hairline focus:ring-amber-400/40 outline-none text-[14px] text-ink placeholder:text-ink-mute"
        />
        <button type="button" onClick={() => add()} data-testid={`${testid}-add`}
          className="h-11 px-4 rounded-xl bg-surface-2 hover:bg-surface-3 ring-1 ring-hairline text-ink text-[13px] inline-flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <span key={it} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-amber-400/10 ring-1 ring-amber-400/25 text-amber-200 text-[13px]">
              {it}
              <button type="button" onClick={() => setItems(items.filter((x) => x !== it))}
                data-testid={`${testid}-remove-${it}`} className="text-amber-200/60 hover:text-amber-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      {hints?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hints.filter((h) => !items.includes(h)).map((h) => (
            <button key={h} type="button" onClick={() => add(h)} data-testid={`${testid}-hint-${h}`}
              className="h-7 px-2.5 rounded-full text-[12px] bg-surface-2 ring-1 ring-hairline text-ink-mute hover:text-amber-200 hover:ring-amber-400/30">
              + {h}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default function SimpleAppBuilder() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState(null); // "template" | "scratch"
  const [templates, setTemplates] = useState(null);
  const [installing, setInstalling] = useState(null);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [tracks, setTracks] = useState([]);
  const [roles, setRoles] = useState(["Admin"]);

  useEffect(() => {
    if (mode !== "template" || templates) return;
    api.get("/market/templates")
      .then(({ data }) => setTemplates(data.templates || data || []))
      .catch(() => setTemplates([]));
  }, [mode, templates]);

  const installTemplate = async (t) => {
    const pricing = t.pricing || {};
    if ((pricing.model || "free") !== "free") {
      nav(`/market/install/${t.id}`);
      return;
    }
    setInstalling(t.id);
    try {
      const { data } = await api.post(`/market/templates/${t.id}/install`);
      toast.success(`${t.name} installed — opening the Build Room`);
      nav(`/dev-os/projects/${data.project_id}/studio`);
    } catch (e) {
      if (e?.response?.status === 402) nav(`/market/install/${t.id}`);
      else toast.error(e?.response?.data?.detail || "Install failed");
      setInstalling(null);
    }
  };

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const { data } = await api.post("/dev-projects", {
        name: name.trim(),
        description: desc.trim(),
        problem: desc.trim(),
        source: "manual",
      });
      const pid = data.id;
      if (tracks.length) {
        await api.put(`/dev-projects/${pid}/builders/data`, {
          spec: { entities: tracks.map((t) => ({ name: t, fields: [{ name: "name", type: "text" }], relations: "" })) },
        }).catch(() => {});
      }
      if (roles.length) {
        await api.put(`/dev-projects/${pid}/builders/roles`, {
          spec: {
            roles: roles.map((r) => ({
              name: r,
              perms: r.toLowerCase() === "admin"
                ? { view: true, create: true, edit: true, delete: true, approve: true, export: true, settings: true }
                : { view: true, create: true, edit: true },
              notes: "",
            })),
          },
        }).catch(() => {});
      }
      await api.post(`/dev-projects/${pid}/builds`).catch(() => {});
      toast.success("Project created — @devmanager is building your first version");
      nav(`/dev-os/projects/${pid}/studio`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create the project");
      setCreating(false);
    }
  };

  const scratchSteps = [
    {
      title: "What is your app?",
      valid: name.trim().length >= 2 && desc.trim().length >= 10,
      body: (
        <div className="space-y-4">
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="App name — e.g. Dental Clinic Manager" data-testid="sab-name"
            className="w-full h-12 px-4 rounded-xl bg-surface-2 ring-1 ring-hairline focus:ring-amber-400/40 outline-none text-[15px] text-ink placeholder:text-ink-mute"
          />
          <textarea
            value={desc} onChange={(e) => setDesc(e.target.value)} rows={4}
            placeholder="Describe it in plain English — who it's for and what it should do. e.g. 'A tool for our dental clinic to manage patients, appointments and invoices. Receptionists book visits, dentists see their day, the owner sees revenue.'"
            data-testid="sab-desc"
            className="w-full px-4 py-3 rounded-xl bg-surface-2 ring-1 ring-hairline focus:ring-amber-400/40 outline-none text-[14px] text-ink placeholder:text-ink-mute resize-none leading-relaxed"
          />
        </div>
      ),
    },
    {
      title: "What should it track?",
      subtitle: "The things your app stores — add your own or tap a suggestion. Optional; @devmanager fills gaps.",
      valid: true,
      icon: Database,
      body: <ChipInput items={tracks} setItems={setTracks} placeholder="e.g. Patients" hints={TRACK_HINTS} testid="sab-track" />,
    },
    {
      title: "Who uses it?",
      subtitle: "User roles — each gets its own login and permissions. Optional.",
      valid: true,
      icon: ShieldCheck,
      body: <ChipInput items={roles} setItems={setRoles} placeholder="e.g. Receptionist" hints={ROLE_PRESETS} testid="sab-role" />,
    },
  ];

  const scratchIdx = step - 1;
  const cur = scratchSteps[scratchIdx];

  return (
    <div className="min-h-[100dvh] bg-bg" data-testid="simple-app-builder">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/dev-os" className="text-ink-mute hover:text-ink p-1.5 rounded-md hover:bg-surface-2" data-testid="sab-back">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="text-[16px] font-bold text-ink inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300" /> Simple App Builder
            </div>
            <div className="text-[12px] text-ink-mute">Answer a few plain-English questions — @devmanager builds the app.</div>
          </div>
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <button type="button" data-testid="sab-mode-scratch"
              onClick={() => { setMode("scratch"); setStep(1); }}
              className="w-full text-left rounded-2xl bg-surface ring-1 ring-hairline hover:ring-amber-400/40 p-5 flex items-start gap-4 transition-colors">
              <div className="w-11 h-11 rounded-xl bg-amber-300 text-black flex items-center justify-center shrink-0">
                <PencilRuler className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-ink">Start from scratch — guided</div>
                <div className="text-[12.5px] text-ink-dim mt-0.5">3 quick questions: what it is, what it tracks, who uses it. No prompts, no code.</div>
              </div>
              <ChevronRight className="w-4 h-4 text-ink-mute mt-3" />
            </button>

            <button type="button" data-testid="sab-mode-template"
              onClick={() => setMode(mode === "template" ? null : "template")}
              className={`w-full text-left rounded-2xl bg-surface ring-1 p-5 flex items-start gap-4 transition-colors ${mode === "template" ? "ring-amber-400/40" : "ring-hairline hover:ring-amber-400/40"}`}>
              <div className="w-11 h-11 rounded-xl bg-surface-2 ring-1 ring-amber-400/30 text-amber-200 flex items-center justify-center shrink-0">
                <LayoutTemplate className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-ink">Start from a template</div>
                <div className="text-[12.5px] text-ink-dim mt-0.5">Pick a working app from the store, then modify and enhance it in chat.</div>
              </div>
              <ChevronRight className={`w-4 h-4 text-ink-mute mt-3 transition-transform ${mode === "template" ? "rotate-90" : ""}`} />
            </button>

            {mode === "template" && (
              <div className="space-y-2" data-testid="sab-template-list">
                {templates === null && (
                  <div className="text-[12px] text-ink-mute flex items-center gap-2 p-3">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
                  </div>
                )}
                {templates?.length === 0 && (
                  <div className="text-[12px] text-ink-mute p-3">No templates available yet.</div>
                )}
                {(templates || []).map((t) => {
                  const pricing = t.pricing || {};
                  const free = (pricing.model || "free") === "free";
                  return (
                    <button key={t.id} type="button" data-testid={`sab-template-${t.id}`}
                      disabled={!!installing}
                      onClick={() => installTemplate(t)}
                      className="w-full text-left rounded-xl bg-surface ring-1 ring-hairline hover:ring-amber-400/40 px-4 py-3 flex items-center gap-3 disabled:opacity-50">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold text-ink truncate">{t.name}</div>
                        <div className="text-[11.5px] text-ink-mute truncate">{t.tagline || t.description}</div>
                      </div>
                      <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${free ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-400/15 text-amber-200"}`}>
                        {free ? "Free" : `$${pricing.price_usd}${pricing.model === "monthly" ? "/mo" : ""}`}
                      </span>
                      {installing === t.id
                        ? <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                        : <ChevronRight className="w-4 h-4 text-ink-mute" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step >= 1 && cur && (
          <div className="rounded-2xl bg-surface ring-1 ring-hairline p-5 space-y-5">
            <div className="flex items-center gap-2 text-[11px] font-mono text-ink-mute">
              {scratchSteps.map((_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= scratchIdx ? "bg-amber-300" : "bg-surface-3"}`} />
              ))}
            </div>
            <div>
              <div className="text-[17px] font-bold text-ink">{cur.title}</div>
              {cur.subtitle && <div className="text-[12.5px] text-ink-mute mt-1">{cur.subtitle}</div>}
            </div>
            {cur.body}
            <div className="flex items-center justify-between pt-1">
              <button type="button" data-testid="sab-prev"
                onClick={() => setStep(step - 1)}
                className="h-10 px-4 rounded-pill bg-surface-2 hover:bg-surface-3 text-ink text-[13px] inline-flex items-center gap-1.5">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              {scratchIdx < scratchSteps.length - 1 ? (
                <button type="button" data-testid="sab-next" disabled={!cur.valid}
                  onClick={() => setStep(step + 1)}
                  className="h-10 px-5 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[13px] inline-flex items-center gap-1.5 disabled:opacity-40">
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button type="button" data-testid="sab-create" disabled={creating}
                  onClick={create}
                  className="h-10 px-5 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[13px] inline-flex items-center gap-1.5 disabled:opacity-40">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  {creating ? "Creating…" : "Create & build my app"}
                </button>
              )}
            </div>
            {scratchIdx === scratchSteps.length - 1 && (
              <div className="rounded-xl bg-amber-400/[0.05] ring-1 ring-amber-400/15 p-3 text-[12px] text-ink-dim">
                <span className="text-amber-200 font-medium inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Ready:</span>{" "}
                <span className="font-semibold text-ink">{name || "Your app"}</span>
                {tracks.length > 0 && <> · tracks {tracks.join(", ")}</>}
                {roles.length > 0 && <> · roles: {roles.join(", ")}</>}
                . @devmanager builds a working first version (~60s) and opens the Build Room.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
