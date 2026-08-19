import { useState } from "react";
import { ChevronDown, Check, Layout } from "lucide-react";
import { HOME_LOOKS } from "@/lib/homeVariant";

/** Small popover to switch the Home look (Classic / Start Center / Ask AI / Focus). */
export default function HomeLookSwitcher({ current, onChange }) {
  const [open, setOpen] = useState(false);
  const cur = HOME_LOOKS.find((l) => l.value === current) || HOME_LOOKS[0];

  return (
    <div className="relative" data-testid="home-look-switcher">
      <button
        type="button"
        data-testid="home-look-btn"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 border border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase tracking-widest text-[11px] h-9 px-3 text-zinc-400 hover:text-white transition-colors"
      >
        <Layout className="w-3.5 h-3.5" />
        Home: {cur.label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 mt-1 z-50 w-64 bg-[#141414] border border-white/10 rounded-xl shadow-2xl py-1.5">
            {HOME_LOOKS.map((l) => {
              const active = l.value === current;
              return (
                <button
                  key={l.value}
                  type="button"
                  data-testid={`home-look-${l.value}`}
                  onClick={() => {
                    onChange(l.value);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-white/5 ${
                    active ? "text-yellow-300" : "text-zinc-200"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{l.label}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">{l.desc}</div>
                  </div>
                  {active && <Check className="w-4 h-4 shrink-0 mt-0.5" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
