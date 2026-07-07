import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { WebThemeProvider } from "@/context/WebThemeContext";
import WebNav from "@/components/web/WebNav";
import Footer from "@/components/web/Footer";
import { ScrollProgress } from "@/components/web/PlanCard";

/** Wraps all marketing pages: theme provider, nav, footer, scroll progress. */
export default function WebLayout() {
  useEffect(() => {
    // Smooth-scroll anchored links with offset for sticky nav.
    const onClick = (e) => {
      const a = e.target.closest('a[href^="/"]');
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.includes("#")) return;
      const hash = href.split("#")[1];
      if (!hash) return;
      const sameRoute = window.location.pathname === href.split("#")[0];
      if (!sameRoute) return;
      const target = document.getElementById(hash);
      if (!target) return;
      e.preventDefault();
      const y = target.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: "smooth" });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <WebThemeProvider>
      <div className="min-h-screen bg-[var(--w-bg)] text-[var(--w-text)] flex flex-col">
        <ScrollProgress />
        <WebNav />
        <main className="flex-1 pt-16">
          <Outlet />
        </main>
        <Footer />
      </div>
    </WebThemeProvider>
  );
}
