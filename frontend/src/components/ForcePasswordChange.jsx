import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const rules = [
  { key: "len", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { key: "num", label: "A number", test: (p) => /[0-9]/.test(p) },
  { key: "special", label: "A special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/**
 * Blocking full-screen prompt shown when the signed-in user has
 * `must_change_password=true` (admin-provisioned accounts). The app is not
 * reachable until they set their own password.
 */
export default function ForcePasswordChange() {
  const { user, refresh, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const allPass = rules.every((r) => r.test(password));
  const match = confirm.length > 0 && password === confirm;
  const canSubmit = allPass && match && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      await api.post("/me/set-initial-password", { new_password: password });
      toast.success("Password updated — welcome to TeamNest");
      await refresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white flex items-center justify-center px-5" data-testid="force-password-screen">
      <div className="w-full max-w-md">
        <div className="inline-flex rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wide mb-5">
          Secure your account
        </div>
        <h1 className="text-2xl font-bold mb-2">Set your password</h1>
        <p className="text-sm text-zinc-400 mb-6">
          Welcome{user?.name ? `, ${user.name}` : ""}. For security, please replace your
          temporary password before continuing.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="New password" autoFocus data-testid="force-password-input"
            className="w-full h-11 rounded-xl bg-zinc-900 border border-zinc-800 px-3.5 text-sm outline-none focus:border-amber-500/60"
          />
          <input
            type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password" data-testid="force-password-confirm"
            className="w-full h-11 rounded-xl bg-zinc-900 border border-zinc-800 px-3.5 text-sm outline-none focus:border-amber-500/60"
          />
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 py-1">
            {rules.map((r) => {
              const ok = r.test(password);
              return (
                <li key={r.key} className={`text-[12px] flex items-center gap-1.5 ${ok ? "text-emerald-400" : "text-zinc-500"}`}>
                  <span>{ok ? "✓" : "•"}</span>{r.label}
                </li>
              );
            })}
          </ul>
          {confirm.length > 0 && !match && (
            <p className="text-[12px] text-red-500" data-testid="force-password-mismatch">Passwords don&apos;t match.</p>
          )}
          <button
            type="submit" disabled={!canSubmit} data-testid="force-password-submit"
            className="w-full h-11 rounded-full bg-amber-400 text-black font-bold text-sm disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save & continue"}
          </button>
        </form>
        <button onClick={logout} data-testid="force-password-logout" className="mt-4 text-xs text-zinc-500 hover:text-zinc-300">
          Sign out
        </button>
      </div>
    </div>
  );
}
