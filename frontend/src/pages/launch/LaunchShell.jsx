import { Link } from "react-router-dom";

/** Shared dark shell + primitives for the invite-only launch pages. */
export function LaunchShell({ children, testid }) {
  return (
    <div data-testid={testid} className="min-h-screen bg-zinc-950 text-zinc-50 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.14]"
        style={{
          backgroundImage: "url(https://images.pexels.com/photos/21031387/pexels-photo-21031387.jpeg?auto=compress&w=1600)",
          backgroundSize: "cover", backgroundPosition: "center",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)",
        }} />
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5">
        <Link to="/" className="font-bold tracking-tight text-lg" data-testid="launch-logo">
          teamnest<span className="text-amber-400">.ai</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 px-3 py-1 text-xs font-bold tracking-wide uppercase">Private Beta</span>
          <Link to="/login" data-testid="launch-login-link"
            className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Log in</Link>
        </div>
      </header>
      <main className="relative z-10 px-6 md:px-12 pb-24">{children}</main>
    </div>
  );
}

export const Glass = ({ children, className = "", ...rest }) => (
  <div className={`bg-zinc-900/60 backdrop-blur-2xl border border-zinc-800/50 shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-2xl ${className}`} {...rest}>
    {children}
  </div>
);

export const GoldButton = ({ children, className = "", ...rest }) => (
  <button
    className={`rounded-full bg-amber-400 text-zinc-950 font-semibold px-7 py-3.5 hover:bg-amber-300 transition-all duration-300 shadow-[0_0_15px_rgba(251,191,36,0.2)] hover:shadow-[0_0_25px_rgba(251,191,36,0.4)] hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 text-sm ${className}`}
    {...rest}>{children}</button>
);

export const GhostBtn = ({ children, className = "", ...rest }) => (
  <button
    className={`rounded-full border border-zinc-700 text-zinc-200 font-medium px-7 py-3.5 hover:border-amber-400/50 hover:text-amber-300 transition-all text-sm ${className}`}
    {...rest}>{children}</button>
);

export const Input = (props) => (
  <input {...props}
    className={`w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/50 outline-none transition-all placeholder:text-zinc-600 text-sm ${props.className || ""}`} />
);

export const Label = ({ children }) => (
  <label className="block text-xs font-bold uppercase tracking-[0.18em] text-zinc-500 mb-1.5">{children}</label>
);

export const BadgePill = ({ name }) => (
  <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold border border-amber-400/30 text-amber-300"
    style={{ background: "linear-gradient(120deg, rgba(251,191,36,0.14), rgba(251,191,36,0.04))" }}>
    ★ {name}
  </span>
);

export function Countdown({ expiresAt }) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt) - Date.now();
  if (ms <= 0) return <span className="text-rose-400 font-mono text-sm">Expired</span>;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return (
    <span className="font-mono text-amber-400 text-sm" data-testid="drop-countdown">
      {h > 0 ? `${h}h ${m}m` : `${m}m`} left
    </span>
  );
}
