import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  User, GraduationCap, Users, Building2, Landmark, Sparkles,
  ArrowRight, ArrowLeft, Check, Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { WebThemeProvider } from "@/context/WebThemeContext";
import { LogoMark, Wordmark } from "@/components/web/atoms";

const PERSONAS = [
  { id: "personal", icon: User, title: "Personal research", sub: "Organize research & projects for yourself" },
  { id: "student", icon: GraduationCap, title: "Student / school project", sub: "Collaborate on group assignments" },
  { id: "team", icon: Users, title: "Team collaboration", sub: "Run projects with your team" },
  { id: "business", icon: Building2, title: "Business", sub: "Company knowledge & workflows" },
  { id: "enterprise", icon: Landmark, title: "Enterprise", sub: "Org-wide, governed AI collaboration" },
  { id: "other", icon: Sparkles, title: "Something else", sub: "Just exploring" },
];

const PERSONAL_TEMPLATES = [
  "Research Topic", "Personal Plan", "Business Idea", "Purchase Comparison", "Trip Planning",
];

export default function Onboarding() {
  const nav = useNavigate();
  const { user, loading, refresh } = useAuth();
  const [step, setStep] = useState(1);
  const [persona, setPersona] = useState(null);
  const [projectName, setProjectName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) nav("/login", { replace: true });
    else if (user.onboarding_completed) nav("/chats", { replace: true });
  }, [user, loading, nav]);

  const choosePersona = async (id) => {
    setPersona(id);
    api.patch("/user/onboarding", { persona: id, completed: false }).catch(() => {});
    if (id === "enterprise" || id === "other") {
      await finish(id, null);
    } else {
      setStep(2);
    }
  };

  const finish = async (personaId, firstChatName) => {
    setBusy(true);
    try {
      let created = null;
      if (firstChatName) {
        const { data } = await api.post("/chats", {
          type: "group",
          name: firstChatName,
          description: dueDate ? `Due ${dueDate}` : "",
          member_ids: [],
          default_models: ["chatgpt", "claude", "gemini"],
          posting_policy: "all",
        });
        created = data;
      }
      await api.patch("/user/onboarding", { persona: personaId, completed: true });
      await refresh();
      toast.success("You're all set!");
      nav(created ? `/chats/${created.id}` : "/chats", { replace: true });
    } catch (e) {
      toast.error("Could not finish setup — taking you to your chats");
      nav("/chats", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    await api.patch("/user/onboarding", { persona: persona || "other", completed: true }).catch(() => {});
    await refresh();
    nav("/chats", { replace: true });
  };

  const canContinue =
    persona === "personal" ? !!template : ["student", "team", "business"].includes(persona) ? !!projectName.trim() : true;

  const submitStep2 = () => {
    if (persona === "personal") return finish(persona, `${template}`);
    return finish(persona, projectName.trim());
  };

  return (
    <WebThemeProvider forceDark>
      <div className="min-h-screen bg-[var(--w-bg)] text-[var(--w-text)] flex flex-col">
        <header className="h-16 px-5 flex items-center border-b border-[var(--w-hairline)]">
          <div className="flex items-center gap-2.5">
            <LogoMark size={28} /> <Wordmark size="md" />
          </div>
          <button
            type="button"
            onClick={skip}
            data-testid="onboarding-skip"
            className="ml-auto text-[13px] text-[var(--w-text-mute)] hover:text-[var(--w-text)]"
          >
            Skip for now
          </button>
        </header>

        <main className="flex-1 flex items-start justify-center px-5 py-12">
          <div className="w-full max-w-2xl">
            {step === 1 && (
              <div data-testid="onboarding-step-persona">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--w-brand)] mb-3">
                  Welcome{user?.name ? `, ${user.name}` : ""}
                </div>
                <h1 className="text-[30px] sm:text-[36px] font-bold tracking-[-0.02em]">
                  How will you use TeamNest?
                </h1>
                <p className="mt-2 text-[15px] text-[var(--w-text-dim)]">
                  We&apos;ll tailor your first step. You can change this anytime.
                </p>
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PERSONAS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      data-testid={`persona-${p.id}`}
                      onClick={() => choosePersona(p.id)}
                      className="group flex items-center gap-3.5 text-left rounded-[16px] border border-[var(--w-hairline)] bg-[var(--w-surface)] p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--w-hairline-strong)]"
                    >
                      <span className="w-10 h-10 rounded-xl bg-[var(--w-brand-tint)] flex items-center justify-center shrink-0">
                        <p.icon className="w-5 h-5 text-[var(--w-brand)]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-bold">{p.title}</span>
                        <span className="block text-[12.5px] text-[var(--w-text-dim)] truncate">{p.sub}</span>
                      </span>
                      <ArrowRight className="w-4 h-4 ml-auto text-[var(--w-text-mute)] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div data-testid="onboarding-step-first">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1.5 text-[13px] text-[var(--w-text-mute)] hover:text-[var(--w-text)] mb-5"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <h1 className="text-[28px] sm:text-[32px] font-bold tracking-[-0.02em]">
                  {persona === "personal" ? "Start your first workspace" : "Create your first project"}
                </h1>

                {persona === "personal" ? (
                  <div className="mt-6 flex flex-wrap gap-2.5">
                    {PERSONAL_TEMPLATES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        data-testid={`template-${t.replace(/\s+/g, "-").toLowerCase()}`}
                        onClick={() => setTemplate(t)}
                        className={`px-4 py-2.5 rounded-full border text-[14px] transition-colors ${
                          template === t
                            ? "border-[var(--w-brand)] bg-[var(--w-brand-tint)]/30 text-[var(--w-text)]"
                            : "border-[var(--w-hairline)] text-[var(--w-text-dim)] hover:border-[var(--w-hairline-strong)]"
                        }`}
                      >
                        {template === t && <Check className="w-3.5 h-3.5 inline mr-1.5 text-[var(--w-brand)]" />}
                        {t}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-6 space-y-4 max-w-md">
                    <div>
                      <label className="block text-[12px] font-semibold text-[var(--w-text-dim)] mb-1.5">
                        {persona === "student" ? "Project name" : persona === "team" ? "Team / project name" : "Workspace / project name"}
                      </label>
                      <input
                        data-testid="onboarding-project-name"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder={persona === "student" ? "e.g. History group project" : "e.g. Q3 Launch"}
                        className="w-full h-11 px-3.5 rounded-[12px] bg-[var(--w-surface)] border border-[var(--w-hairline)] text-[var(--w-text)] placeholder:text-[var(--w-text-mute)] focus:outline-none focus:border-[var(--w-brand)]"
                      />
                    </div>
                    {persona === "student" && (
                      <div>
                        <label className="block text-[12px] font-semibold text-[var(--w-text-dim)] mb-1.5">
                          Due date (optional)
                        </label>
                        <input
                          type="date"
                          data-testid="onboarding-due-date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          className="h-11 px-3.5 rounded-[12px] bg-[var(--w-surface)] border border-[var(--w-hairline)] text-[var(--w-text)] focus:outline-none focus:border-[var(--w-brand)]"
                        />
                      </div>
                    )}
                    <p className="text-[12.5px] text-[var(--w-text-mute)]">
                      You can invite {persona === "student" ? "classmates" : "members"} from inside the project once it&apos;s created.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  data-testid="onboarding-finish"
                  onClick={submitStep2}
                  disabled={!canContinue || busy}
                  className="mt-8 inline-flex items-center gap-2 h-11 px-6 rounded-full bg-[var(--w-brand)] text-black font-bold text-[14px] hover:brightness-95 active:scale-[0.98] disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Create & continue
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </WebThemeProvider>
  );
}
