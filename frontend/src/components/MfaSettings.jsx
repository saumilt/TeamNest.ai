import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { toast } from "sonner";
import { Shield, ShieldCheck, KeyRound, Trash2, Copy, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

/** Detects mobile native shell (Capacitor) so we can show Face ID copy. */
function isCapacitorNative() {
  if (typeof window === "undefined") return false;
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

function isWebAuthnSupported() {
  if (typeof window === "undefined") return false;
  return Boolean(window.PublicKeyCredential);
}

export default function MfaSettings() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [enrolling, setEnrolling] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  const native = isCapacitorNative();
  const webauthnOK = isWebAuthnSupported();

  const loadStatus = async () => {
    try {
      const { data } = await api.get("/mfa/status");
      setStatus(data);
    } catch (err) {
      toast.error("Could not load MFA status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const guessDeviceName = () => {
    if (deviceName.trim()) return deviceName.trim();
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone/.test(ua)) return "iPhone / iPad";
    if (/Android/.test(ua)) return "Android device";
    if (/Mac/.test(ua)) return "Mac";
    if (/Win/.test(ua)) return "Windows PC";
    return "This device";
  };

  const enroll = async () => {
    if (!webauthnOK) {
      toast.error("This browser does not support passkeys. Try Safari, Chrome, Edge or Firefox latest.");
      return;
    }
    setEnrolling(true);
    try {
      const begin = await api.post("/mfa/passkey/register/begin", {
        device_name: guessDeviceName(),
      });
      let attestation;
      try {
        attestation = await startRegistration({ optionsJSON: begin.data.options });
      } catch (err) {
        toast.error(err?.message?.includes("denied") ? "You cancelled the passkey prompt." : "Passkey enrollment failed");
        return;
      }
      attestation.device_name = guessDeviceName();
      const { data } = await api.post("/mfa/passkey/register/complete", {
        credential: attestation,
        challenge_id: begin.data.challenge_id,
      });
      if (data.recovery_codes?.length) {
        setRecoveryCodes(data.recovery_codes);
      }
      toast.success("Passkey enrolled — MFA is now active");
      setDeviceName("");
      await loadStatus();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not enroll passkey");
    } finally {
      setEnrolling(false);
    }
  };

  const removePasskey = async (id) => {
    if (!confirm("Remove this passkey? If it is your only one, MFA will be disabled.")) return;
    try {
      await api.delete(`/mfa/passkey/${id}`);
      toast.success("Passkey removed");
      await loadStatus();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not remove passkey");
    }
  };

  const regenerateCodes = async () => {
    if (!confirm("This invalidates all previously generated recovery codes. Continue?")) return;
    try {
      const { data } = await api.post("/mfa/recovery-codes/regenerate");
      setRecoveryCodes(data.recovery_codes);
      toast.success("New recovery codes generated");
      await loadStatus();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not regenerate");
    }
  };

  const disableMfa = async () => {
    try {
      await api.post("/mfa/disable");
      toast.success("Two-factor authentication disabled");
      setShowDisableConfirm(false);
      await loadStatus();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not disable MFA");
    }
  };

  const copyCodes = () => {
    if (!recoveryCodes) return;
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    toast.success("Recovery codes copied");
  };

  const downloadCodes = () => {
    if (!recoveryCodes) return;
    const blob = new Blob(
      [
        "TeamNest.ai — Two-factor authentication recovery codes\n",
        "Generated: " + new Date().toLocaleString() + "\n",
        "Each code can be used once. Store them somewhere safe.\n\n",
        recoveryCodes.join("\n"),
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "teamnest-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <section className="border border-white/10 rounded-md bg-[#0F0F12] p-6 text-zinc-500 text-sm">
        Loading two-factor settings…
      </section>
    );
  }

  return (
    <section className="border border-white/10 rounded-md bg-[#0F0F12]" data-testid="mfa-section">
      <header className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="font-mono uppercase text-xs tracking-widest text-zinc-400">
          {status?.mfa_enabled ? (
            <ShieldCheck className="inline w-4 h-4 mr-2 text-emerald-400" />
          ) : (
            <Shield className="inline w-4 h-4 mr-2 text-zinc-500" />
          )}
          Two-factor authentication
        </h2>
        <span
          className={
            "text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-sm border " +
            (status?.mfa_enabled
              ? "border-emerald-400/40 text-emerald-300 bg-emerald-400/10"
              : "border-white/10 text-zinc-500")
          }
          data-testid="mfa-status-pill"
        >
          {status?.mfa_enabled ? "Active" : "Off"}
        </span>
      </header>

      <div className="p-6 space-y-6">
        <p className="text-sm text-zinc-400 leading-relaxed">
          Add a {native ? "Face ID / fingerprint" : "passkey (Face ID, Touch ID, Windows Hello or hardware key)"} as a second factor.
          You will need it every time you sign in on a new device.
        </p>

        {!webauthnOK && (
          <div className="text-xs text-amber-300 bg-amber-400/5 border border-amber-400/30 rounded-sm p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            This browser does not support passkeys. Use Safari, Chrome, Edge or Firefox latest.
          </div>
        )}

        {/* Recovery codes modal */}
        {recoveryCodes && (
          <div
            className="border border-amber-400/40 bg-amber-400/5 rounded-sm p-4 space-y-3"
            data-testid="mfa-recovery-codes"
          >
            <div className="flex items-start gap-2 text-amber-200">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <strong className="text-amber-100">Save these recovery codes.</strong> Each works once if you lose access
                to your passkey. They will not be shown again.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm text-amber-100 bg-black/30 rounded-sm p-3">
              {recoveryCodes.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={copyCodes}
                data-testid="mfa-copy-codes"
                variant="outline"
                className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm text-xs h-9"
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
              </Button>
              <Button
                onClick={downloadCodes}
                data-testid="mfa-download-codes"
                variant="outline"
                className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm text-xs h-9"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" /> Download
              </Button>
              <Button
                onClick={() => setRecoveryCodes(null)}
                data-testid="mfa-dismiss-codes"
                className="bg-amber-400 hover:bg-amber-300 text-black rounded-sm text-xs h-9 ml-auto"
              >
                I saved them
              </Button>
            </div>
          </div>
        )}

        {/* Enrolled passkeys */}
        {status?.passkeys?.length > 0 && (
          <div className="space-y-2">
            <Label className="label-mono">Enrolled devices</Label>
            <div className="space-y-2">
              {status.passkeys.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-[#121214] border border-white/5 rounded-sm px-3 py-2"
                  data-testid={`passkey-row-${p.id}`}
                >
                  <div>
                    <div className="text-sm text-zinc-200">{p.device_name}</div>
                    <div className="text-[11px] font-mono text-zinc-500">
                      Added {new Date(p.created_at).toLocaleDateString()}
                      {p.last_used_at && ` · last used ${new Date(p.last_used_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <button
                    onClick={() => removePasskey(p.id)}
                    className="text-zinc-500 hover:text-red-400 p-1.5"
                    aria-label="Remove passkey"
                    data-testid={`remove-passkey-${p.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enroll form */}
        <div className="space-y-2">
          <Label className="label-mono">{status?.mfa_enabled ? "Add another device" : "Set up passkey"}</Label>
          <div className="flex gap-2">
            <Input
              data-testid="mfa-device-name-input"
              placeholder="Device label (optional)"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="bg-[#121214] border-white/10 rounded-sm"
              disabled={enrolling || !webauthnOK}
            />
            <Button
              onClick={enroll}
              disabled={enrolling || !webauthnOK}
              data-testid="mfa-enroll-btn"
              className="bg-amber-400 hover:bg-amber-300 text-black rounded-sm font-mono uppercase tracking-widest text-xs h-10 px-5"
            >
              <KeyRound className="w-4 h-4 mr-2" />
              {enrolling ? "Waiting…" : status?.mfa_enabled ? "Add device" : "Enable 2FA"}
            </Button>
          </div>
        </div>

        {/* Recovery codes management */}
        {status?.mfa_enabled && (
          <div className="border-t border-white/5 pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-zinc-300">Recovery codes</div>
                <div className="text-[11px] font-mono text-zinc-500">
                  {status.recovery_codes_remaining} of 10 unused
                </div>
              </div>
              <Button
                onClick={regenerateCodes}
                data-testid="mfa-regen-codes-btn"
                variant="outline"
                className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm text-xs h-9"
              >
                Regenerate codes
              </Button>
            </div>

            {showDisableConfirm ? (
              <div className="border border-red-500/30 bg-red-500/5 rounded-sm p-3 space-y-2">
                <div className="text-xs text-red-300">
                  Disable two-factor authentication? All passkeys and recovery codes will be removed.
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={disableMfa}
                    data-testid="mfa-disable-confirm"
                    className="bg-red-500 hover:bg-red-400 text-white rounded-sm text-xs h-9"
                  >
                    Yes, disable
                  </Button>
                  <Button
                    onClick={() => setShowDisableConfirm(false)}
                    variant="outline"
                    className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm text-xs h-9"
                  >
                    Keep enabled
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowDisableConfirm(true)}
                className="text-xs text-red-400 hover:text-red-300"
                data-testid="mfa-disable-btn"
              >
                Disable two-factor authentication
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
