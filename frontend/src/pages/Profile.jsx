import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, Mail, Phone, Lock, Image as ImageIcon, Sparkles, Zap, Wand2 } from "lucide-react";
import MfaSettings from "@/components/MfaSettings";
import safeStorage from "@/lib/safeStorage";
import { QUICKBAR_HIDDEN_KEY } from "@/components/TopActionBar";

export default function Profile() {
  const { user, refresh } = useAuth();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPersona, setSavingPersona] = useState(false);

  const [form, setForm] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    avatar: user?.avatar || "",
  });
  const [pwd, setPwd] = useState({ current: "", next: "" });
  const [emailForm, setEmailForm] = useState({ new_email: "", password: "" });

  const PERSONAS = [
    { id: "personal", label: "Just me" },
    { id: "student", label: "Student" },
    { id: "team", label: "A team" },
    { id: "business", label: "Business" },
    { id: "enterprise", label: "Enterprise" },
  ];
  const savePersona = async (persona) => {
    if (persona === user?.persona) return;
    setSavingPersona(true);
    try {
      await api.patch("/user/onboarding", { persona, completed: true });
      await refresh();
      toast.success("Home tailored to you");
    } catch {
      toast.error("Couldn't update — please try again");
    } finally {
      setSavingPersona(false);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.patch("/me/profile", {
        name: form.name,
        phone: form.phone,
        avatar: form.avatar,
      });
      await refresh();
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwd.next.length < 6) return toast.error("New password must be 6+ characters");
    setSavingPwd(true);
    try {
      await api.post("/me/password", { current_password: pwd.current, new_password: pwd.next });
      toast.success("Password updated");
      setPwd({ current: "", next: "" });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not change password");
    } finally {
      setSavingPwd(false);
    }
  };

  const changeEmail = async (e) => {
    e.preventDefault();
    setSavingEmail(true);
    try {
      await api.post("/me/email", emailForm);
      await refresh();
      toast.success("Email updated");
      setEmailForm({ new_email: "", password: "" });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not change email");
    } finally {
      setSavingEmail(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-3xl">
      <div className="label-mono mb-3">ACCOUNT / PROFILE</div>
      <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tighter mb-10">
        Your profile
      </h1>

      {user?.must_change_password && (
        <div
          data-testid="profile-must-change-pwd-banner"
          className="mb-6 border border-yellow-400/40 bg-yellow-500/10 text-yellow-200 rounded-sm px-4 py-3 text-sm"
        >
          <strong>Action needed:</strong> You signed in with a one-time
          password we generated for you. Set a new password below before you
          continue using TeamNest.ai.
        </div>
      )}

      {/* Profile basics */}
      <section className="border border-white/5 bg-[#0a0a0a] mb-6" data-testid="profile-basics">
        <header className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold tracking-tight">Public info</h2>
          {user?.pro_boost_active && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-yellow-300">
              <Sparkles className="w-3 h-3" /> Pro boost active
            </span>
          )}
        </header>
        <form onSubmit={saveProfile} className="p-6 space-y-4">
          <div>
            <Label className="label-mono"><User className="inline w-3 h-3 mr-1.5" /> Full name</Label>
            <Input
              data-testid="profile-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="bg-[#121214] border-white/10 rounded-sm mt-2"
            />
          </div>
          <div>
            <Label className="label-mono"><Phone className="inline w-3 h-3 mr-1.5" /> Phone <span className="text-zinc-600 normal-case">(lets teammates find &amp; add you)</span></Label>
            <Input
              data-testid="profile-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="bg-[#121214] border-white/10 rounded-sm mt-2"
              placeholder="+1 555 0100"
              autoComplete="tel"
            />
          </div>
          <div>
            <Label className="label-mono"><ImageIcon className="inline w-3 h-3 mr-1.5" /> Avatar URL <span className="text-zinc-600 normal-case">(optional)</span></Label>
            <Input
              data-testid="profile-avatar"
              value={form.avatar}
              onChange={(e) => setForm({ ...form, avatar: e.target.value })}
              className="bg-[#121214] border-white/10 rounded-sm mt-2"
              placeholder="https://…"
            />
            {form.avatar && (
              <div className="mt-3 flex items-center gap-3">
                <img src={form.avatar} alt="" className="w-12 h-12 object-cover rounded-sm border border-white/10" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">PREVIEW</span>
              </div>
            )}
          </div>
          <Button
            type="submit"
            data-testid="profile-save"
            disabled={savingProfile}
            className="bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm font-mono uppercase tracking-widest text-xs h-10 px-5"
          >
            {savingProfile ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </section>

      {/* Email */}
      <section className="border border-white/5 bg-[#0a0a0a] mb-6" data-testid="profile-email">
        <header className="px-6 py-4 border-b border-white/5">
          <h2 className="font-display text-lg font-bold tracking-tight">Email</h2>
        </header>
        <div className="p-6 space-y-4">
          <div className="text-sm text-zinc-300">
            <Mail className="inline w-3.5 h-3.5 mr-1.5 text-zinc-500" />
            Current: <span className="font-mono text-zinc-100">{user?.email}</span>
          </div>
          <form onSubmit={changeEmail} className="space-y-4">
            <div>
              <Label className="label-mono">New email</Label>
              <Input
                data-testid="profile-new-email"
                type="email"
                value={emailForm.new_email}
                onChange={(e) => setEmailForm({ ...emailForm, new_email: e.target.value })}
                required
                className="bg-[#121214] border-white/10 rounded-sm mt-2"
              />
            </div>
            <div>
              <Label className="label-mono">Confirm with password</Label>
              <Input
                data-testid="profile-email-password"
                type="password"
                value={emailForm.password}
                onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
                required
                className="bg-[#121214] border-white/10 rounded-sm mt-2"
              />
            </div>
            <Button
              type="submit"
              data-testid="profile-change-email"
              disabled={savingEmail || !emailForm.new_email || !emailForm.password}
              variant="outline"
              className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase tracking-widest text-xs h-10 px-5"
            >
              {savingEmail ? "Updating…" : "Change email"}
            </Button>
          </form>
        </div>
      </section>

      {/* Password */}
      <section className="border border-white/5 bg-[#0a0a0a] mb-6" data-testid="profile-password">
        <header className="px-6 py-4 border-b border-white/5">
          <h2 className="font-display text-lg font-bold tracking-tight">
            <Lock className="inline w-4 h-4 mr-2 text-zinc-500" />
            Password
          </h2>
        </header>
        <form onSubmit={changePassword} className="p-6 space-y-4">
          <div>
            <Label className="label-mono">Current password</Label>
            <Input
              data-testid="profile-current-pwd"
              type="password"
              value={pwd.current}
              onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
              required
              className="bg-[#121214] border-white/10 rounded-sm mt-2"
            />
          </div>
          <div>
            <Label className="label-mono">New password</Label>
            <Input
              data-testid="profile-new-pwd"
              type="password"
              value={pwd.next}
              onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
              required
              minLength={6}
              className="bg-[#121214] border-white/10 rounded-sm mt-2"
              placeholder="At least 6 characters"
            />
          </div>
          <Button
            type="submit"
            data-testid="profile-change-pwd"
            disabled={savingPwd || !pwd.current || !pwd.next}
            variant="outline"
            className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase tracking-widest text-xs h-10 px-5"
          >
            {savingPwd ? "Updating…" : "Change password"}
          </Button>
        </form>
      </section>

      <MfaSettings />

      {/* Preferences */}
      <section className="border border-white/5 bg-[#0a0a0a] mb-6 mt-6" data-testid="profile-preferences">
        <header className="px-6 py-4 border-b border-white/5">
          <h2 className="font-display text-lg font-bold tracking-tight">Preferences</h2>
        </header>
        <div className="p-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" /> Welcome tour
            </div>
            <div className="text-[13px] text-zinc-500 mt-0.5">
              Replay the quick intro to chat, comparing AIs, and inviting teammates.
            </div>
          </div>
          <Button
            type="button"
            data-testid="replay-welcome-btn"
            onClick={() => {
              try { if (user?.id) window.localStorage.removeItem(`tn:welcomed:${user.id}`); } catch { /* ignore */ }
              window.dispatchEvent(new Event("tn:replay-welcome"));
              toast.success("Here's the welcome tour again");
            }}
            variant="outline"
            className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase tracking-widest text-xs h-10 px-5 shrink-0"
          >
            Show welcome again
          </Button>
        </div>
        <div className="p-6 flex items-center justify-between gap-4 border-t border-white/5">
          <div>
            <div className="text-sm text-zinc-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-yellow-300" /> Quick actions bar
            </div>
            <div className="text-[13px] text-zinc-500 mt-0.5">
              Show the "What do you want to do next?" shortcuts on Chats, Home, Tasks, and AI.
            </div>
          </div>
          <Button
            type="button"
            data-testid="show-quickbar-btn"
            onClick={() => {
              safeStorage.set(QUICKBAR_HIDDEN_KEY, "0");
              toast.success("Quick actions bar is back on");
            }}
            variant="outline"
            className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase tracking-widest text-xs h-10 px-5 shrink-0"
          >
            Show quick actions
          </Button>
        </div>
        <div className="p-6 border-t border-white/5" data-testid="profile-persona">
          <div className="text-sm text-zinc-200 flex items-center gap-1.5 mb-1">
            <Wand2 className="w-3.5 h-3.5 text-yellow-300" /> How you use TeamNest
          </div>
          <div className="text-[13px] text-zinc-500 mb-3">
            Sets which shortcuts and example prompts your Home highlights.
          </div>
          <div className="flex flex-wrap gap-2">
            {PERSONAS.map((p) => {
              const active = user?.persona === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`profile-persona-${p.id}`}
                  disabled={savingPersona}
                  onClick={() => savePersona(p.id)}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50 ${
                    active
                      ? "border-yellow-400/60 bg-yellow-400/10 text-yellow-300"
                      : "border-white/10 bg-transparent text-zinc-300 hover:bg-white/5 hover:border-yellow-400/40"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
