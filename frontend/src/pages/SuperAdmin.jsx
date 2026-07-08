import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ShieldCheck, Coins, Loader2, Save } from "lucide-react";

const FIELDS = [
  { key: "free_monthly_credits", label: "Free plan", hint: "AI credits granted each month to every free workspace (also caps the free balance)." },
  { key: "pro_monthly_credits", label: "Pro plan", hint: "Monthly AI credits for Pro workspaces." },
  { key: "team_monthly_credits", label: "Team plan", hint: "Monthly AI credits per seat for Team workspaces." },
];

/**
 * Super Admin — app-level (global) platform settings. Gated to platform super
 * admins (user.is_super_admin). Today it configures per-plan monthly AI credit
 * allowances; the free-plan grant is the headline value.
 */
export default function SuperAdmin() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [values, setValues] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && !user.is_super_admin) {
      nav("/dashboard", { replace: true });
    }
  }, [user, nav]);

  useEffect(() => {
    api
      .get("/superadmin/settings")
      .then(({ data }) => setValues(data.settings))
      .catch(() => toast.error("Failed to load platform settings"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/superadmin/settings", {
        free_monthly_credits: Number(values.free_monthly_credits),
        pro_monthly_credits: Number(values.pro_monthly_credits),
        team_monthly_credits: Number(values.team_monthly_credits),
      });
      setValues(data.settings);
      toast.success("Platform settings saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !values) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-ink-dim">
        <Loader2 className="w-6 h-6 animate-spin text-ai" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink px-6 py-10 md:px-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-ai-tint flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-ai" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold">Super Admin</h1>
            <p className="text-sm text-ink-dim">App-level settings · applies to all workspaces</p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-surface-2 p-6">
          <div className="flex items-center gap-2 mb-5">
            <Coins className="w-4 h-4 text-ai" />
            <h2 className="text-sm font-bold tracking-wide uppercase text-ink-dim">
              Monthly AI credits per plan
            </h2>
          </div>

          <div className="space-y-5">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="sm:w-40 shrink-0">
                  <div className="text-sm font-semibold">{f.label}</div>
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    min="0"
                    data-testid={`setting-${f.key}`}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    className="w-32 bg-bg border border-white/10 rounded-lg px-3 py-2 text-ink focus:border-ai focus:outline-none"
                  />
                  <p className="text-xs text-ink-dim mt-1">{f.hint}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            data-testid="superadmin-save"
            onClick={save}
            disabled={saving}
            className="mt-7 inline-flex items-center gap-2 h-10 px-5 rounded-full bg-ai text-black font-bold text-sm hover:opacity-90 active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
