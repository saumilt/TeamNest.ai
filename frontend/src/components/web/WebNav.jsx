import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Menu, X, Moon, Sun, ChevronDown, MessageSquare, GitCompareArrows,
  Terminal, Blocks, Store, Trophy,
} from "lucide-react";
import { useWebTheme } from "@/context/WebThemeContext";
import { useAuth } from "@/context/AuthContext";
import { LogoMark, Wordmark, PrimaryButton, GhostButton } from "@/components/web/atoms";
import { isInviteOnly, useLaunchConfig } from "@/hooks/useLaunchConfig";

const PRODUCT_ITEMS = [
  { to: "/product", icon: MessageSquare, label: "Team Chat", desc: "Your team + 6 AIs in one thread" },
  { to: "/product#ai-compare", icon: GitCompareArrows, label: "AI Compare", desc: "Side-by-side model answers" },
  { to: "/dev-os-guide", icon: Terminal, label: "Dev OS Build Room", desc: "@devmanager turns chat into apps" },
  { to: "/dev-os-guide#builders", icon: Blocks, label: "Plain-English Builders", desc: "Data models, roles, workflows — no code" },
  { to: "/templates", icon: Store, label: "Template App Store", desc: "Install working apps in one click" },
];

const EXPLORE_ITEMS = [
  { to: "/templates", icon: Store, label: "Templates", desc: "The App Store — free & premium" },
  { to: "/showcase", icon: Trophy, label: "Showcase", desc: "Apps built with TeamNest" },
];

const NAV = [
  { label: "Product", items: PRODUCT_ITEMS },
  { label: "AI Employees", to: "/employees-info" },
  { label: "Explore", items: EXPLORE_ITEMS },
  { label: "Pricing", to: "/pricing" },
];

