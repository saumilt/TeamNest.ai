import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowRight, Sparkles, Users, AlertCircle, CheckCircle2 } from "lucide-react";
import axios from "axios";

const HERO_IMG =
  "https://images.pexels.com/photos/29506609/pexels-photo-29506609.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

const ONE_DAY_MS = 86_400_000;
const WELCOME_TOAST_DURATION_MS = 6_000;
const EMAIL_DEBOUNCE_MS = 400;

export default function JoinWorkspace() {
  const { token } = useParams();
  const nav = useNavigate();
  const { setAuthFromRedeem } = useAuth();

  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  // null = unknown, true = existing TeamNest user, false = brand-new email
  const [existingUser, setExistingUser] = useState(null);
  const [existingName, setExistingName] = useState(null);
  const [alreadyMember, setAlreadyMember] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/public/invite/${token}`);
        if (cancelled) return;
        setPreview(data);
      } catch (err) {
        if (cancelled) return;
        const msg = err?.response?.data?.detail || "This invite is invalid";
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Debounced check: when email is filled, ask backend whether it's an
  // existing TeamNest user so we can swap the form between "create" and "sign in".
  useEffect(() => {
    const email = form.email.trim().toLowerCase();
    if (!email.includes("@") || email.length < 5) {
      setExistingUser(null);
      setExistingName(null);
      setAlreadyMember(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.post(`${API}/public/invite/check-email`, { token, email });
        if (cancelled) return;
        setExistingUser(!!data.existing_user);
        setExistingName(data.name || null);
        setAlreadyMember(!!data.already_member);
        if (data.existing_user && data.name && !form.name) {
          setForm((f) => ({ ...f, name: data.name }));
        }
      } catch {
        if (cancelled) return;
        setExistingUser(null);
      }
    }, EMAIL_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.email, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/public/invite/redeem`, {
        token,
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: form.phone?.trim() || undefined,
      });
      setAuthFromRedeem(data.token, data.user, data.workspaces);
      if (data.joined_existing_account) {
        toast.success(`Joined ${preview?.workspace_name} with your existing account. Switch workspaces anytime from the sidebar.`);
      } else {
        const days = data.user.pro_boost_until
          ? Math.max(0, Math.ceil((new Date(data.user.pro_boost_until).getTime() - Date.now()) / ONE_DAY_MS))
          : 0;
        if (data.user.pro_boost_active && days > 0) {
          toast.success(
            `🎉 Welcome to ${preview?.workspace_name}! You've unlocked ${days}-day Pro AI Boost — all 6 AI models unlocked.`,
            { duration: WELCOME_TOAST_DURATION_MS }
          );
        } else {
          toast.success(`Welcome to ${preview?.workspace_name}!`);
        }
      }
      nav("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not join workspace");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 opacity-30"
        style={{ backgroundImage: `url(${HERO_IMG})`, backgroundSize: "cover", backgroundPosition: "center" }}
      />
      <div className="absolute inset-0 bg-black/70" />
      <div className="absolute inset-0 dot-grid opacity-50" />

      <div className="relative">
        {/* Brand bar */}
        <header className="border-b border-white/5 px-6 lg:px-12 py-5 flex items-center justify-between">
          <Link to="/" data-testid="brand" className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-yellow-400 text-black flex items-center justify-center font-display font-extrabold text-base group-hover:scale-105 transition">
              TN
            </div>
            <div className="leading-none">
              <div className="font-display font-bold tracking-tight text-lg">
                teamnest<span className="text-yellow-400">.ai</span>
              </div>
              <div className="text-[9px] font-mono tracking-widest text-zinc-500 mt-1">
                AI-NATIVE TEAM COMMS
              </div>
            </div>
          </Link>
          <Link to="/" className="text-xs font-mono uppercase tracking-widest text-zinc-500 hover:text-white">
            ← back to login
          </Link>
        </header>

        <main className="px-6 lg:px-12 py-16 lg:py-24 flex items-center justify-center min-h-[calc(100vh-73px)]">
          <div className="w-full max-w-xl">
            {loading && <div className="h-64 shimmer rounded-sm" />}

            {error && !loading && (
              <div className="border border-red-500/40 bg-red-500/5 rounded-sm p-8 text-center" data-testid="join-error">
                <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-4" />
                <div className="font-display text-2xl mb-2">Invite unavailable</div>
                <p className="text-sm text-zinc-400 mb-6">{error}</p>
                <Link to="/" data-testid="join-back-home">
                  <Button variant="outline" className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase text-xs tracking-widest h-10">
                    Go to login
                  </Button>
                </Link>
              </div>
            )}

            {preview && !loading && !error && (
              <div className="border border-yellow-500/30 bg-[#0a0a0a]/80 backdrop-blur-sm rounded-sm p-8" data-testid="join-card">
                <div className="label-mono mb-2 flex items-center gap-2 text-yellow-400">
                  <Sparkles className="w-3.5 h-3.5" /> YOU&apos;RE INVITED
                </div>
                <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight mb-3" data-testid="join-workspace-name">
                  Join <span className="text-yellow-400">{preview.workspace_name}</span>
                </h1>
                <p className="text-sm text-zinc-400 mb-5">
                  {preview.inviter_name ? (
                    <><span className="text-zinc-200">{preview.inviter_name}</span> invited you to collaborate. </>
                  ) : null}
                  {existingUser ? (
                    <>Sign in with your existing TeamNest account to accept as <span className="text-yellow-300 font-mono uppercase text-[11px]">{preview.role}</span>.</>
                  ) : (
                    <>Create your account to join as <span className="text-yellow-300 font-mono uppercase text-[11px]">{preview.role}</span>.</>
                  )}
                </p>

                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-white/5">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Users className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="text-zinc-200 font-medium">{preview.member_count}</span> teammate{preview.member_count === 1 ? "" : "s"}
                  </div>
                  {preview.expires_at && (
                    <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                      EXPIRES {new Date(preview.expires_at).toLocaleDateString()}
                    </div>
                  )}
                </div>

                {/* Existing-account banner */}
                {existingUser && (
                  <div
                    data-testid="join-existing-banner"
                    className={`flex items-start gap-3 mb-5 p-3 rounded-sm border ${
                      alreadyMember ? "border-zinc-700 bg-zinc-900/60" : "border-emerald-500/30 bg-emerald-500/5"
                    }`}
                  >
                    <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${alreadyMember ? "text-zinc-500" : "text-emerald-400"}`} />
                    <div className="text-xs">
                      {alreadyMember ? (
                        <>You&apos;re already a member of <span className="text-zinc-200">{preview.workspace_name}</span>. Sign in to continue.</>
                      ) : (
                        <>
                          <span className="text-zinc-200">{existingName || "You"}</span> already has a TeamNest account.{" "}
                          Enter your existing password — we&apos;ll add this workspace to your account so you can switch between them anytime.
                        </>
                      )}
                    </div>
                  </div>
                )}

                <form onSubmit={submit} className="space-y-4" data-testid="join-form">
                  <div>
                    <Label className="label-mono">WORK EMAIL</Label>
                    <Input
                      data-testid="join-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      required
                      autoFocus
                      className="bg-[#0a0a0a] border-white/10 rounded-sm mt-2"
                      placeholder="you@company.com"
                    />
                  </div>

                  {/* Name only shown when this is a brand-new TeamNest account.
                      For existing accounts the name is implicit from the existing user. */}
                  {existingUser !== true && (
                    <div>
                      <Label className="label-mono">YOUR NAME</Label>
                      <Input
                        data-testid="join-name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        required={existingUser === false}
                        className="bg-[#0a0a0a] border-white/10 rounded-sm mt-2"
                        placeholder="Alex Chen"
                      />
                    </div>
                  )}

                  {/* Phone (optional, only for new accounts) */}
                  {existingUser !== true && (
                    <div>
                      <Label className="label-mono">
                        Phone <span className="text-zinc-600 normal-case">(optional, lets teammates find you)</span>
                      </Label>
                      <Input
                        data-testid="join-phone"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="bg-[#0a0a0a] border-white/10 rounded-sm mt-2"
                        placeholder="+1 555 0100"
                        autoComplete="tel"
                      />
                    </div>
                  )}

                  <div>
                    <Label className="label-mono">
                      {existingUser ? "YOUR EXISTING PASSWORD" : "CHOOSE A PASSWORD"}
                    </Label>
                    <Input
                      data-testid="join-password"
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      required
                      minLength={existingUser ? undefined : 6}
                      className="bg-[#0a0a0a] border-white/10 rounded-sm mt-2"
                      placeholder={existingUser ? "Your TeamNest password" : "At least 6 characters"}
                    />
                  </div>

                  <Button
                    data-testid="join-submit"
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-sm bg-yellow-500 text-black hover:bg-yellow-400 font-mono uppercase tracking-widest text-xs h-11"
                  >
                    {busy
                      ? (existingUser ? "Joining…" : "Creating…")
                      : (existingUser
                          ? `Sign in & join ${preview.workspace_name}`
                          : `Join ${preview.workspace_name}`)}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </form>

                <p className="text-[11px] text-zinc-600 mt-5 leading-relaxed text-center">
                  By joining you agree to use TeamNest.ai for your team&apos;s collaboration.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
