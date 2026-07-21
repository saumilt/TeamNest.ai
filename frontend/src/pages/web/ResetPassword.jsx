import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, ChevronLeft, Loader2, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { WebThemeProvider } from "@/context/WebThemeContext";
import SeoHelmet from "@/components/web/SeoHelmet";
import { LogoMark, Wordmark, PrimaryButton } from "@/components/web/atoms";

function formatDetail(detail, fallback) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || "").filter(Boolean).join(" ") || fallback;
  return fallback;
}

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const invalidLink = !token;
  const mismatch = confirm.length > 0 && password !== confirm;
  const pwStrong = password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password)
    && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
  const canSubmit = token && pwStrong && password === confirm && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      toast.success("Password updated");
      setTimeout(() => nav("/login"), 1800);
    } catch (err) {
      toast.error(formatDetail(err?.response?.data?.detail, "Could not reset password"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <WebThemeProvider>
      <SeoHelmet title="Reset password · TeamNest.ai" description="Choose a new TeamNest password." path="/reset-password" />
      <div className="min-h-screen bg-[var(--w-bg)] text-[var(--w-text)] flex flex-col">
        <div className="p-4 lg:p-6">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-[14px] text-[var(--w-text-dim)] hover:text-[var(--w-text)]" data-testid="reset-back-login">
            <ChevronLeft className="w-4 h-4" />
            Back to sign in
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-[420px]">
            <Link to="/" className="inline-flex items-center gap-2 mb-8">
              <LogoMark size={32} />
              <Wordmark size="md" />
            </Link>

            {invalidLink ? (
              <div data-testid="reset-invalid">
                <h2 className="text-[26px] font-bold tracking-[-0.02em] mb-3">Invalid reset link.</h2>
                <p className="text-[14px] text-[var(--w-text-dim)] mb-6">
                  This link is missing or malformed. Request a new one from the sign-in page.
                </p>
                <PrimaryButton as={Link} to="/login" className="w-full justify-center" data-testid="reset-request-new">
                  Back to sign in <ArrowRight className="w-4 h-4" />
                </PrimaryButton>
              </div>
            ) : done ? (
              <div data-testid="reset-success">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/20 flex items-center justify-center mb-4">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h2 className="text-[26px] font-bold tracking-[-0.02em] mb-2">Password updated.</h2>
                <p className="text-[14px] text-[var(--w-text-dim)]">Redirecting you to sign in…</p>
              </div>
            ) : (
              <>
                <h2 className="text-[28px] font-bold tracking-[-0.02em] mb-2">Choose a new password.</h2>
                <p className="text-[15px] text-[var(--w-text-dim)] mb-7">Enter a new password for your account.</p>
                <form onSubmit={submit} className="space-y-3">
                  <div>
                    <label className="text-[12px] font-semibold uppercase tracking-widest text-[var(--w-text-mute)] mb-1.5 block">New password</label>
                    <PasswordInput
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-12 px-4 rounded-[14px] bg-[var(--w-surface)] border border-[var(--w-hairline)] text-[15px] text-[var(--w-text)] placeholder:text-[var(--w-text-mute)] focus:outline-none focus:border-[var(--w-brand)]"
                      testId="reset-password-input"
                    />
                    <p className="text-[12px] text-[var(--w-text-mute)] mt-1.5">
                      At least 8 characters with an uppercase, lowercase, number and special character.
                    </p>
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold uppercase tracking-widest text-[var(--w-text-mute)] mb-1.5 block">Confirm password</label>
                    <PasswordInput
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-12 px-4 rounded-[14px] bg-[var(--w-surface)] border border-[var(--w-hairline)] text-[15px] text-[var(--w-text)] placeholder:text-[var(--w-text-mute)] focus:outline-none focus:border-[var(--w-brand)]"
                      testId="reset-confirm-input"
                    />
                    {mismatch && <p className="text-[12px] text-red-500 mt-1.5" data-testid="reset-mismatch">Passwords don&apos;t match.</p>}
                  </div>
                  <PrimaryButton type="submit" disabled={!canSubmit} className="w-full mt-2" data-testid="reset-submit-btn">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    Update password
                  </PrimaryButton>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </WebThemeProvider>
  );
}
