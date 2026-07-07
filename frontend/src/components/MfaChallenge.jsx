import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { ShieldCheck, KeyRound, LifeBuoy } from "lucide-react";

/**
 * MFA challenge step shown after password is verified but before session is
 * issued. Props:
 *   - mfaToken  (short-lived JWT from /auth/login)
 *   - email     (to display so the user knows who is signing in)
 *   - onSuccess(authPayload)  -> { token, user, workspaces }
 *   - onCancel()              -> reset back to password form
 */
export default function MfaChallenge({ mfaToken, email, onSuccess, onCancel }) {
  const [mode, setMode] = useState("passkey"); // "passkey" | "recovery"
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");

  const runPasskey = async () => {
    setBusy(true);
    try {
      const begin = await api.post("/mfa/passkey/auth/begin", { mfa_token: mfaToken });
      let assertion;
      try {
        assertion = await startAuthentication({ optionsJSON: begin.data.options });
      } catch (err) {
        toast.error("Passkey prompt cancelled");
        return;
      }
      const { data } = await api.post("/mfa/passkey/auth/complete", {
        credential: assertion,
        challenge_id: begin.data.challenge_id,
        mfa_token: mfaToken,
      });
      onSuccess(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Passkey verification failed");
    } finally {
      setBusy(false);
    }
  };

  const useRecovery = async () => {
    if (!code.trim()) return toast.error("Enter a recovery code");
    setBusy(true);
    try {
      const { data } = await api.post("/mfa/recovery/use", {
        code: code.trim(),
        mfa_token: mfaToken,
      });
      onSuccess(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Recovery code invalid");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="mfa-challenge">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400" />
        <div>
          <div className="text-sm text-zinc-200">Two-factor required</div>
          <div className="text-xs text-zinc-500 truncate">{email}</div>
        </div>
      </div>

      {mode === "passkey" ? (
        <>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Confirm with the passkey on this device — Face ID, Touch ID, Windows Hello, or your security key.
          </p>
          <Button
            onClick={runPasskey}
            disabled={busy}
            data-testid="mfa-passkey-btn"
            className="w-full bg-amber-400 hover:bg-amber-300 text-black rounded-sm font-mono uppercase tracking-widest text-xs h-11"
          >
            <KeyRound className="w-4 h-4 mr-2" />
            {busy ? "Verifying…" : "Verify with passkey"}
          </Button>
          <button
            onClick={() => setMode("recovery")}
            className="text-xs text-zinc-400 hover:text-amber-300 flex items-center gap-1.5"
            data-testid="mfa-use-recovery-btn"
          >
            <LifeBuoy className="w-3.5 h-3.5" />
            Use a recovery code instead
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Enter one of the recovery codes you saved when enabling two-factor.
          </p>
          <div>
            <Label className="label-mono">Recovery code</Label>
            <Input
              data-testid="mfa-recovery-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="abcde-12345"
              autoComplete="one-time-code"
              className="bg-[#121214] border-white/10 rounded-sm mt-2 font-mono"
            />
          </div>
          <Button
            onClick={useRecovery}
            disabled={busy || !code.trim()}
            data-testid="mfa-recovery-submit"
            className="w-full bg-amber-400 hover:bg-amber-300 text-black rounded-sm font-mono uppercase tracking-widest text-xs h-11"
          >
            {busy ? "Verifying…" : "Verify code"}
          </Button>
          <button
            onClick={() => setMode("passkey")}
            className="text-xs text-zinc-400 hover:text-amber-300 flex items-center gap-1.5"
          >
            <KeyRound className="w-3.5 h-3.5" />
            Use passkey instead
          </button>
        </>
      )}

      <button
        onClick={onCancel}
        className="text-xs text-zinc-500 hover:text-zinc-300"
        data-testid="mfa-cancel-btn"
      >
        Cancel sign in
      </button>
    </div>
  );
}
