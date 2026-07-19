import { ChevronLeft, Phone, Video, Plug, UserPlus, MoreVertical, LogOut, Trash2, Rocket } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Avatar from "@/components/ui-v2/Avatar";
import SmartHirePill from "@/components/chat/SmartHirePill";
import DevProjectSwitcher from "@/components/chat/DevProjectSwitcher";

/**
 * Sticky top bar for an open chat. Renders avatar, name, member subline,
 * optional project chip + audio/video/integrations/guest actions and a
 * 3-dot overflow menu with "Leave chat" (group only) + "Delete chat".
 *
 * Pure presentational — all data + callbacks come from the parent.
 */
export default function ChatHeader({
  chat,
  chatId,
  isAIChat,
  onBack,
  onAudioCall,
  onVideoCall,
  onOpenIntegrations,
  onInviteGuest,
  onOpenProject,
  onOpenGroupInfo,
  onLeaveChat,
  onDeleteChat,
  onSpinUpDevOs,
  devOsBusy,
  onProjectSwitched,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const canLeave = chat.type === "group" && !!onLeaveChat;
  const canDelete = !!onDeleteChat;
  const hasMenu = canLeave || canDelete;
  const showPillRow = !!chat.project_folder_id || chat.type === "group";

  return (
    <div
      className="border-b border-hairline pl-3 md:pl-6 pr-[112px] md:pr-[210px] py-2.5 md:py-3 flex items-center justify-between gap-2 sticky top-0 bg-bg/95 backdrop-blur z-10 pt-[calc(env(safe-area-inset-top)+10px)]"
      data-testid="chat-header"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={onBack}
          data-testid="chat-back-btn"
          aria-label="Back to chats"
          className="md:hidden -ml-1 p-1.5 rounded-full text-ink hover:bg-white/5 active:scale-95"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <Avatar
          name={chat.name || (isAIChat ? "AI" : "Direct")}
          src={chat.avatar}
          size={36}
          ring={isAIChat ? "#B794F4" : undefined}
          className={isAIChat ? "bg-ai-tint" : ""}
        />

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={chat.type === "group" ? onOpenGroupInfo : undefined}
            disabled={chat.type !== "group"}
            data-testid="chat-title-btn"
            className={`block w-full text-left min-w-0 ${
              chat.type === "group" ? "cursor-pointer hover:opacity-90" : "cursor-default"
            }`}
            aria-label={chat.type === "group" ? "Open group info" : undefined}
          >
            <h2 className="text-[15px] leading-[20px] font-semibold tracking-tight truncate text-ink">
              {chat.name || "Direct chat"}
            </h2>
            <div className="text-[12px] text-ink-dim truncate flex items-center gap-1.5">
              {chat.type === "group" && (
                <span>
                  {(chat.members || []).length} member
                  {(chat.members || []).length === 1 ? "" : "s"} · tap for info
                </span>
              )}
              {chat.type === "personal_ai" && <span>Always available</span>}
              {chat.type === "direct" && <span>Direct</span>}
            </div>
          </button>

          {showPillRow && (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {chat.project_folder_id && (
                <button
                  type="button"
                  onClick={onOpenProject}
                  className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-brand-tint text-brand text-[11px] font-medium hover:bg-brand/30"
                >
                  <span>🗂</span>
                  {chat.project_folder_name || "Project"}
                </button>
              )}

              {/* Dev OS + Hire pills add clutter on small screens — desktop only.
                  On mobile, Dev OS is reachable from the right-rail panel and
                  hiring is surfaced by the in-chat SmartHireBanner + cross-sell nudge. */}
              {chat.type === "group" && chat.linked_dev_project && (
                <div className="hidden md:flex items-center gap-1">
                  <DevProjectSwitcher
                    chatId={chatId}
                    activePill={chat.linked_dev_project}
                    onSwitched={onProjectSwitched}
                  />
                  <Link
                    to={`/dev-os/projects/${chat.linked_dev_project.id}/studio`}
                    data-testid="chat-devos-quick-open"
                    title="Open DevStudio (live preview + code) for the active project"
                    className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-amber-300 hover:bg-amber-200 text-black ring-1 ring-amber-300 text-[11px] font-semibold active:scale-[0.98] no-underline"
                  >
                    <Rocket className="w-3 h-3" />
                    Open Studio →
                  </Link>
                </div>
              )}

              {chat.type === "group" && !chat.linked_dev_project && onSpinUpDevOs && (
                <button
                  type="button"
                  onClick={onSpinUpDevOs}
                  disabled={devOsBusy}
                  data-testid="chat-devos-spin-up-pill"
                  title="Spin up a Dev OS project linked to this chat"
                  className="hidden md:inline-flex items-center gap-1 h-5 px-2 rounded-full bg-surface-2 text-ink-dim hover:bg-yellow-400/15 hover:text-yellow-200 ring-1 ring-hairline hover:ring-yellow-400/30 text-[11px] font-medium disabled:opacity-60"
                >
                  <Rocket className="w-3 h-3" />
                  {devOsBusy ? "Spinning…" : "+ Dev OS"}
                </button>
              )}

              {chat.type === "group" && (
                <div className="hidden md:flex">
                  <SmartHirePill chatId={chatId} chat={chat} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 md:gap-1.5">
        {!isAIChat && (
          <>
            <button
              data-testid="start-audio-call-btn"
              onClick={onAudioCall}
              title="Audio call"
              aria-label="Audio call"
              className="w-9 h-9 flex items-center justify-center rounded-full text-ink hover:bg-white/5 active:scale-95"
            >
              <Phone className="w-[18px] h-[18px]" strokeWidth={1.8} />
            </button>
            <button
              data-testid="start-video-call-btn"
              onClick={onVideoCall}
              title="Video call"
              aria-label="Video call"
              className="w-9 h-9 flex items-center justify-center rounded-full text-ink hover:bg-white/5 active:scale-95"
            >
              <Video className="w-[18px] h-[18px]" strokeWidth={1.8} />
            </button>
          </>
        )}
        <button
          data-testid="open-integrations-btn"
          onClick={onOpenIntegrations}
          title="Integrations"
          aria-label="Integrations"
          className="hidden md:flex w-9 h-9 items-center justify-center rounded-full text-ink-dim hover:bg-white/5 hover:text-ink active:scale-95"
        >
          <Plug className="w-[18px] h-[18px]" strokeWidth={1.8} />
        </button>
        {!isAIChat && (
          <button
            data-testid="invite-guest-btn"
            onClick={onInviteGuest}
            title="Invite guest"
            aria-label="Invite guest"
            className="hidden md:flex w-9 h-9 items-center justify-center rounded-full text-ink-dim hover:bg-white/5 hover:text-ink active:scale-95"
          >
            <UserPlus className="w-[18px] h-[18px]" strokeWidth={1.8} />
          </button>
        )}

        {hasMenu && (
          <div className="relative" ref={menuRef}>
            <button
              data-testid="chat-header-menu-btn"
              onClick={() => setMenuOpen((v) => !v)}
              title="More"
              aria-label="More"
              aria-expanded={menuOpen}
              className="w-9 h-9 flex items-center justify-center rounded-full text-ink-dim hover:bg-white/5 hover:text-ink active:scale-95"
            >
              <MoreVertical className="w-[18px] h-[18px]" strokeWidth={1.8} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                data-testid="chat-header-menu"
                className="absolute right-0 top-11 min-w-[200px] rounded-card border border-hairline bg-surface shadow-xl overflow-hidden z-30"
              >
                {canLeave && (
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="chat-leave-btn"
                    onClick={() => { setMenuOpen(false); onLeaveChat?.(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-[14px] text-ink hover:bg-white/5"
                  >
                    <LogOut className="w-4 h-4 text-ink-dim" />
                    Leave chat
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="chat-delete-btn"
                    onClick={() => { setMenuOpen(false); onDeleteChat?.(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-[14px] text-tn-red hover:bg-tn-red/10 border-t border-hairline"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete chat for me
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
