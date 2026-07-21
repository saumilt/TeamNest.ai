import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { GraduationCap, X } from "lucide-react";

export default function EduVerifyDialog({ open, onClose, onVerified }) {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState(null);

  if (!open) return null;

  const start = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/billing/student/verify/start", { edu_email: email.trim() });
      setDevCode(data.dev_code || null);
      setStep("code");
      toast.success(data.sent ? "Code sent to your .edu inbox" : "Enter the verification code");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Enter a valid .edu email");
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await api.post("/billing/student/verify/confirm", { code: code.trim() });
      toast.success("Student status verified 🎓");
      onVerified?.();
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Incorrect code");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="edu-verify-dialog">
      <div className="w-full max-w-md rounded-2xl bg-surface ring-1 ring-hairline p-6 relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-ink-mute hover:text-ink" data-testid="edu-verify-close">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap className="w-5 h-5 text-amber-400" />
          <h3 className="text-[17px] font-bold text-ink">Verify student status</h3>
        </div>
        <p className="text-[13px] text-ink-dim mb-4">
          The Student plan ($6.99/mo) requires a valid <b>.edu</b> email. We'll send you a 6-digit code.
        </p>

        {step === "email" ? (
          <>
            <input
              data-testid="edu-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              className="w-full h-11 rounded-xl bg-surface-2 ring-1 ring-hairline px-3 text-ink text-[14px] mb-3 focus:ring-amber-400 outline-none"
            />
            <button
              data-testid="edu-send-code"
              disabled={busy || !email.trim()}
              onClick={start}
              className="w-full h-11 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[14px] disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send verification code"}
            </button>
          </>
        ) : (
          <>
            {devCode && (
              <div className="mb-3 text-[12px] text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2" data-testid="edu-dev-code">
                Test environment code: <b>{devCode}</b>
              </div>
            )}
            <input
              data-testid="edu-code-input"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
              className="w-full h-11 rounded-xl bg-surface-2 ring-1 ring-hairline px-3 text-ink text-[16px] tracking-[6px] text-center mb-3 focus:ring-amber-400 outline-none"
            />
            <button
              data-testid="edu-confirm-code"
              disabled={busy || code.trim().length < 4}
              onClick={confirm}
              className="w-full h-11 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[14px] disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button onClick={() => setStep("email")} className="w-full mt-2 text-[12px] text-ink-mute hover:text-ink">
              Use a different email
            </button>
          </>
        )}
      </div>
    </div>
  );
}
