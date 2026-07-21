import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, ChevronLeft, Loader2, Sparkles, Shield } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { WebThemeProvider } from "@/context/WebThemeContext";
import SeoHelmet from "@/components/web/SeoHelmet";
import { PasswordInput } from "@/components/ui-v2/PasswordInput";
import { LogoMark, Wordmark, PrimaryButton, GhostButton, Pill } from "@/components/web/atoms";
import { ChatDetailWithCompare, ChatListPanel } from "@/components/web/mocks";
import MfaChallenge from "@/components/MfaChallenge";
import { isInviteOnly, useLaunchConfig } from "@/hooks/useLaunchConfig";

function ProductSurfacePanel() {
  return (
    <aside className="hidden lg:flex relative bg-[var(--w-bg-2)] overflow-hidden border-r border-[var(--w-hairline)] flex-col">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(45% 35% at 20% 20%, rgba(255,210,63,0.10), transparent), radial-gradient(50% 40% at 80% 70%, rgba(183,148,244,0.10), transparent)",
        }}
      />
      <div className="relative flex-1 flex flex-col p-12 gap-8">
        <Link to="/" className="flex items-center gap-2 w-fit">
          <LogoMark size={32} />
          <Wordmark size="md" />
        </Link>
        <div>
          <Pill tone="ai" className="mb-5">
            <Sparkles className="w-3.5 h-3.5" /> AI-native team comms
          </Pill>
          <h1
            className="text-[36px] xl:text-[44px] font-bold tracking-[-0.02em] text-[var(--w-text)] leading-[1.05] max-w-[18ch]"
            style={{ textWrap: "balance" }}
          >
            Chat with your team — and 6 AIs at once.
          </h1>
        </div>
        <div className="flex-1 grid grid-cols-[160px_1fr] xl:grid-cols-[200px_1fr] gap-px bg-[var(--w-hairline)] rounded-[20px] overflow-hidden border border-[var(--w-hairline)] shadow-[0_24px_60px_-32px_rgba(0,0,0,0.5)]">
          <ChatListPanel />
          <ChatDetailWithCompare />
        </div>
        <div className="flex items-center gap-3 text-[12px] text-[var(--w-text-mute)]">
          <Shield className="w-4 h-4" />
          SOC 2 in flight · GDPR · DPDP
        </div>
      </div>
    </aside>
  );
}

function ForgotForm({ onBack }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch {
      // Endpoint is intentionally non-enumerating; still show the generic state.
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[420px]" data-testid="forgot-form">
      <div className="lg:hidden mb-8">
        <Link to="/" className="inline-flex items-center gap-2">
          <LogoMark size={32} />
          <Wordmark size="md" />
        </Link>
      </div>
      {sent ? (
        <div data-testid="forgot-sent">
          <h2 className="text-[28px] font-bold tracking-[-0.02em] text-[var(--w-text)] mb-2">Check your email.</h2>
          <p className="text-[15px] text-[var(--w-text-dim)] mb-7">
            If an account exists for <span className="text-[var(--w-text)] font-semibold">{email}</span>, we've sent a
            password reset link. It expires in 1 hour.
          </p>
          <GhostButton onClick={onBack} className="w-full justify-center" data-testid="forgot-back-btn">
            Back to sign in
          </GhostButton>
        </div>
      ) : (
        <>
          <h2 className="text-[28px] font-bold tracking-[-0.02em] text-[var(--w-text)] mb-2">Forgot your password?</h2>
          <p className="text-[15px] text-[var(--w-text-dim)] mb-7">
            Enter your account email and we'll send you a link to reset it.
          </p>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-[12px] font-semibold uppercase tracking-widest text-[var(--w-text-mute)] mb-1.5 block">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full h-12 px-4 rounded-[14px] bg-[var(--w-surface)] border border-[var(--w-hairline)] text-[15px] text-[var(--w-text)] placeholder:text-[var(--w-text-mute)] focus:outline-none focus:border-[var(--w-brand)]"
                data-testid="forgot-email-input"
              />
            </div>
            <PrimaryButton type="submit" disabled={busy || !email} className="w-full mt-2" data-testid="forgot-submit-btn">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Send reset link
            </PrimaryButton>
          </form>
          <p className="mt-6 text-center text-[14px] text-[var(--w-text-dim)]">
            Remembered it?{" "}
            <button type="button" onClick={onBack} className="font-semibold text-[var(--w-text)] hover:text-[var(--w-brand)]" data-testid="forgot-signin-link">
              Sign in
            </button>
          </p>
        </>
      )}
    </div>
  );
}

