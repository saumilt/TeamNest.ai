import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";

const AI_DEFAULTS = [
  {
    key: "ai",
    trigger: "@ai",
    label: "AI · default model",
    desc: "Snappy reply from GPT-4o mini · 1 model · cheapest",
    badge: "AI",
    color: "amber",
  },
  {
    key: "ai-compare",
    trigger: "@ai show comparison",
    label: "AI · compare all models",
    desc: "Runs all 5 premium models in parallel · costs more credits",
    badge: "ALL",
    color: "amber",
  },
  {
    key: "cmo",
    trigger: "@cmo",
    label: "AI CMO",
    desc: "Marketing strategy, campaigns, copy",
    badge: "AI",
    color: "violet",
  },
  {
    key: "sales",
    trigger: "@sales",
    label: "AI Sales",
    desc: "Cold emails, follow-ups, discovery briefs",
    badge: "AI",
    color: "emerald",
  },
  {
    key: "paralegal",
    trigger: "@paralegal",
    label: "AI Paralegal",
    desc: "Contract review, clause flags, legal Q&A",
    badge: "AI",
    color: "blue",
  },
];

const COLOR_CLASSES = {
  violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  blue: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  zinc: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

/**
 * Parses the textarea draft to detect an active `@` mention being typed.
 * Returns { active: boolean, query: string, start: number, end: number }.
 *
 * Active when caret is right after `@something` (no spaces in `something`),
 * preceded by start-of-string or whitespace.
 */
export function detectMention(text, caret) {
  if (caret == null || caret < 0) return { active: false };
  const before = text.slice(0, caret);
  // Find last `@` before caret with no whitespace between it and caret.
  const at = before.lastIndexOf("@");
  if (at < 0) return { active: false };
  // Must be at start or preceded by whitespace.
  if (at > 0 && !/\s/.test(before[at - 1])) return { active: false };
  const fragment = before.slice(at + 1);
  if (/\s/.test(fragment)) return { active: false };
  return { active: true, query: fragment.toLowerCase(), start: at, end: caret };
}

/**
 * Popover that lets users complete an AI Employee or teammate mention.
 * Renders as a positioned overlay above its anchor (the textarea wrapper).
 *
 * Props:
 *  - draft           current textarea value
 *  - caret           textarea selectionStart
 *  - members         array of { id, name } chat members (humans)
 *  - onPick(text)    replace the textarea body with the new completed string
 *  - onClose()       dismiss the popover
 */
export default function MentionPopover({ draft, caret, members = [], onPick, onClose, chatKind }) {
  const detect = useMemo(() => detectMention(draft, caret), [draft, caret]);
  const [highlight, setHighlight] = useState(0);
  const [employeeNames, setEmployeeNames] = useState({});
  const [devRoles, setDevRoles] = useState([]);
  const listRef = useRef(null);

  // Lazy-load the dev chat role manifest for ALL chats — users can summon
  // `@devmanager` from any chat and `@dev` always opens the picker. It only
  // does real work after the one-time hire (price set server-side).
  useEffect(() => {
    let cancelled = false;
    api.get("/dev-chat/roles").then(({ data }) => {
      if (!cancelled) setDevRoles(data.roles || []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Pull the workspace's personalized employee names once so the popover can
  // show "Priya AI" instead of generic "AI CMO".
  useEffect(() => {
    let cancelled = false;
    api
      .get("/ai-employees")
      .then(({ data }) => {
        if (cancelled) return;
        const map = {};
        for (const e of data.employees || []) {
          const sub = e.subscription;
          if (sub?.display_first_name && ["cmo", "sales", "paralegal"].includes(e.key)) {
            map[e.key] = {
              first: sub.display_first_name,
              full: sub.display_full_name || `${sub.display_first_name} AI`,
            };
          }
        }
        setEmployeeNames(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const AI_EMPLOYEES = useMemo(
    () =>
      AI_DEFAULTS.map((e) => {
        // The bare-AI entries are not personalised; skip the rename pass.
        if (e.key === "ai" || e.key === "ai-compare") return e;
        const named = employeeNames[e.key];
        if (!named) return e;
        return {
          ...e,
          label: named.full,
          // Add a personalized trigger like "@priya" alongside the canonical "@cmo".
          trigger: `@${named.first.toLowerCase().replace(/\s+/g, "")}`,
          badge: named.first[0]?.toUpperCase() || e.badge,
          desc: `${e.desc} · also: ${e.trigger}`,
          canonicalTrigger: e.trigger,
        };
      }),
    [employeeNames],
  );

  const items = useMemo(() => {
    if (!detect.active) return [];
    const q = detect.query;

    // Treat `@dev`, `@devs`, `@developers` (or empty token) as "show the full
    // engineer roster". This now works in EVERY chat — not just dev chats —
    // so users can summon an individual AI engineer from any conversation.
    const isRosterTrigger =
      !q || ["dev", "devs", "developer", "developers"].includes(q);

    const devRows = isRosterTrigger
      ? devRoles.map((r) => ({ type: "dev-role", ...r }))
      : devRoles
          .filter((r) => !q || r.key.startsWith(q) || r.label.toLowerCase().includes(q) || r.trigger.toLowerCase().includes(`@${q}`))
          .map((r) => ({ type: "dev-role", ...r }));

    // Hide standard AI / member rows while the user is browsing the dev roster
    // — they came to pick a role, not to summon Claude.
    if (isRosterTrigger) return devRows;

    const aiRows = AI_EMPLOYEES.filter(
      (e) => !q || e.key.startsWith(q) || e.label.toLowerCase().includes(q),
    ).map((e) => ({ type: "ai", ...e }));
    const memberRows = members
      .filter((m) => !q || (m.name || "").toLowerCase().includes(q))
      .slice(0, 6)
      .map((m) => ({
        type: "member",
        key: m.id,
        trigger: `@${(m.name || "user").split(" ")[0].toLowerCase()}`,
        label: m.name || "Teammate",
        desc: m.email || "Workspace member",
        badge: m.name?.[0]?.toUpperCase() || "?",
        color: "zinc",
      }));
    return [...aiRows, ...devRows, ...memberRows];
  }, [detect, members, devRoles, AI_EMPLOYEES, chatKind]);

  useEffect(() => {
    setHighlight(0);
  }, [detect.query, items.length]);

  const choose = (item) => {
    if (!detect.active || !item) return;
    const before = draft.slice(0, detect.start);
    const after = draft.slice(detect.end);
    // For AI employees, insert the canonical trigger + space so the backend
    // dispatcher matches. For members, insert `@firstname `.
    const replacement = `${item.trigger} `;
    onPick(`${before}${replacement}${after}`, detect.start + replacement.length);
  };

  // Keyboard handling lives in the parent so we can intercept ArrowUp/Down
  // before React's event default. Expose via window for the textarea handler.
  useEffect(() => {
    if (!detect.active || items.length === 0) return;
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
  }, [detect.active, items, highlight]);

  if (!detect.active || items.length === 0) return null;

  return (
    <div
      data-testid="mention-popover"
      className="absolute left-3 right-3 md:left-6 md:right-6 bottom-[calc(100%+6px)] z-30 bg-[#101013] border border-white/10 rounded-md shadow-2xl overflow-hidden max-h-72"
    >
      <div className="px-3 py-1.5 border-b border-white/5 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
        {detect.query ? `Matches for "@${detect.query}"` : "Summon an AI employee or teammate"}
      </div>
      <ul ref={listRef} className="max-h-60 overflow-y-auto py-1" role="listbox">
        {items.map((item, i) => (
          <li
            key={`${item.type}-${item.key}`}
            role="option"
            aria-selected={i === highlight}
            onMouseEnter={() => setHighlight(i)}
            onMouseDown={(e) => {
              // mousedown so the textarea doesn't lose focus before we update.
              e.preventDefault();
              choose(item);
            }}
            data-testid={`mention-option-${item.key}`}
            className={
              "flex items-center gap-3 px-3 py-2 cursor-pointer text-sm " +
              (i === highlight ? "bg-white/[0.06]" : "")
            }
          >
            <span
              className={
                "w-7 h-7 rounded-full border flex items-center justify-center text-[10px] font-mono uppercase tracking-widest flex-shrink-0 " +
                (COLOR_CLASSES[item.color] || COLOR_CLASSES.zinc)
              }
            >
              {item.badge}
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-zinc-100 font-medium">{item.label}</span>
              <span className="ml-2 text-[11px] text-zinc-500 font-mono">{item.trigger}</span>
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
