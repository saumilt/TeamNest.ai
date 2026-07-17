import { Link } from "react-router-dom";
import { Download, ArrowLeft, Film, Image as ImageIcon, Package, FileCode, BookOpen } from "lucide-react";

const FILES = [
  {
    name: "Full project zip — for your dev team",
    file: "/downloads/teamnest-mobile.zip",
    size: "42 MB",
    desc: "Complete Capacitor scaffold: React source, iOS Xcode project, Android Studio project, store assets, deployment guide. Hand this to your developers — everything they need to ship to App Store + Play Store.",
    icon: FileCode,
    primary: true,
  },
  {
    name: "Step-by-step deployment guide",
    file: "/downloads/MOBILE_APP_DEPLOYMENT_GUIDE.md",
    size: "14 KB",
    desc: "Markdown walkthrough — Android keystore generation, Play Console upload, Xcode signing, App Store Connect, App Store Privacy questionnaire, Codemagic cloud iOS build, and a pre-submission checklist.",
    icon: BookOpen,
  },
  {
    name: "Quick-start README for devs",
    file: "/downloads/README_FOR_DEVS.md",
    size: "3 KB",
    desc: "First-read summary for the engineering team — what's already wired up, prerequisites, and a 4-step TL;DR.",
    icon: BookOpen,
  },
  {
    name: "Architecture reference (Capacitor)",
    file: "/downloads/CAPACITOR.md",
    size: "11 KB",
    desc: "Deeper dive on the native plumbing — plugin list, build commands, daily dev loop, troubleshooting.",
    icon: BookOpen,
  },
  {
    name: "Store assets only (lighter zip)",
    file: "/downloads/teamnest-store-assets.zip",
    size: "11 MB",
    desc: "Just the screenshots + feature graphic + preview video, no source code. Useful if your designer wants to tweak captions before submission.",
    icon: Package,
  },
  {
    name: "App Store preview video — iOS 6.7″",
    file: "/downloads/app_preview_6.7inch.mp4",
    size: "1 MB",
    desc: "1080×1920 H.264 MP4, 15 sec. Drag into App Store Connect → 6.7″ Display → App Preview.",
    icon: Film,
  },
  {
    name: "Play Store promo video",
    file: "/downloads/app_preview.mp4",
    size: "1 MB",
    desc: "Same 15-sec MP4. Upload to YouTube first, then paste the link in Play Console → Promo video.",
    icon: Film,
  },
  {
    name: "Play Store feature graphic",
    file: "/downloads/feature_graphic.png",
    size: "99 KB",
    desc: "1024×500 PNG. Upload to Play Console → Main store listing → Feature graphic.",
    icon: ImageIcon,
  },
];

export default function Downloads() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="border-b border-white/5 sticky top-0 bg-[#0a0a0a]/95 backdrop-blur-sm z-10">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-sm bg-yellow-400 text-black flex items-center justify-center font-mono text-sm font-extrabold">
              TN
            </div>
            <div className="leading-tight">
              <div className="font-mono text-sm tracking-tight">
                teamnest<span className="text-yellow-400">.ai</span>
              </div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
                Store assets
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

      <main className="max-w-3xl mx-auto px-6 py-12 lg:py-20">
        <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-400 mb-3">
          For your engineering team
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight mb-3">
          Ship to App Store + Play
        </h1>
        <p className="text-zinc-400 text-base mb-12 max-w-2xl">
          Hand the <strong className="text-yellow-300">first file</strong> to your devs — it's the full Capacitor scaffold (React source + iOS + Android projects + store assets + deployment guide). The remaining files are individual store assets in case you need to upload them directly.
        </p>

        <div className="space-y-3">
          {FILES.map((f) => {
            const Icon = f.icon;
            return (
              <a
                key={f.file}
                href={f.file}
                download
                data-testid={`download-${f.file.split("/").pop()}`}
                className={`flex items-start gap-4 p-5 border rounded-sm transition-colors group ${
                  f.primary
                    ? "border-yellow-400/40 bg-yellow-400/5 hover:bg-yellow-400/10"
                    : "border-white/10 hover:border-yellow-400/40 hover:bg-white/5"
                }`}
              >
                <div
                  className={`w-10 h-10 shrink-0 rounded-sm flex items-center justify-center ${
                    f.primary ? "bg-yellow-400 text-black" : "bg-white/5 text-yellow-400"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3 flex-wrap mb-1">
                    <div className="font-semibold text-white">{f.name}</div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                      {f.size}
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
                </div>
                <Download className="w-4 h-4 text-zinc-500 group-hover:text-yellow-400 shrink-0 mt-2 transition-colors" />
              </a>
            );
          })}
        </div>

        <div className="mt-12 p-5 border border-white/10 rounded-sm bg-white/[0.02]">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">
            Tip
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">
            For long-term version control, use the <strong>Save to GitHub</strong>{" "}
            button in the chat input. Your repo will include the entire{" "}
            <code className="text-yellow-400 bg-white/5 px-1.5 py-0.5 rounded text-xs">
              frontend/store-assets/
            </code>{" "}
            folder, so CI pipelines like Codemagic or GitHub Actions can pick the
            files up automatically on every build.
          </p>
        </div>

        <footer className="mt-20 pt-8 border-t border-white/5 flex flex-wrap gap-4 items-center justify-between text-xs font-mono uppercase tracking-widest text-zinc-500">
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-yellow-400 transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-yellow-400 transition-colors">Terms</Link>
            <Link to="/support" className="hover:text-yellow-400 transition-colors">Support</Link>
          </div>
          <div>© {new Date().getFullYear()} TeamNest</div>
        </footer>
      </main>
    </div>
  );
}
