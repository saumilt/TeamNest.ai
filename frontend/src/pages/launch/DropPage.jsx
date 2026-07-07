import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Countdown, Glass, LaunchShell } from "@/pages/launch/LaunchShell";

export default function DropPage() {
  const { code } = useParams();
  const [drop, setDrop] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get(`/launch/drop/${encodeURIComponent(code)}`)
      .then(({ data }) => setDrop(data)).catch(() => setError(true));
  }, [code]);

  if (error) {
    return (
      <LaunchShell testid="drop-not-found">
        <div className="max-w-lg mx-auto pt-20 text-center">
          <h1 className="text-3xl font-bold">Drop not found</h1>
          <Link to="/waitlist" className="text-amber-400 mt-4 inline-block">Join the waitlist →</Link>
        </div>
      </LaunchShell>
    );
  }
  if (!drop) return <LaunchShell testid="drop-loading"><div className="pt-24 text-center text-zinc-500">Loading drop…</div></LaunchShell>;

  const gone = drop.state !== "valid" || drop.remaining <= 0;
  const pct = Math.min(100, (drop.used / drop.max_uses) * 100);

  return (
    <LaunchShell testid="drop-page">
      <div className="max-w-xl mx-auto pt-10 md:pt-16 text-center">
        <div className="text-xs font-bold uppercase tracking-[0.25em] text-amber-400 mb-4">Private Beta Code Drop</div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tighter" data-testid="drop-title">{drop.title}</h1>
        <p className="text-zinc-400 mt-4 leading-relaxed" data-testid="drop-description">{drop.description}</p>

        <Glass className="p-8 mt-8">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500 mb-3">Use code</div>
          <div className="font-mono text-4xl font-bold tracking-[0.25em] text-amber-400" data-testid="drop-code">{drop.code}</div>
          <div className="mt-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400" data-testid="drop-remaining">
                <span className="text-amber-400 font-mono font-bold">{drop.remaining}</span> of {drop.max_uses} spots remaining
              </span>
              <Countdown expiresAt={drop.expires_at} />
            </div>
            <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="mt-4 text-sm text-zinc-400">
            Unlocks: <span className="text-zinc-100 font-medium">{drop.access_name}</span> + {drop.invites_granted} invites
          </div>
          {gone ? (
            <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-4 text-sm text-rose-300" data-testid="drop-gone">
              This drop is {drop.state === "expired" ? "expired" : "fully claimed"}.
              <Link to="/waitlist" className="block mt-2 text-amber-400">Join the waitlist instead →</Link>
            </div>
          ) : (
            <Link to={`/invite?code=${drop.code}`} data-testid="drop-claim"
              className="inline-block mt-6 rounded-full bg-amber-400 text-zinc-950 font-bold px-10 py-4 hover:bg-amber-300 transition-all shadow-[0_0_25px_rgba(251,191,36,0.3)] hover:-translate-y-0.5">
              Claim Access →
            </Link>
          )}
        </Glass>
        <p className="text-zinc-600 text-xs mt-6">Limited to the first {drop.max_uses} users · dropped on {drop.source}</p>
      </div>
    </LaunchShell>
  );
}
