import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Menu, X } from "lucide-react";
import { LogoMark, Wordmark, PrimaryButton } from "@/components/web/atoms";
import { trackHomeEvent } from "@/components/web/home/primitives";

const PRODUCT_LINKS = [
  ["AI Research", "/multi-model-ai"],
  ["Human and AI Chat", { pathname: "/", hash: "#human-ai" }],
  ["Projects and Tasks", { pathname: "/", hash: "#capabilities" }],
  ["Files and Knowledge", { pathname: "/", hash: "#capabilities" }],
  ["Multi-Model AI", "/multi-model-ai"],
  ["AI Employees", "/employees-info"],
  ["Team Collaboration", "/teams"],
  ["Institutional Memory", "/business"],
];

const USECASE_LINKS = [
  ["Personal Research", "/individuals"],
  ["Student Group Projects", "/students"],
  ["Startup Planning", "/teams"],
  ["Team Collaboration", "/teams"],
  ["Business Knowledge", "/business"],
  ["Legal Collaboration", "/business"],
  ["Marketing Research", { pathname: "/", hash: "#use-cases" }],
  ["Project Management", { pathname: "/", hash: "#use-cases" }],
];

function DropdownMenu({ label, items, testId }) {
  return (
    <div className="relative group">
      <button
        type="button"
        data-testid={testId}
        className="flex items-center gap-1 text-[14px] font-medium text-[var(--w-text-dim)] hover:text-[var(--w-text)] transition-colors focus-visible:outline-none focus-visible:text-[var(--w-text)]"
        aria-haspopup="true"
      >
        {label}
        <ChevronDown className="w-3.5 h-3.5 opacity-70 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" />
      </button>
      <div
        className="absolute left-1/2 -translate-x-1/2 top-full pt-3 opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 transition-all duration-200"
      >
        <div className="w-[260px] rounded-[16px] border border-[var(--w-hairline)] bg-[var(--w-surface)] p-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
          {items.map(([l, href]) => (
            <Link
              key={l}
              to={href}
              className="block px-3 py-2 rounded-[10px] text-[13.5px] text-[var(--w-text-dim)] hover:text-[var(--w-text)] hover:bg-[var(--w-surface2)] transition-colors"
            >
              {l}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function NavV2() {
  const [open, setOpen] = useState(false);
  const flatLinks = [
    ["Individuals", "/individuals"],
    ["Students", "/students"],
    ["Business", "/business"],
    ["AI Models", "/multi-model-ai"],
    ["Pricing", "/pricing"],
  ];
  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 border-b border-[var(--w-hairline)] backdrop-blur-xl">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[var(--w-bg)] opacity-90" />
      <div className="max-w-6xl mx-auto h-full px-5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5" data-testid="home-nav-logo">
          <LogoMark size={30} />
          <Wordmark size="md" />
        </Link>

        <nav className="hidden lg:flex items-center gap-7">
          <DropdownMenu label="Product" items={PRODUCT_LINKS} testId="nav-product" />
          <DropdownMenu label="Use Cases" items={USECASE_LINKS} testId="nav-usecases" />
          {flatLinks.map(([l, href]) => (
            <Link
              key={l}
              to={href}
              data-testid={`nav-${l.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-[14px] font-medium text-[var(--w-text-dim)] hover:text-[var(--w-text)] transition-colors"
            >
              {l}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            data-testid="nav-signin"
            className="hidden sm:inline text-[14px] font-medium text-[var(--w-text-dim)] hover:text-[var(--w-text)]"
          >
            Sign In
          </Link>
          <PrimaryButton
            as={Link}
            to="/signup"
            className="h-10 px-5 text-[14px]"
            data-testid="nav-start-free"
            onClick={() => trackHomeEvent("hero_start_free_click", { source: "nav" })}
          >
            Start Free
          </PrimaryButton>
          <button
            type="button"
            className="lg:hidden w-10 h-10 -mr-2 flex items-center justify-center text-[var(--w-text)]"
            aria-label="Menu"
            data-testid="nav-mobile-toggle"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden relative border-t border-[var(--w-hairline)] h-[calc(100vh-4rem)] overflow-y-auto">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[var(--w-bg)]" />
          <div className="px-5 py-4 flex flex-col gap-1">
            {[
              ["Individuals", "/individuals"],
              ["Students", "/students"],
              ["Teams", "/teams"],
              ["Business", "/business"],
              ["Enterprise", "/business"],
              ["AI Models", "/multi-model-ai"],
              ["AI Research", "/multi-model-ai"],
              ["Pricing", "/pricing"],
              ["Sign In", "/login"],
            ].map(([l, href]) => (
              <Link
                key={l}
                to={href}
                onClick={() => setOpen(false)}
                data-testid={`nav-mobile-${l.toLowerCase().replace(/\s+/g, "-")}`}
                className="py-2.5 text-[15px] font-medium text-[var(--w-text-dim)] hover:text-[var(--w-text)]"
              >
                {l}
              </Link>
            ))}
            <PrimaryButton
              as={Link}
              to="/signup"
              className="mt-3 w-full"
              data-testid="nav-mobile-start-free"
              onClick={() => setOpen(false)}
            >
              Start Free
            </PrimaryButton>
          </div>
        </div>
      )}
    </header>
  );
}
