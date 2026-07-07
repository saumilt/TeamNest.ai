import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/**
 * Shared shell for the public /privacy /terms /support pages.
 * Renders the TeamNest header strip + a centered max-w prose container.
 */
export default function LegalLayout({ title, subtitle, lastUpdated, children }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="border-b border-white/5 sticky top-0 bg-[#0a0a0a]/95 backdrop-blur-sm z-10">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link
            to="/"
            data-testid="legal-back-home"
            className="flex items-center gap-3 group"
          >
            <div className="w-9 h-9 rounded-sm bg-yellow-400 text-black flex items-center justify-center font-mono text-sm font-extrabold tracking-tight">
              TN
            </div>
            <div className="leading-tight">
              <div className="font-mono text-sm tracking-tight">
                teamnest<span className="text-yellow-400">.ai</span>
              </div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
                AI-native team comms
              </div>
            </div>
          </Link>

          <Link
            to="/"
            className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-zinc-400 hover:text-yellow-400 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </Link>
        </div>
      </header>

      {/* Page */}
      <main className="max-w-3xl mx-auto px-6 py-12 lg:py-20">
        <div className="mb-12">
          <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-400 mb-3">
            {subtitle}
          </div>
          <h1
            data-testid="legal-page-title"
            className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight mb-3"
          >
            {title}
          </h1>
          {lastUpdated && (
            <div className="text-xs font-mono uppercase tracking-widest text-zinc-500">
              Last updated · {lastUpdated}
            </div>
          )}
        </div>

        <div className="prose prose-invert prose-sm sm:prose-base max-w-none prose-headings:tracking-tight prose-headings:font-bold prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-3 prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2 prose-p:text-zinc-300 prose-p:leading-relaxed prose-li:text-zinc-300 prose-strong:text-white prose-a:text-yellow-400 prose-a:no-underline hover:prose-a:underline">
          {children}
        </div>

        <footer className="mt-20 pt-8 border-t border-white/5 flex flex-wrap gap-4 items-center justify-between text-xs font-mono uppercase tracking-widest text-zinc-500">
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-yellow-400 transition-colors" data-testid="legal-link-privacy">Privacy</Link>
            <Link to="/terms" className="hover:text-yellow-400 transition-colors" data-testid="legal-link-terms">Terms</Link>
            <Link to="/eula" className="hover:text-yellow-400 transition-colors" data-testid="legal-link-eula">EULA</Link>
            <Link to="/support" className="hover:text-yellow-400 transition-colors" data-testid="legal-link-support">Support</Link>
          </div>
          <div>© {new Date().getFullYear()} TeamNest</div>
        </footer>
      </main>
    </div>
  );
}
