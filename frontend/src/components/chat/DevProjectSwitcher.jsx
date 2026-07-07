import { useCallback, useEffect, useRef, useState } from "react";
import { Rocket, Check, ChevronDown, Loader2, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";

/**
 * DevProjectSwitcher — chat-header dropdown listing every Dev OS project
 * this chat has spawned, with one-click switch + Open in DevStudio.
 *
 * Replaces the previous single-project pill ("Rocket · <name>"). When the
 * chat has multiple projects (now a first-class behavior — every qualifying
 * @devmgr request creates a new one), the pill turns into a dropdown so
 * users can rotate back to an older build without leaving the chat.
 *
 * Props:
 *   chatId   — the chat to query
 *   activePill — { id, name } from chat.linked_dev_project for the label
 *   onSwitched(projectId) — optional, called after a successful switch so
 *                           the parent can refetch the chat and update the
 *                           right-rail panel.
 */
export default function DevProjectSwitcher({ chatId, activePill, onSwitched }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(activePill?.id || null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(null); // project_id being switched to
  const popRef = useRef(null);

  const load = useCallback(async () => {
    if (!chatId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/chats/${chatId}/dev-projects`);
      setProjects(data.projects || []);
      setActiveId(data.active_project_id || null);
    } catch { /* keep prior list */ }
    finally { setLoading(false); }
  }, [chatId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const switchTo = async (projectId) => {
    if (projectId === activeId || switching) return;
    setSwitching(projectId);
    try {
      await api.post(`/chats/${chatId}/active-dev-project/${projectId}`);
      setActiveId(projectId);
      toast.success("Switched to project");
      onSwitched?.(projectId);
      setOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not switch");
    } finally {
      setSwitching(null);
    }
  };

  const openStudio = (projectId) => {
    setOpen(false);
    nav(`/dev-os/projects/${projectId}/studio`);
  };

  const activeName = activePill?.name || "Dev OS";

  return (
    <div ref={popRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="chat-dev-project-switcher"
        title={`Dev OS project: ${activeName}`}
        className="mt-0.5 ml-1 inline-flex items-center gap-1 h-5 px-2 rounded-full bg-yellow-400/15 text-yellow-200 ring-1 ring-yellow-400/30 text-[11px] font-medium hover:bg-yellow-400/25"
      >
        <Rocket className="w-3 h-3" />
        <span className="truncate max-w-[120px]">{activeName}</span>
        <ChevronDown className="w-3 h-3 opacity-70" />
      </button>

      {open && (
        <div
          data-testid="chat-dev-project-switcher-menu"
          className="absolute left-0 top-full mt-1 z-50 w-72 max-h-80 overflow-y-auto rounded-xl bg-[#141414] ring-1 ring-white/10 shadow-xl py-1"
        >
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-ink-mute">
            Dev projects in this chat
          </div>
          {loading && (
            <div className="px-3 py-2 text-[12px] text-ink-mute inline-flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </div>
          )}
          {!loading && projects.length === 0 && (
            <div className="px-3 py-3 text-[12px] text-ink-mute">
              No projects yet. Ask <code className="text-amber-300">@devmgr</code> to build something.
            </div>
          )}
          {projects.map((p) => {
            const isActive = p.id === activeId;
            return (
              <div
                key={p.id}
                data-testid={`chat-dev-project-row-${p.id}`}
                className={`px-3 py-2 hover:bg-white/[0.04] flex items-start gap-2 ${isActive ? "bg-yellow-400/[0.06]" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => switchTo(p.id)}
                  disabled={isActive || switching === p.id}
                  className="flex-1 min-w-0 text-left"
                  title={isActive ? "Currently active" : "Make active"}
                >
                  <div className="flex items-center gap-1.5">
                    {isActive ? (
                      <Check className="w-3 h-3 text-yellow-300 shrink-0" />
                    ) : (
                      <Rocket className="w-3 h-3 text-ink-mute shrink-0" />
                    )}
                    <span className={`text-[12px] font-medium truncate ${isActive ? "text-yellow-200" : "text-ink"}`}>
                      {p.name}
                    </span>
                  </div>
                  <div className="text-[10px] text-ink-mute mt-0.5 truncate">
                    {p.status || "draft"} · v{p.version || "0.1.0"} · {new Date(p.created_at).toLocaleDateString()}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => openStudio(p.id)}
                  data-testid={`chat-dev-project-open-${p.id}`}
                  title="Open in DevStudio"
                  className="shrink-0 text-ink-mute hover:text-ink p-1 rounded hover:bg-white/5"
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
