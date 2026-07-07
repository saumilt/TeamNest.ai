import { useEffect, useMemo, useState } from "react";
import {
  FolderPlus, LayoutTemplate, ScanSearch, ListTodo, Bug, Map, CircleHelp,
} from "lucide-react";

const COMMANDS = [
  { key: "new", cmd: "/dev-os new ", icon: FolderPlus, label: "New project",
    desc: "Create a Dev OS project linked to this chat — type a name after", needsArg: true },
  { key: "template", cmd: "/dev-os template", icon: LayoutTemplate, label: "Templates",
    desc: "Browse installable app templates" },
  { key: "scan", cmd: "/dev-os scan", icon: ScanSearch, label: "Scan chat",
    desc: "Scan this chat for improvement signals & draft proposals" },
  { key: "task", cmd: "/dev-os task ", icon: ListTodo, label: "New task",
    desc: "Create a task on the linked project — type a title after", needsArg: true },
  { key: "bug", cmd: "/dev-os bug ", icon: Bug, label: "Report bug",
    desc: "Log a bug on the linked project — type a description after", needsArg: true },
  { key: "plan", cmd: "/dev-os plan", icon: Map, label: "Show plan",
    desc: "Show the linked project's plan" },
  { key: "help", cmd: "/dev-os help", icon: CircleHelp, label: "Help",
    desc: "List all Dev OS commands" },
];

/**
 * Detects an in-progress slash command at the start of the draft.
 * Active only while at least one command still matches the typed prefix.
 */
export function detectSlash(text, caret) {
  if (caret == null || caret < 0) return { active: false, items: [] };
  const before = text.slice(0, caret);
  if (before.includes("\n") || !/^\s*\//.test(before)) return { active: false, items: [] };
  const q = before.replace(/^\s*\//, "").toLowerCase();
  const items = COMMANDS.filter((c) => {
    const body = c.cmd.slice(1).toLowerCase();
    return body.startsWith(q) || c.label.toLowerCase().startsWith(q);
  });
  return { active: items.length > 0, query: q, items };
}

/**
 * Popover offering Dev OS `/` commands — same UX as the `@` mention menu.
 * Props: draft, caret, onPick(newText, newCaret), onClose().
 */
export default function SlashCommandPopover({ draft, caret, onPick, onClose }) {
  const detect = useMemo(() => detectSlash(draft, caret), [draft, caret]);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => { setHighlight(0); }, [detect.query, detect.items.length]);

  const choose = (item) => {
    if (!item) return;
    onPick(item.cmd, item.cmd.length);
  };

  useEffect(() => {
    if (!detect.active) return;
    const items = detect.items;
    const onKey = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + items.length) % items.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choose(items[highlight]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detect.active, detect.items, highlight]);

  if (!detect.active) return null;

  return (
    <div
      data-testid="slash-popover"
      className="absolute left-3 right-3 md:left-6 md:right-6 bottom-[calc(100%+6px)] z-30 bg-[#101013] border border-white/10 rounded-md shadow-2xl overflow-hidden max-h-72"
    >
      <div className="px-3 py-1.5 border-b border-white/5 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
        Dev OS commands
      </div>
      <ul className="max-h-60 overflow-y-auto py-1" role="listbox">
        {detect.items.map((item, i) => (
          <li
            key={item.key}
            role="option"
            aria-selected={i === highlight}
            onMouseEnter={() => setHighlight(i)}
            onMouseDown={(e) => { e.preventDefault(); choose(item); }}
            data-testid={`slash-option-${item.key}`}
            className={
              "flex items-center gap-3 px-3 py-2 cursor-pointer text-sm " +
              (i === highlight ? "bg-white/[0.06]" : "")
            }
          >
            <span className="w-7 h-7 rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-300 flex items-center justify-center flex-shrink-0">
              <item.icon className="w-3.5 h-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-zinc-100 font-medium">{item.label}</span>
              <span className="ml-2 text-[11px] text-zinc-500 font-mono">{item.cmd.trim()}</span>
              <span className="block text-[11px] text-zinc-500 truncate">{item.desc}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="px-3 py-1.5 border-t border-white/5 text-[10px] font-mono uppercase tracking-widest text-zinc-500 flex gap-3">
        <span>↑↓ navigate</span>
        <span>↵ select</span>
        <span>esc cancel</span>
      </div>
    </div>
  );
}
