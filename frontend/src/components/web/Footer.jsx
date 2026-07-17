import { Link } from "react-router-dom";
import { Circle } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/web/atoms";

const COLS = [
  {
    heading: "Product",
    links: [
      { to: "/product#ai-compare", label: "Compare AIs" },
      { to: "/product#chat", label: "Group chat" },
      { to: "/product#tasks", label: "Tasks" },
      { to: "/product#calls", label: "Calls" },
      { to: "/product#folders", label: "Project folders" },
      { to: "/changelog", label: "Changelog" },
      { to: "/showcase", label: "Built with TeamNest" },
    ],
  },
  {
    heading: "Company",
    links: [
      { to: "/product", label: "About" },
      { to: "/changelog", label: "Blog" },
      { to: "/support", label: "Contact" },
      { to: "/privacy", label: "Privacy Policy" },
      { to: "/eula", label: "EULA" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { to: "/privacy", label: "Privacy" },
      { to: "/terms", label: "Terms" },
      { to: "/eula", label: "EULA" },
      { to: "/support", label: "Support" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-[var(--w-hairline)] bg-[var(--w-bg)]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8">
          <div className="col-span-2 md:col-span-3">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <LogoMark size={32} />
              <Wordmark size="md" />
            </Link>
            <p className="text-[14px] leading-6 text-[var(--w-text-dim)] max-w-[24ch]">
              AI-native team communication, research and building.
            </p>
          </div>
          {COLS.map((col) => (
            <div key={col.heading} className="md:col-span-3">
              <div className="text-[12px] uppercase tracking-[0.14em] font-bold text-[var(--w-text-mute)] mb-4">
                {col.heading}
              </div>
              <ul className="space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      className="text-[15px] text-[var(--w-text-dim)] hover:text-[var(--w-text)] transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-[var(--w-hairline)] flex flex-wrap items-center justify-between gap-4">
          <p className="text-[13px] text-[var(--w-text-mute)]">
            © {new Date().getFullYear()} TeamNest. All rights reserved.
          </p>
          <a
            href="https://status.teamnest.ai"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--w-hairline)] text-[12px] text-[var(--w-text-dim)] hover:text-[var(--w-text)]"
          >
            <Circle className="w-2 h-2 fill-[var(--w-green)] text-[var(--w-green)]" />
            All systems operational
          </a>
        </div>
      </div>
    </footer>
  );
}
