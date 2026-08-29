import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ChevronDown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { createOptions } from "@/lib/nav";

/** Global "+ New" button → "What do you want to create?" menu.
 *  Lives at the top of the left nav so the universal rule holds:
 *  to start anything new, click + New. */
export default function NewMenu({ collapsed = false }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const options = createOptions(user);

  return (
    <div className="relative" data-testid="new-menu">
      <button
        type="button"
        data-testid="new-menu-btn"
        onClick={() => setOpen((o) => !o)}
        title="Create something new"
        className={`w-full flex items-center ${
          collapsed ? "justify-center px-0" : "gap-2 px-3"
        } py-2.5 rounded-xl text-sm font-semibold bg-yellow-400 text-black hover:bg-yellow-300 active:scale-[0.98] transition-all mb-2`}
      >
        <Plus className="w-5 h-5 shrink-0" strokeWidth={2.4} />
        {!collapsed && (
          <>
            <span className="truncate">New</span>
            <ChevronDown className={`ml-auto w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            data-testid="new-menu-panel"
            className="absolute left-0 top-full mt-1 z-50 w-72 bg-[#141414] border border-white/10 rounded-xl shadow-2xl py-1.5"
          >
            <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              What do you want to create?
            </div>
            {options.map((o) => {
              const I = o.icon;
              return (
                <button
                  key={o.key}
                  type="button"
                  data-testid={`new-opt-${o.key}`}
                  onClick={() => {
                    setOpen(false);
                    nav(o.to);
                  }}
                  className="w-full text-left px-3 py-2.5 flex items-start gap-3 hover:bg-white/5"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-zinc-200">
                    <I className="w-4 h-4" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-100">{o.label}</div>
                    <div className="text-[11px] text-zinc-500 truncate">{o.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