function AuthForm({ mode, setMode }) {
  const { login, signup, demoLogin, completeMfaLogin } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(null); // { mfaToken, email }
  const launchCfg = useLaunchConfig();
  const inviteGated = isInviteOnly(launchCfg);

  if (inviteGated && mode === "signup") {
    return (
      <div className="w-full max-w-[400px] mx-auto text-center" data-testid="auth-invite-gate">
        <Pill tone="ai" className="mb-5"><Sparkles className="w-3.5 h-3.5" /> Private beta</Pill>
        <h2 className="text-[26px] font-bold tracking-[-0.02em] text-[var(--w-text)] mb-3">
          TeamNest is currently invite-only.
        </h2>
        <p className="text-[14px] text-[var(--w-text-dim)] mb-6">
          Join the waitlist or enter an invite code to unlock access.
        </p>
        <div className="space-y-3">
          <PrimaryButton as={Link} to="/waitlist" className="w-full justify-center" data-testid="auth-gate-waitlist">
            Join Waitlist <ArrowRight className="w-4 h-4" />
          </PrimaryButton>
          <GhostButton as={Link} to="/invite" className="w-full justify-center" data-testid="auth-gate-invite">
            Enter Invite Code
          </GhostButton>
        </div>
        <p className="mt-6 text-[14px] text-[var(--w-text-dim)]">
          Already have an account?{" "}
          <button type="button" onClick={() => setMode("login")} className="font-semibold text-[var(--w-text)]" data-testid="auth-gate-login">
            Sign in
          </button>
        </p>
      </div>
    );
  }

  if (mode === "forgot") {
    return <ForgotForm onBack={() => setMode("login")} />;
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const result = await login(form.email, form.password);
        if (result?.mfaRequired) {
          setMfa({ mfaToken: result.mfaToken, email: result.email });
          return;
        }
      } else {
        await signup(form.name || form.email.split("@")[0], form.email, form.password);
      }
      nav("/chats");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  const onMfaSuccess = (data) => {
    completeMfaLogin(data);
    nav("/chats");
  };

  const onDemo = async () => {
    setBusy(true);
    try {
      await demoLogin();
      nav("/chats");
    } catch {
      toast.error("Demo login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[420px]">
      <div className="lg:hidden mb-8">
        <Link to="/" className="inline-flex items-center gap-2">
          <LogoMark size={32} />
          <Wordmark size="md" />
        </Link>
      </div>

      {mfa ? (
        <>
          <h2 className="text-[28px] font-bold tracking-[-0.02em] text-[var(--w-text)] mb-7">
            Verify it&apos;s you.
          </h2>
          <MfaChallenge
            mfaToken={mfa.mfaToken}
            email={mfa.email}
            onSuccess={onMfaSuccess}
            onCancel={() => {
              setMfa(null);
              setBusy(false);
            }}
          />
        </>
      ) : (
        <>
      <h2 className="text-[28px] font-bold tracking-[-0.02em] text-[var(--w-text)] mb-2">
        {mode === "login" ? "Welcome back." : "Create your workspace."}
      </h2>
      <p className="text-[15px] text-[var(--w-text-dim)] mb-7">
        {mode === "login"
          ? "Sign in to your team workspace."
          : "Free forever. No credit card. Spin up in under a minute."}
      </p>

      {!inviteGated && (
        <PrimaryButton
          onClick={onDemo}
          disabled={busy}
          className="w-full mb-3"
          data-testid="auth-demo-btn"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Try the demo — no signup
        </PrimaryButton>
      )}

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center"><span className="w-full h-px bg-[var(--w-hairline)]" /></div>
        <div className="relative flex justify-center text-[12px] uppercase tracking-widest text-[var(--w-text-mute)] bg-[var(--w-bg)] px-3 w-fit mx-auto">or</div>
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <div>
            <label className="text-[12px] font-semibold uppercase tracking-widest text-[var(--w-text-mute)] mb-1.5 block">
              Name
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Sam Patel"
              className="w-full h-12 px-4 rounded-[14px] bg-[var(--w-surface)] border border-[var(--w-hairline)] text-[15px] text-[var(--w-text)] placeholder:text-[var(--w-text-mute)] focus:outline-none focus:border-[var(--w-brand)]"
              data-testid="auth-name-input"
            />
          </div>
        )}
        <div>
          <label className="text-[12px] font-semibold uppercase tracking-widest text-[var(--w-text-mute)] mb-1.5 block">
            Email
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@company.com"
            className="w-full h-12 px-4 rounded-[14px] bg-[var(--w-surface)] border border-[var(--w-hairline)] text-[15px] text-[var(--w-text)] placeholder:text-[var(--w-text-mute)] focus:outline-none focus:border-[var(--w-brand)]"
            data-testid="auth-email-input"
          />
        </div>
        <div>
          <label className="text-[12px] font-semibold uppercase tracking-widest text-[var(--w-text-mute)] mb-1.5 block">
            Password
          </label>
          <PasswordInput
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
            className="w-full h-12 px-4 rounded-[14px] bg-[var(--w-surface)] border border-[var(--w-hairline)] text-[15px] text-[var(--w-text)] placeholder:text-[var(--w-text-mute)] focus:outline-none focus:border-[var(--w-brand)]"
            testId="auth-password-input"
          />
        </div>
        {mode === "login" && (
          <div className="text-right -mt-1">
            <button
              type="button"
              onClick={() => setMode("forgot")}
              className="text-[13px] font-semibold text-[var(--w-text-dim)] hover:text-[var(--w-brand)]"
              data-testid="auth-forgot-link"
            >
              Forgot password?
            </button>
          </div>
        )}
        <PrimaryButton type="submit" disabled={busy} className="w-full mt-2" data-testid="auth-submit-btn">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          {mode === "login" ? "Sign in" : "Create account"}
        </PrimaryButton>
      </form>

      <p className="mt-6 text-center text-[14px] text-[var(--w-text-dim)]">
        {mode === "login" ? "New to TeamNest?" : "Already have an account?"}
        {" "}
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="font-semibold text-[var(--w-text)] hover:text-[var(--w-brand)]"
          data-testid="auth-toggle-mode"
        >
          {mode === "login" ? "Sign up free" : "Sign in"}
        </button>
      </p>

      <p className="mt-8 text-center text-[11px] text-[var(--w-text-mute)]">
        SOC 2 in flight · GDPR · DPDP
      </p>
        </>
      )}
    </div>
  );
}

