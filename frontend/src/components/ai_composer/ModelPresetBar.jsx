import { useEffect, useState } from "react";
import { Bookmark, Plus, X, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

/**
 * Workspace-shared AI model presets (e.g. "Deep dive = Opus + Sonnet"). Tap a
 * preset to apply its model combo; owners/admins/members can save the current
 * selection as a new shared preset. Used inside the AI model picker.
 */
export default function ModelPresetBar({ selected = [], onApply }) {
  const { user } = useAuth();
  const [presets, setPresets] = useState([]);
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const canManage = ["owner", "admin", "member"].includes(user?.role);

  const load = () =>
    api.get("/workspace/model-presets").then(({ data }) => setPresets(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const isActive = (p) =>
    p.models.length === selected.length && p.models.every((m) => selected.includes(m));

  const save = async () => {
    const n = name.trim();
    if (!n || saving) return;
    setSaving(true);
    try {
      await api.post("/workspace/model-presets", { name: n, models: selected });
      toast.success(`Preset "${n}" saved`);
      setName(""); setShowSave(false); load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save preset");
    } finally { setSaving(false); }
  };

  const del = async (p) => {
    try {
      await api.delete(`/workspace/model-presets/${p.id}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not delete preset");
    }
  };

  if (!presets.length && !canManage) return null;

  return (
    <div data-testid="model-preset-bar" className="mb-2">
      <div className="flex items-center gap-1 mb-1">
        <Bookmark className="w-3 h-3 text-ink-mute" />
        <span className="text-[10px] font-medium text-ink-mute uppercase tracking-wide">Presets</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const active = isActive(p);
          return (
            <div
              key={p.id}
              className={`inline-flex items-center rounded-full border text-[11px] transition-colors ${
                active ? "bg-ai/15 border-ai/50 text-ai" : "border-hairline text-ink-dim hover:border-ai/40"
              }`}
            >
              <button
                type="button"
                data-testid={`model-preset-${p.id}`}
                onClick={() => onApply?.(p.models)}
                title={p.models.join(" + ")}
                className="pl-2 pr-1.5 h-7 inline-flex items-center gap-1"
              >
                {active && <Check className="w-3 h-3" />}
                {p.name}
                <span className="text-[9px] text-ink-mute"> · {p.models.length}</span>
              </button>
              {canManage && (
                <button
                  type="button"
                  data-testid={`model-preset-delete-${p.id}`}
                  onClick={() => del(p)}
                  title="Delete preset"
                  className="pr-1.5 pl-0.5 h-7 inline-flex items-center text-ink-mute hover:text-red-400"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          );
        })}
        {canManage && !showSave && (
          <button
            type="button"
            data-testid="model-preset-save-open"
            onClick={() => setShowSave(true)}
            disabled={!selected.length}
            className="px-2 h-7 rounded-full border border-dashed border-hairline text-ink-mute hover:text-ink hover:border-ai/40 text-[11px] inline-flex items-center gap-1 disabled:opacity-40"
          >
            <Plus className="w-3 h-3" /> Save
          </button>
        )}
        {canManage && showSave && (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              data-testid="model-preset-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") { setShowSave(false); setName(""); }
              }}
              placeholder="Preset name"
              maxLength={40}
              className="h-7 w-24 px-2 rounded-full bg-surface-2 border border-hairline text-[11px] text-ink outline-none focus:border-ai/50"
            />
            <button
              type="button"
              data-testid="model-preset-save-confirm"
              onClick={save}
              disabled={saving || !name.trim()}
              className="h-7 px-2 rounded-full bg-ai text-black text-[11px] font-semibold disabled:opacity-40"
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
