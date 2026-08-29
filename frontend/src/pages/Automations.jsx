import { Link } from "react-router-dom";
import { Zap, ArrowLeft, Clock, GitBranch, Sparkles } from "lucide-react";

/** Automation Center — Phase-1 placeholder so "+ New → Automation" and the
 *  "Automate Something" Home card have a real destination. The natural-language
 *  Automation Builder + execution engine land in a later phase. */
export default function Automations() {
  return (
    <div className="p-6 lg:p-10 max-w-3xl" data-testid="automations-page">
      <div className="label-mono mb-3">AI / AUTOMATIONS</div>
      <h1 className="font-display text-4xl font-bold tracking-tighter mb-3">Automations</h1>
      <p className="text-zinc-500 mb-8 max-w-xl">
        Tell TeamNest what should happen automatically — in plain English.
      </p>

      <div className="rounded-2xl border border-yellow-400/30 bg-gradient-to-br from-yellow-400/[0.08] to-transparent p-8 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-yellow-400 text-black flex items-center justify-center mb-5">
          <Zap className="w-7 h-7" strokeWidth={1.8} />
        </div>
        <h2 className="text-2xl font-bold tracking-tight mb-2">
          The Automation Builder is on its way
        </h2>
        <p className="text-zinc-400 max-w-lg mb-6">
          Soon you'll describe things like <em>“Every Monday at 8 AM, summarize overdue
          tasks and post the report in Operations”</em> and TeamNest will turn it into a
          scheduled workflow — with approvals and a transparent run history.
        </p>
        <span className="text-[10px] font-mono uppercase tracking-widest bg-yellow-400/20 text-yellow-300 px-2 py-1 rounded">
          Coming soon
        </span>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        {[
          { icon: Clock, title: "Scheduled", desc: "Run on a cadence, e.g. every Monday." },
          { icon: Sparkles, title: "Event-driven", desc: "React when something happens." },
          { icon: GitBranch, title: "With approvals", desc: "High-risk steps ask first." },
        ].map((f) => {
          const I = f.icon;
          return (
            <div key={f.title} className="rounded-xl border border-white/10 bg-[#121214] p-4">
              <I className="w-5 h-5 text-yellow-400 mb-2" strokeWidth={1.8} />
              <div className="text-sm font-semibold">{f.title}</div>
              <div className="text-[12px] text-zinc-500 mt-1 leading-relaxed">{f.desc}</div>
            </div>
          );
        })}
      </div>

      <Link
        to="/dashboard"
        data-testid="automations-back-home"
        className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>
    </div>
  );
}
