import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { createReconnectingWS } from "@/lib/ws";
import { useAuth } from "@/context/AuthContext";

// Default "compare" set run when a user taps "Show all comparisons".
const DEFAULT_COMPARE_MODELS = ["chatgpt", "claude", "gemini"];
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import AIComparison from "@/components/AIComparison";
import AIComparisonInline from "@/components/aicompare/AIComparisonInline";
import AskAIDrawer from "@/components/AskAIDrawer";
import NewChatDialog from "@/components/NewChatDialog";
import WhatsAppStyleNewChatSheet from "@/components/WhatsAppStyleNewChatSheet";
import SuggestTasksDialog from "@/components/SuggestTasksDialog";
import {
  Sparkles,
  Pin,
  PinOff,
  Search,
  Plus,
  MessageSquare,
  PenSquare,
  LogOut,
  Trash2,
  Rocket,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import IntegrationsDialog from "@/components/IntegrationsDialog";
import InviteGuestDialog from "@/components/InviteGuestDialog";
import Avatar from "@/components/ui-v2/Avatar";
import Pill from "@/components/ui-v2/Pill";
import safeStorage from "@/lib/safeStorage";
import ResizableEdge from "@/components/ui-v2/ResizableEdge";
import EmptyState from "@/components/ui-v2/EmptyState";
import FAB from "@/components/ui-v2/FAB";
import ChatHeader from "@/components/chat/ChatHeader";
import CameraCapture from "@/components/chat/CameraCapture";
import GroupInfo from "@/components/chat/GroupInfo";
import DevWorkspacePane from "@/components/chat/DevWorkspacePane";
import LivePreviewPane from "@/components/chat/LivePreviewPane";
import NextIdeasPanel from "@/components/chat/NextIdeasPanel";
import SmartHireBanner from "@/components/chat/SmartHireBanner";
import PreviewViewersChip from "@/components/chat/PreviewViewersChip";
import { LeaveChatDialog, DeleteChatDialog } from "@/components/chat/LeaveDeleteChatDialogs";
import MessageList from "@/components/chat/MessageList";
import ChatComposer from "@/components/chat/ChatComposer";

function relativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const yest = new Date();
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  const sevenDays = 7 * 86400 * 1000;
  if (now.getTime() - d.getTime() < sevenDays) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const FILTERS = [
  { value: "all",    label: "All" },
  { value: "direct", label: "Direct" },
  { value: "group",  label: "Groups" },
  { value: "ai",     label: "AI" },
  { value: "unread", label: "Unread" },
];

export default function Chats() {
  const { chatId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();

  const [chats, setChats] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showNew, setShowNew] = useState(params.get("new") === "group");
  const [showSheet, setShowSheet] = useState(false);
  const [listLeaveChat, setListLeaveChat] = useState(null);
  const [listDeleteChat, setListDeleteChat] = useState(null);
  // When a chat is open, the list auto-collapses to a slim 72px avatars rail
  // to free up horizontal space for the conversation + Dev OS / comparison
  // panes. Pinning keeps the full 360px list visible regardless. Persisted so
  // power users don't have to re-pin on every load.
  const [chatListPinned, setChatListPinned] = useState(
    () => safeStorage.get("chatlist-pinned") === "1",
  );
  useEffect(() => {
    safeStorage.set("chatlist-pinned", chatListPinned ? "1" : "0");
  }, [chatListPinned]);
  const listCompact = !!chatId && !chatListPinned;
  // Drag-to-resize width when expanded (compact mode is fixed at 72px).
  const CHATLIST_MIN = 260;
  const CHATLIST_MAX = 520;
  const CHATLIST_DEFAULT = 360;
  const [chatListWidth, setChatListWidth] = useState(() => {
    const stored = safeStorage.getNumber("chatlist-width", CHATLIST_DEFAULT);
    return Math.min(CHATLIST_MAX, Math.max(CHATLIST_MIN, stored));
  });
  useEffect(() => {
    safeStorage.set("chatlist-width", String(Math.round(chatListWidth)));
  }, [chatListWidth]);

  const loadChats = useCallback(() => {
    api.get("/chats").then(({ data }) => setChats(data));
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // If user landed here from "Use in chat" with ?compose=@priya, redirect them
  // into their personal AI Assistant chat with the trigger pre-filled in the composer.
  const compose = params.get("compose");
  useEffect(() => {
    if (!compose || chatId) return;
    const myAi = chats.find((c) => c.type === "personal_ai");
    if (myAi) {
      nav(`/chats/${myAi.id}?compose=${encodeURIComponent(compose)}`, { replace: true });
    }
  }, [compose, chatId, chats, nav]);

  const filtered = useMemo(() => {
    let list = chats;
    if (filter === "direct") list = list.filter((c) => c.type === "direct");
    else if (filter === "group") list = list.filter((c) => c.type === "group");
    else if (filter === "ai") list = list.filter((c) => c.type === "personal_ai");
    else if (filter === "unread") list = list.filter((c) => c.unread_count > 0);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => (c.name || "").toLowerCase().includes(q));
    }
    // Sort: pinned first, then by last activity
    return list.slice().sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      const aT = new Date(a.last_message?.created_at || a.created_at || 0).getTime();
      const bT = new Date(b.last_message?.created_at || b.created_at || 0).getTime();
      return bT - aT;
    });
  }, [chats, search, filter]);

  const aiChat = chats.find((c) => c.type === "personal_ai");
  const otherChats = filtered.filter((c) => c.type !== "personal_ai");

  return (
    <div className="flex h-[100dvh] bg-bg">
      {/* Chat List */}
      <div
        data-testid="chat-list-panel"
        data-compact={listCompact ? "1" : "0"}
        style={listCompact ? undefined : { width: `${chatListWidth}px` }}
        className={`${
          chatId ? "hidden md:flex" : "flex"
        } w-full ${listCompact ? "md:w-[72px]" : ""} shrink-0 md:border-r md:border-hairline flex-col bg-bg relative`}
      >
        {/* Title row (collapsed: just the pin button) */}
        {listCompact ? (
          <div className="px-2 pt-6 pb-3 flex justify-center">
            <button
              type="button"
              data-testid="chat-list-pin-btn"
              onClick={() => setChatListPinned(true)}
              className="w-9 h-9 rounded-full bg-surface-2 hover:bg-surface-3 text-ink-dim hover:text-ink flex items-center justify-center"
              title="Pin chat list"
              aria-label="Pin chat list"
            >
              <Pin className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="px-4 md:px-5 pt-7 md:pt-10 pb-3 flex items-center justify-between">
            <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.02em]">Chats</h1>
            <div className="flex items-center gap-1.5">
              {chatId && (
                <button
                  type="button"
                  data-testid="chat-list-unpin-btn"
                  onClick={() => setChatListPinned(false)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    chatListPinned
                      ? "bg-brand-tint text-brand"
                      : "bg-surface-2 hover:bg-surface-3 text-ink-dim hover:text-ink"
                  }`}
                  title={chatListPinned ? "Unpin chat list (auto-collapse when chat is open)" : "Collapse chat list"}
                  aria-label="Collapse chat list"
                >
                  {chatListPinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
                </button>
              )}
              <button
                data-testid="new-chat-btn"
                onClick={() => setShowSheet(true)}
                className="w-9 h-9 rounded-full bg-surface-2 hover:bg-surface-3 text-ink flex items-center justify-center active:scale-95 transition-transform"
                aria-label="New chat"
              >
                <PenSquare className="w-[18px] h-[18px]" strokeWidth={1.8} />
              </button>
            </div>
          </div>
        )}

        {/* Search pill (hidden in compact mode) */}
        {!listCompact && (
        <div className="px-4 md:px-5 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-ink-mute" />
            <Input
              data-testid="chat-search"
              placeholder="Search chats, people, AI"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-11 h-11 bg-surface-2 border-hairline rounded-pill text-[14px] placeholder:text-ink-mute"
            />
          </div>
        </div>
        )}

        {/* Filter chips (hidden in compact mode) */}
        {!listCompact && (
        <div className="px-4 md:px-5 py-3 flex gap-2 overflow-x-auto scrollbar-none">
          {FILTERS.map((f) => {
            const active = f.value === filter;
            return (
              <button
                key={f.value}
                type="button"
                data-testid={`chat-filter-${f.value}`}
                onClick={() => setFilter(f.value)}
                className={`shrink-0 h-8 px-3 rounded-full text-[12px] font-medium transition-colors active:scale-95 ${
                  active
                    ? "bg-brand-tint text-brand"
                    : "bg-surface-2 text-ink-dim hover:bg-surface-3"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        )}

        {/* Pinned AI Assistant row */}
        {aiChat && (filter === "all" || filter === "ai") && (
          listCompact ? (
            <button
              data-testid={`chat-item-${aiChat.id}`}
              onClick={() => nav(`/chats/${aiChat.id}`)}
              title={aiChat.name || "My AI Assistant"}
              className={`flex items-center justify-center py-2 mx-2 my-1 rounded-xl hover:bg-white/[0.04] ${
                chatId === aiChat.id ? "bg-white/[0.06] ring-1 ring-brand/40" : ""
              }`}
            >
              <Avatar name="AI" size={40} ring="#B794F4" className="bg-ai-tint" />
            </button>
          ) : (
            <button
              data-testid={`chat-item-${aiChat.id}`}
              onClick={() => nav(`/chats/${aiChat.id}`)}
              className="flex items-center gap-3 px-4 md:px-5 py-3 border-b border-hairline hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left"
            >
              <Avatar
                name="AI"
                size={44}
                ring="#B794F4"
                className="bg-ai-tint"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold truncate">{aiChat.name || "My AI Assistant"}</span>
                  <Pill tone="ai" size="sm">AI</Pill>
                </div>
                <div className="text-[13px] text-ink-dim truncate mt-0.5">
                  {aiChat.last_message?.body?.slice(0, 60) || "Always available"}
                </div>
              </div>
            </button>
          )
        )}

        {/* Chat list rows */}
        <ScrollArea className="flex-1 min-w-0">
          {listCompact ? (
            <CompactChatList
              chats={otherChats}
              activeId={chatId}
              onPick={(id) => nav(`/chats/${id}`)}
            />
          ) : otherChats.length === 0 && filter === "all" && !aiChat ? (
            <EmptyState
              icon={MessageSquare}
              title="Quiet for now."
              sub="Start a chat or ask your AI assistant anything."
              cta="New chat"
              onCta={() => setShowNew(true)}
              ctaTestid="empty-new-chat"
            />
          ) : (
            <GroupedChatList
              chats={otherChats}
              activeId={chatId}
              onPick={(id) => nav(`/chats/${id}`)}
              onLeave={(ch) => { setListLeaveChat(ch); }}
              onDelete={(ch) => { setListDeleteChat(ch); }}
            />
          )}
        </ScrollArea>

        {/* Drag-to-resize on the right edge (only in expanded mode) */}
        {!listCompact && (
          <ResizableEdge
            testid="chatlist-resize-handle"
            minWidth={CHATLIST_MIN}
            maxWidth={CHATLIST_MAX}
            onResize={setChatListWidth}
          />
        )}
      </div>

      {/* Active chat */}
      <div className={`${chatId ? "flex" : "hidden md:flex"} flex-1 min-w-0 flex-col bg-bg`}>
        {chatId ? (
          <ChatPanel chatId={chatId} onChatChange={loadChats} initialThread={params.get("thread")} />
        ) : (
          <EmptyState
            icon={MessageSquare}
            title="Pick a chat"
            sub="Select a chat from the left to start."
          />
        )}
      </div>

      {/* FAB (mobile only, only on the list view) */}
      {!chatId && (
        <FAB
          testid="chats-fab"
          icon={Plus}
          onClick={() => setShowNew(true)}
          label="New chat"
        />
      )}

      <NewChatDialog open={showNew} onOpenChange={setShowNew} onCreated={(c) => { loadChats(); nav(`/chats/${c.id}`); }} />
      <WhatsAppStyleNewChatSheet
        open={showSheet}
        onOpenChange={setShowSheet}
        onOpenGroupDialog={() => setShowNew(true)}
        onChatCreated={(c) => {
          loadChats();
          nav(`/chats/${c.id}`);
        }}
      />
      <LeaveChatDialog
        open={!!listLeaveChat}
        onOpenChange={(v) => !v && setListLeaveChat(null)}
        chat={listLeaveChat}
        onLeft={() => { loadChats(); if (chatId === listLeaveChat?.id) nav("/chats"); }}
      />
      <DeleteChatDialog
        open={!!listDeleteChat}
        onOpenChange={(v) => !v && setListDeleteChat(null)}
        chat={listDeleteChat}
        onDeleted={() => { loadChats(); if (chatId === listDeleteChat?.id) nav("/chats"); }}
      />
    </div>
  );
}

function CompactChatList({ chats, activeId, onPick }) {
  if (!chats.length) return null;
  return (
    <div className="py-1">
      {chats.map((c) => {
        const initial = (c.name || "?").charAt(0).toUpperCase();
        const isActive = c.id === activeId;
        return (
          <button
            key={c.id}
            data-testid={`chat-item-${c.id}`}
            onClick={() => onPick(c.id)}
            title={c.name || "Chat"}
            className={`relative flex items-center justify-center py-2 mx-2 my-1 rounded-xl hover:bg-white/[0.04] ${
              isActive ? "bg-white/[0.06] ring-1 ring-brand/40" : ""
            }`}
          >
            <Avatar name={initial} size={40} />
            {c.unread_count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-brand text-black text-[10px] font-bold flex items-center justify-center leading-none">
                {c.unread_count > 9 ? "9+" : c.unread_count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function GroupedChatList({ chats, activeId, onPick, onLeave, onDelete }) {
  // Stable label order — `null` (uncategorized) sits at the top so old chats
  // don't visually disappear into a "General" bucket.
  const LABELS = useMemo(() => ({
    null: "Uncategorized",
    engineering: "Engineering",
    product: "Product",
    marketing: "Marketing",
    ops: "Ops",
    sales: "Sales",
    general: "General",
  }), []);
  const ORDER = useMemo(() => ["null", "engineering", "product", "marketing", "ops", "sales", "general"], []);

  const groups = useMemo(() => {
    const map = {};
    for (const c of chats) {
      const key = c.category || "null";
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return ORDER
      .filter((k) => map[k] && map[k].length > 0)
      .map((k) => ({ key: k, label: LABELS[k] || k, items: map[k] }));
  }, [chats, LABELS, ORDER]);

  const [collapsed, setCollapsed] = useState(() => {
    // Persist collapsed state per-user via localStorage.
    try {
      const raw = localStorage.getItem("tn:chat-groups-collapsed");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const toggle = (key) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem("tn:chat-groups-collapsed", JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
  };

  // Single-group degenerate case (e.g., everything is uncategorized): render
  // flat to avoid an unnecessary header.
  if (groups.length <= 1) {
    return chats.map((c) => (
      <ChatRow
        key={c.id}
        chat={c}
        active={activeId === c.id}
        onClick={() => onPick(c.id)}
        onLeave={onLeave}
        onDelete={onDelete}
      />
    ));
  }

  return (
    <>
      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        return (
          <div key={g.key} data-testid={`chat-group-${g.key}`}>
            <button
              type="button"
              onClick={() => toggle(g.key)}
              data-testid={`chat-group-toggle-${g.key}`}
              className="w-full flex items-center gap-2 px-4 md:px-5 py-2 text-[11px] font-mono uppercase tracking-widest text-ink-mute hover:text-ink hover:bg-white/[0.02]"
            >
              {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              <span className="flex-1 text-left">{g.label}</span>
              <span className="text-ink-mute font-mono normal-case tracking-normal">{g.items.length}</span>
            </button>
            {!isCollapsed && g.items.map((c) => (
              <ChatRow
                key={c.id}
                chat={c}
                active={activeId === c.id}
                onClick={() => onPick(c.id)}
                onLeave={onLeave}
                onDelete={onDelete}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

function ChatRow({ chat, active, onClick, onLeave, onDelete }) {  const c = chat;
  const isAI = c.type === "personal_ai";
  const lastSender = c.last_message?.sender_name;
  const isMine = c.last_message?.sender_id && c.last_message?.sender_id === c.me_id;
  const preview = c.last_message?.body || c.description || "";
  const senderPrefix = c.type === "group" && lastSender && !isMine ? `${lastSender.split(" ")[0]}: ` : "";
  const longPressTimer = useRef(null);
  const [menuPos, setMenuPos] = useState(null); // {x, y}

  const closeMenu = () => setMenuPos(null);
  const openMenuAt = (clientX, clientY) => setMenuPos({ x: clientX, y: clientY });

  useEffect(() => {
    if (!menuPos) return undefined;
    const onDoc = () => closeMenu();
    document.addEventListener("click", onDoc);
    document.addEventListener("scroll", onDoc, true);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("scroll", onDoc, true);
    };
  }, [menuPos]);

  const onContext = (e) => {
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY);
  };
  const onTouchStart = (e) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    const t = e.touches[0];
    const startX = t.clientX;
    const startY = t.clientY;
    longPressTimer.current = setTimeout(() => openMenuAt(startX, startY), 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const canLeave = c.type === "group";

  return (
    <div className="relative">
      <button
        data-testid={`chat-item-${c.id}`}
        onClick={onClick}
        onContextMenu={onContext}
        onTouchStart={onTouchStart}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onTouchCancel={cancelLongPress}
        className={`w-full flex items-center gap-3 px-4 md:px-5 py-3 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left ${
          active ? "bg-white/[0.04]" : ""
        }`}
      >
        <div className="relative">
          <Avatar name={c.name || "Direct"} src={c.avatar} size={44} />
          {c.pinned && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-brand flex items-center justify-center">
              <Pin className="w-2 h-2 text-black" strokeWidth={3} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[15px] font-semibold truncate">{c.name || "Direct"}</span>
              {isAI && <Pill tone="ai" size="sm">AI</Pill>}
              {c.kind === "development" && (
                <Rocket
                  className="w-3.5 h-3.5 text-amber-300 shrink-0"
                  data-testid={`chat-row-dev-badge-${c.id}`}
                />
              )}
              {c.linked_dev_project && (
                <Link
                  to={`/dev-os/projects/${c.linked_dev_project.id}/studio`}
                  data-testid={`chat-row-open-studio-${c.id}`}
                  onClick={(e) => e.stopPropagation()}
                  title={`Open DevStudio for ${c.linked_dev_project.name}`}
                  className="shrink-0 inline-flex items-center gap-1 h-4 px-1.5 rounded-full bg-amber-300/15 hover:bg-amber-300/25 text-amber-200 text-[10px] font-semibold ring-1 ring-amber-300/30 no-underline"
                >
                  <Rocket className="w-2.5 h-2.5" />
                  Studio
                </Link>
              )}
            </div>
            <span className="text-[11px] text-ink-mute shrink-0 leading-none">
              {relativeTime(c.last_message?.created_at || c.created_at)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span className="text-[13px] text-ink-dim truncate flex-1 min-w-0 block">
              {senderPrefix}
              {preview || "—"}
            </span>
            {c.unread_count > 0 && (
              <span className="shrink-0 min-w-[20px] h-[20px] px-1.5 rounded-full bg-brand text-black text-[11px] font-bold flex items-center justify-center leading-none">
                {c.unread_count > 99 ? "99+" : c.unread_count}
              </span>
            )}
          </div>
        </div>
      </button>

      {menuPos && (
        <div
          role="menu"
          data-testid={`chat-item-menu-${c.id}`}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-[200px] rounded-card border border-hairline bg-surface shadow-2xl overflow-hidden"
          style={{
            left: Math.min(menuPos.x, window.innerWidth - 220),
            top: Math.min(menuPos.y, window.innerHeight - 120),
          }}
        >
          {canLeave && (
            <button
              type="button"
              role="menuitem"
              data-testid={`chat-item-leave-${c.id}`}
              onClick={() => { closeMenu(); onLeave?.(c); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-[14px] text-ink hover:bg-white/5"
            >
              <LogOut className="w-4 h-4 text-ink-dim" />
              Leave chat
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            data-testid={`chat-item-delete-${c.id}`}
            onClick={() => { closeMenu(); onDelete?.(c); }}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left text-[14px] text-tn-red hover:bg-tn-red/10 ${canLeave ? "border-t border-hairline" : ""}`}
          >
            <Trash2 className="w-4 h-4" />
            Delete chat for me
          </button>
        </div>
      )}
    </div>
  );
}

function ChatPanel({ chatId, onChatChange, initialThread }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");

  // When opening via ?compose=@priya, prefill the textarea once and strip the param.
  useEffect(() => {
    const compose = searchParams.get("compose");
    if (compose && chatId) {
      setDraft(compose);
      searchParams.delete("compose");
      setSearchParams(searchParams, { replace: true });
    }
  }, [chatId, searchParams, setSearchParams]);

  // Returning from a successful Hire-Dev-Team Stripe checkout — finalize the
  // purchase server-side and refresh the chat so the team appears immediately.
  useEffect(() => {
    const sessionId = searchParams.get("dev_team_session_id");
    const canceled = searchParams.get("dev_team_canceled");
    if (canceled) {
      toast.info("Hire Dev Team checkout was canceled");
      searchParams.delete("dev_team_canceled");
      setSearchParams(searchParams, { replace: true });
      return;
    }
    if (!sessionId || !chatId) return;
    toast.info("Finalizing AI dev team hire…");
    let stop = false;
    let tries = 0;
    const tick = async () => {
      if (stop) return;
      tries += 1;
      try {
        const { data } = await api.get(
          `/chats/${chatId}/hire-dev-team/status/${sessionId}`,
        );
        if (data.applied) {
          toast.success("🎉 AI dev team is now on this chat");
          searchParams.delete("dev_team_session_id");
          setSearchParams(searchParams, { replace: true });
          // Pull fresh chat + messages so the new bot_role_ids / kind reflect.
          await api.get(`/chats/${chatId}`).then(({ data: c }) => setChat(c));
          await api.get(`/chats/${chatId}/messages`).then(({ data: m }) => setMessages(m));
          return;
        }
      } catch (e) {
        // 404 / 403 are terminal — stop polling so we don't spam.
        if ([403, 404].includes(e?.response?.status)) {
          toast.error(e.response.data?.detail || "Could not verify checkout");
          searchParams.delete("dev_team_session_id");
          setSearchParams(searchParams, { replace: true });
          return;
        }
      }
      if (tries < 8) setTimeout(tick, 1500);
    };
    tick();
    return () => { stop = true; };
  }, [chatId, searchParams, setSearchParams]);
  const [showAI, setShowAI] = useState(false);
  const [showImprove, setShowImprove] = useState(false);
  const [showTask, setShowTask] = useState(null);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [showGuest, setShowGuest] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [devOsBusy, setDevOsBusy] = useState(false);
  const [activeThread, setActiveThread] = useState(initialThread || null);
  const [fullScreenThread, setFullScreenThread] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});
  const typingTimersRef = useRef({});
  const wsRef = useRef(null);
  const scrollRef = useRef(null);

  const loadChat = useCallback(
    () => api.get(`/chats/${chatId}`).then(({ data }) => setChat(data)),
    [chatId],
  );

  useEffect(() => {
    setMessages([]);
    setActiveThread(initialThread || null);
    loadChat();
    api.get(`/chats/${chatId}/messages`).then(({ data }) => setMessages(data));
  }, [chatId, initialThread, loadChat]);

  // WebSocket with auto-reconnect
  useEffect(() => {
    if (!chatId) return;
    const ws = createReconnectingWS({
      chatId,
      onMessage: ({ event, data }) => {
        if (event === "message") {
          setMessages((prev) => (prev.find((m) => m.id === data.id) ? prev : [...prev, data]));
        } else if (event === "message_updated") {
          setMessages((prev) => prev.map((m) => (m.id === data.id ? data : m)));
        } else if (event === "typing") {
          setTypingUsers((t) => ({ ...t, [data.user_id]: data.typing }));
          // Reset (not stack) the auto-clear timer so backend pulses every
          // 2.5s keep the indicator alive without flicker.
          if (typingTimersRef.current[data.user_id]) {
            clearTimeout(typingTimersRef.current[data.user_id]);
            delete typingTimersRef.current[data.user_id];
          }
          if (data.typing) {
            typingTimersRef.current[data.user_id] = setTimeout(() => {
              setTypingUsers((t) => ({ ...t, [data.user_id]: false }));
              delete typingTimersRef.current[data.user_id];
            }, 4000);
          }
        }
      },
    });
    wsRef.current = ws;
    return () => ws.close();
  }, [chatId]);

  // Polling safety-net: WebSocket delivery can be blocked in some deployed
  // environments (proxy not upgrading WS, or multi-worker in-memory broadcast).
  // Poll the open chat every few seconds and reconcile so new/edited messages
  // appear automatically without a manual refresh. When WS is healthy this is a
  // no-op (the fast-path below returns the same state → no re-render/scroll).
  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const { data } = await api.get(`/chats/${chatId}/messages`);
        if (cancelled || !Array.isArray(data)) return;
        setMessages((prev) => {
          const a = prev[prev.length - 1];
          const b = data[data.length - 1];
          const unchanged =
            prev.length === data.length &&
            ((!a && !b) || (a && b && a.id === b.id && a.edited_at === b.edited_at && a.deleted_at === b.deleted_at));
          return unchanged ? prev : data;
        });
      } catch {
        /* transient — try again next tick */
      }
    };
    const iv = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [chatId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [showCamera, setShowCamera] = useState(false);

  const onPickFile = () => fileInputRef.current?.click();
  const onPickCamera = () => setShowCamera(true);

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      // Stamp the upload with the active chat so the backend can auto-link it
      // to that chat's project folder (so it appears under the folder's
      // Documents tab without any extra action).
      if (chat?.id) form.append("chat_id", chat.id);
      const { data } = await api.post("/uploads", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAttachments((prev) => [...prev, data]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await uploadFile(file);
  };

  const send = async () => {
    if (!draft.trim() && attachments.length === 0) return;
    const body = draft || (attachments[0]?.is_image ? "[image]" : `[file: ${attachments[0]?.filename}]`);
    const metadata = attachments.length > 0 ? { attachments } : {};
    setDraft("");
    setAttachments([]);
    try {
      await api.post(`/chats/${chatId}/messages`, { body, message_type: "text", metadata });
      onChatChange?.();
    } catch {
      toast.error("Failed to send");
    }
  };

  // One-tap quick action on attached files (Summarize / Extract action items).
  // Sends the message immediately with the preset @ai prompt + current
  // attachments so the AI runs right away.
  const quickAction = async (prompt) => {
    if (attachments.length === 0) return;
    const metadata = { attachments };
    setAttachments([]);
    try {
      await api.post(`/chats/${chatId}/messages`, { body: prompt, message_type: "text", metadata });
      onChatChange?.();
    } catch {
      toast.error("Failed to send");
    }
  };

  const sendTyping = () => {
    try {
      wsRef.current?.send({ event: "typing", typing: true });
    } catch (err) {
      console.warn("[chat] typing event failed", err);
    }
  };

  const onAIResearch = async (question, models, opts = {}) => {
    setShowAI(false);
    setDraft("");
    const imageIds = attachments.filter((a) => a.is_image).map((a) => a.id);
    const finalQuestion =
      question?.trim() || (imageIds.length > 0 ? "Describe this photo." : "");
    // Clear attachments now that they're being sent to AI.
    if (imageIds.length > 0) setAttachments([]);
    try {
      const { data } = await api.post("/ai/research", {
        chat_id: chatId,
        question: finalQuestion,
        selected_models: models,
        memory_mode: opts.memoryMode || "chat",
        image_file_ids: imageIds.length > 0 ? imageIds : undefined,
      });
      // Synthesized answer is auto-posted as a chat message by the backend.
      // We don't auto-open the comparison panel anymore — users click "Show all comparisons"
      // on the AI answer if they want to compare.
      const sourcesCount = (data?.memory_sources || []).length;
      if (sourcesCount > 0) {
        toast.success(`AI answered using ${sourcesCount} memory sources`);
      } else if (imageIds.length > 0) {
        toast.success(`AI analyzed ${imageIds.length} photo${imageIds.length > 1 ? "s" : ""} · posted in chat`);
      } else {
        toast.success("AI synthesized best answer · posted in chat");
      }
    } catch (e) {
      toast.error("AI research failed");
    }
  };

  if (!chat) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;

  const isAIChat = chat.type === "personal_ai";
  const isDevChat = chat.kind === "development";
  const memberMap = Object.fromEntries((chat.members || []).map((m) => [m.id, m]));

  return (
    <div className="h-[100dvh] flex bg-bg">
      {/* Left: chat column. Full width on mobile / non-dev. ~58% on desktop dev chats. */}
      <div className={`flex flex-col flex-1 min-w-0 ${isDevChat ? "lg:max-w-[58%]" : ""}`}>
      <ChatHeader
        chat={chat}
        chatId={chatId}
        isAIChat={isAIChat}
        onBack={() => nav("/chats")}
        onAudioCall={() => window.open(`/call/new?chat=${chatId}&mode=audio`, "_blank", "noopener")}
        onVideoCall={() => window.open(`/call/new?chat=${chatId}&mode=video`, "_blank", "noopener")}
        onOpenIntegrations={() => setShowIntegrations(true)}
        onInviteGuest={() => setShowGuest(true)}
        onOpenProject={() => nav(`/projects/${chat.project_folder_id}`)}
        onOpenGroupInfo={() => setShowGroupInfo(true)}
        onLeaveChat={() => setLeaveOpen(true)}
        onDeleteChat={() => setDeleteOpen(true)}
        onOpenDevOs={() => chat.linked_dev_project && nav(`/dev-os/projects/${chat.linked_dev_project.id}`)}
        onProjectSwitched={() => { loadChat(); }}
        onSpinUpDevOs={async () => {
          setDevOsBusy(true);
          try {
            const { data } = await api.post(`/chats/${chatId}/spin-up-dev-os`);
            toast.success(
              data.created
                ? `Dev OS project "${data.project.name}" linked to this chat`
                : "Project already linked",
            );
            // Refresh chat to get the linked_dev_project on the header.
            await loadChat();
            nav(`/dev-os/projects/${data.project.id}`);
          } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not spin up project");
          } finally {
            setDevOsBusy(false);
          }
        }}
        devOsBusy={devOsBusy}
      />

      <MessageList
        ref={scrollRef}
        messages={messages}
        memberMap={memberMap}
        userId={user.id}
        typingUsers={typingUsers}
        onOpenThread={(tid) => {
          setActiveThread(tid);
          // Requirement: "Show all comparisons" runs the full default compare set.
          api
            .post(`/ai/research/${tid}/run-models`, { selected_models: DEFAULT_COMPARE_MODELS })
            .catch(() => {});
        }}
        onCreateTask={(msg) => setShowTask(msg)}
        onPickIdea={(text) => setDraft((d) => (d ? `${d} ${text}` : text))}
        topSlot={
          <>
            <PreviewViewersChip chatId={chatId} />
            {chat.type === "group" ? (
              <SmartHireBanner chatId={chatId} chat={chat} />
            ) : null}
          </>
        }
        bottomSlot={
          activeThread ? (
            <AIComparisonInline
              threadId={activeThread}
              chatId={chatId}
              onClose={() => setActiveThread(null)}
              onExpand={() => setFullScreenThread(activeThread)}
            />
          ) : null
        }
      />

      {/* Full-page comparison popup (opened from the inline "Open full screen" link). */}
      {fullScreenThread && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex flex-col"
          data-testid="fullscreen-comparison"
        >
          <AIComparison
            threadId={fullScreenThread}
            chatId={chatId}
            fullScreen
            onClose={() => setFullScreenThread(null)}
          />
        </div>
      )}

      <NextIdeasPanel
        chatId={chatId}
        lastMessageId={messages[messages.length - 1]?.id}
        onPick={(text) => setDraft((d) => (d ? `${d} ${text}` : text))}
      />

      <ChatComposer
        chat={chat}
        chatId={chatId}
        draft={draft}
        onDraftChange={setDraft}
        onSend={send}
        onQuickAction={quickAction}
        onSendTyping={sendTyping}
        attachments={attachments}
        onRemoveAttachment={(idx) =>
          setAttachments(attachments.filter((_, i) => i !== idx))
        }
        fileInputRef={fileInputRef}
        cameraInputRef={cameraInputRef}
        onPickFile={onPickFile}
        onPickCamera={onPickCamera}
        onFileChange={onFileChange}
        uploading={uploading}
        showAI={showAI}
        onCancelAI={() => setShowAI(false)}
        onAIResearch={onAIResearch}
        onOpenImprove={() => setShowImprove(true)}
        onOpenAI={() => setShowAI(true)}
        onRefreshMessages={() =>
          api.get(`/chats/${chatId}/messages`).then(({ data }) => setMessages(data))
        }
      />

      <CameraCapture
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={uploadFile}
        onFallback={() => cameraInputRef.current?.click()}
      />

      <AskAIDrawer
        open={showImprove}
        onOpenChange={setShowImprove}
        text={draft}
        onApply={(improved) => {
          setDraft(improved);
          setShowImprove(false);
        }}
      />
      <IntegrationsDialog
        open={showIntegrations}
        onOpenChange={setShowIntegrations}
        chatId={chatId}
        chatName={chat?.name}
      />
      <InviteGuestDialog
        open={showGuest}
        onOpenChange={setShowGuest}
        chatId={chatId}
        chatName={chat?.name}
      />
      <SuggestTasksDialog
        open={!!showTask}
        onOpenChange={(v) => !v && setShowTask(null)}
        sourceChatId={chatId}
        sourceMessage={showTask}
        folderId={chat.project_folder_id}
      />
      <LeaveChatDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        chat={chat}
        onLeft={() => { onChatChange?.(); nav("/chats"); }}
      />
      <DeleteChatDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        chat={chat}
        onDeleted={() => { onChatChange?.(); nav("/chats"); }}
      />
      <GroupInfo
        chatId={chatId}
        open={showGroupInfo}
        onClose={() => setShowGroupInfo(false)}
        onChatChange={(updated) => {
          // Update local chat state so ChatHeader + policy enforcement use fresh data.
          if (updated) setChat(updated);
          onChatChange?.();
        }}
      />
      </div>
      {/* Right: live preview iframe (collapsible) for ANY chat with a
          linked project. Stays out of the way by default — slim vertical
          strip — but expands to a wide split-view when the team wants to
          poke at the build without leaving the chat. */}
      {chat.linked_dev_project && (
        <LivePreviewPane
          chatId={chatId}
          project={chat.linked_dev_project}
          onQuickPrompt={(text) => setDraft((d) => (d ? `${d} ${text}` : text))}
        />
      )}
    </div>
  );
}
