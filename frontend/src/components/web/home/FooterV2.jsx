import { Link } from "react-router-dom";
import { LogoMark, Wordmark } from "@/components/web/atoms";

const COLS = [
  {
    title: "Product",
    links: [
      ["AI Research", "/multi-model-ai"],
      ["Human and AI Chat", "/#human-ai"],
      ["Projects", "/#capabilities"],
      ["Tasks", "/#capabilities"],
      ["Knowledge", "/#capabilities"],
      ["AI Employees", "/employees-info"],
    ],
  },
  {
    title: "Solutions",
    links: [
      ["Individuals", "/individuals"],
      ["Students", "/students"],
      ["Teams", "/teams"],
      ["Business", "/business"],
      ["Enterprise", "/business"],
      ["Legal Collaboration", "/business"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Help Center", "/help"],
      ["Product Updates", "/changelog"],
      ["Security", "/#capabilities"],
      ["Responsible AI", "/terms"],
      ["Academic Integrity", "/students"],
      ["Privacy", "/privacy"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "/#final-cta"],
      ["Contact", "/support"],
      ["Careers", "/support"],
      ["Terms", "/terms"],
      ["Privacy", "/privacy"],
    ],
  },
];

function FooterLink({ label, href }) {
  const isInternal = href.startsWith("/") && !href.startsWith("/#");
  const cls =
    "text-[14px] text-[var(--w-text-dim)] hover:text-[var(--w-text)] transition-colors";
  if (isInternal) {
    return (
      <Link to={href} className={cls}>
        {label}
      </Link>
    );
  }
  return (
    <a href={href} className={cls}>
      {label}
    </a>
  );
}

export default function FooterV2() {
  return (
    <footer className="py-14 px-5 border-t border-[var(--w-hairline)]">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-10">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2.5 mb-3">
            <LogoMark size={28} />
            <Wordmark size="md" />
          </div>
          <p className="text-[13px] leading-5 text-[var(--w-text-mute)] max-w-[34ch]">
            The AI collaboration workspace where people and AI research, communicate,
            organize, and build knowledge together.
          </p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--w-text-mute)] mb-3">
              {c.title}
            </div>
            <ul className="space-y-2">
              {c.links.map(([label, href]) => (
                <li key={label + href}>
                  <FooterLink label={label} href={href} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-[var(--w-hairline)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[12px] text-[var(--w-text-mute)]">
        <span>© {new Date().getFullYear()} TeamNest.ai · AI Collaboration Workspace</span>
        <span>For individuals, students, teams, and businesses.</span>
      </div>
    </footer>
  );
}