function ThemeToggle() {
  const { theme, toggle } = useWebTheme();
  return (
    <button
      type="button"
      data-testid="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="w-10 h-10 inline-flex items-center justify-center rounded-full hover:bg-[var(--w-surface)] text-[var(--w-text-dim)] hover:text-[var(--w-text)] transition-colors"
    >
      {theme === "dark" ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
    </button>
  );
}

function Dropdown({ label, items, testid }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <li className="relative" ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        data-testid={testid}
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 px-3 py-2 rounded-[10px] text-[14px] font-medium whitespace-nowrap transition-colors ${
          open ? "text-[var(--w-text)] bg-[var(--w-surface)]" : "text-[var(--w-text-dim)] hover:text-[var(--w-text)]"
        }`}
      >
        {label} <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full pt-2 w-[300px]" data-testid={`${testid}-menu`}>
          <div className="rounded-2xl border border-[var(--w-hairline)] bg-[var(--w-bg)] shadow-xl p-2">
            {items.map((it) => (
              <Link
                key={it.label}
                to={it.to}
                data-testid={`nav-item-${it.label.toLowerCase().replace(/[^a-z]/g, "-")}`}
                className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--w-surface)] transition-colors"
              >
                <it.icon className="w-4.5 h-4.5 mt-0.5 text-amber-500 shrink-0" style={{ width: 18, height: 18 }} />
                <span>
                  <span className="block text-[13.5px] font-semibold text-[var(--w-text)]">{it.label}</span>
                  <span className="block text-[12px] text-[var(--w-text-mute)]">{it.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

export default function WebNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { user } = useAuth();
  const launchCfg = useLaunchConfig();
  const inviteGated = isInviteOnly(launchCfg);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  const navCls = scrolled
    ? "border-b border-[var(--w-hairline)] bg-[var(--w-bg)]/85 backdrop-blur-[14px]"
    : "border-b border-transparent bg-transparent";

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-40 h-16 transition-colors duration-200 ${navCls}`}>
        <nav className="h-full max-w-[1200px] mx-auto px-4 sm:px-6 flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 shrink-0" data-testid="web-nav-logo">
            <LogoMark size={32} />
            <Wordmark size="md" />
          </Link>

          <ul className="hidden lg:flex items-center gap-1 mx-auto">
            {NAV.map((n) =>
              n.items ? (
                <Dropdown
                  key={n.label}
                  label={n.label}
                  items={n.items}
                  testid={`web-nav-${n.label.toLowerCase()}`}
                />
              ) : (
                <li key={n.label}>
                  <NavLink
                    to={n.to}
                    data-testid={`web-nav-${n.label.toLowerCase().replace(/[^a-z]/g, "-")}`}
                    className={({ isActive }) =>
                      `px-3 py-2 rounded-[10px] text-[14px] font-medium whitespace-nowrap transition-colors inline-block ${
                        isActive
                          ? "text-[var(--w-text)] bg-[var(--w-surface)]"
                          : "text-[var(--w-text-dim)] hover:text-[var(--w-text)]"
                      }`
                    }
                  >
                    {n.label}
                  </NavLink>
                </li>
              ),
            )}
          </ul>

          <div className="hidden lg:flex items-center gap-2 ml-auto shrink-0">
            <ThemeToggle />
            {user ? (
              <PrimaryButton as={Link} to="/chats" className="h-10 px-4 text-[14px] whitespace-nowrap" data-testid="web-nav-open-app">
                Open app →
              </PrimaryButton>
            ) : (
              <>
                <GhostButton as={Link} to="/login" className="h-10 px-4 text-[14px] whitespace-nowrap" data-testid="web-nav-login">
                  Log in
                </GhostButton>
                {inviteGated ? (
                  <PrimaryButton as={Link} to="/waitlist" className="h-10 px-4 text-[14px] whitespace-nowrap" data-testid="web-nav-request-invite">
                    Request Invite →
                  </PrimaryButton>
                ) : (
                  <PrimaryButton as={Link} to="/login?demo=1" className="h-10 px-4 text-[14px] whitespace-nowrap" data-testid="web-nav-try-demo">
                    Try the demo →
                  </PrimaryButton>
                )}
              </>
            )}
          </div>

          <div className="flex lg:hidden items-center gap-1 ml-auto">
            <ThemeToggle />
            <button
              type="button"
              aria-label="Open menu"
              data-testid="web-nav-hamburger"
              onClick={() => setOpen(true)}
              className="w-10 h-10 inline-flex items-center justify-center rounded-full hover:bg-[var(--w-surface)] text-[var(--w-text)]"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </nav>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 bg-[var(--w-bg)] lg:hidden flex flex-col" data-testid="web-mobile-sheet">
          <div className="h-16 px-4 sm:px-6 flex items-center justify-between border-b border-[var(--w-hairline)]">
            <Link to="/" className="flex items-center gap-2">
              <LogoMark size={32} />
              <Wordmark size="md" />
            </Link>
            <button
              type="button"
              aria-label="Close menu"
              data-testid="web-mobile-sheet-close"
              onClick={() => setOpen(false)}
              className="w-10 h-10 inline-flex items-center justify-center rounded-full hover:bg-[var(--w-surface)] text-[var(--w-text)]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="text-[11px] uppercase tracking-widest font-semibold text-[var(--w-text-mute)] px-2 mb-1">Product</div>
            {PRODUCT_ITEMS.map((it) => (
              <Link key={it.label} to={it.to} className="flex items-center gap-3 h-12 px-2 rounded-xl text-[16px] font-medium text-[var(--w-text-dim)] hover:bg-[var(--w-surface)]">
                <it.icon className="w-4 h-4 text-amber-500" /> {it.label}
              </Link>
            ))}
            <div className="text-[11px] uppercase tracking-widest font-semibold text-[var(--w-text-mute)] px-2 mt-4 mb-1">Explore</div>
            {EXPLORE_ITEMS.map((it) => (
              <Link key={it.label} to={it.to} className="flex items-center gap-3 h-12 px-2 rounded-xl text-[16px] font-medium text-[var(--w-text-dim)] hover:bg-[var(--w-surface)]">
                <it.icon className="w-4 h-4 text-amber-500" /> {it.label}
              </Link>
            ))}
            <div className="mt-4 border-t border-[var(--w-hairline)] pt-3">
              <NavLink to="/employees-info" className="flex items-center h-12 px-2 rounded-xl text-[16px] font-medium text-[var(--w-text-dim)] hover:bg-[var(--w-surface)]">
                AI Employees
              </NavLink>
              <NavLink to="/pricing" className="flex items-center h-12 px-2 rounded-xl text-[16px] font-medium text-[var(--w-text-dim)] hover:bg-[var(--w-surface)]">
                Pricing
              </NavLink>
            </div>
          </div>
          <div className="p-4 flex flex-col gap-2 border-t border-[var(--w-hairline)]">
            {user ? (
              <PrimaryButton as={Link} to="/chats" className="w-full">Open app →</PrimaryButton>
            ) : (
              <>
                <GhostButton as={Link} to="/login" className="w-full">Log in</GhostButton>
                {inviteGated ? (
                  <PrimaryButton as={Link} to="/waitlist" className="w-full">Request Invite →</PrimaryButton>
                ) : (
                  <PrimaryButton as={Link} to="/login?demo=1" className="w-full">Try the demo →</PrimaryButton>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