export default function WebAuth({ defaultMode }) {
  const { pathname } = useLocation();
  const initial = defaultMode || (pathname.endsWith("/signup") ? "signup" : "login");
  const [mode, setMode] = useState(initial);
  const [params] = useSearchParams();
  const { demoLogin } = useAuth();
  const nav = useNavigate();

  // Auto-trigger demo when /login?demo=1 — for "Try the demo" CTA.
  useEffect(() => {
    if (params.get("demo") === "1") {
      (async () => {
        try { await demoLogin(); nav("/chats"); }
        catch { toast.error("Demo login failed"); }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <WebThemeProvider>
      <SeoHelmet
        title={mode === "login" ? "Log in · TeamNest.ai" : "Sign up · TeamNest.ai"}
        description="Sign in to TeamNest — AI-native team workspace with 6 models side-by-side."
        path={pathname}
      />
      <div className="min-h-screen bg-[var(--w-bg)] text-[var(--w-text)] grid grid-cols-1 lg:grid-cols-2">
        <ProductSurfacePanel />
        <div className="flex flex-col">
          <div className="lg:absolute lg:top-0 lg:left-0 p-4 lg:p-6">
            <Link to="/" className="inline-flex items-center gap-1.5 text-[14px] text-[var(--w-text-dim)] hover:text-[var(--w-text)]" data-testid="auth-back-home">
              <ChevronLeft className="w-4 h-4" />
              Back to home
            </Link>
          </div>
          <div className="flex-1 flex items-center justify-center px-6 py-12">
            <AuthForm mode={mode} setMode={setMode} />
          </div>
        </div>
      </div>
    </WebThemeProvider>
  );
}
