import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Bell, AlertTriangle, Check } from "lucide-react";

/** Notification bell with unread badge + dropdown feed. */
export default function NotificationBell({ collapsed }) {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const load = () => {
    api.get("/notifications").then(({ data }) => { setItems(data.items); setUnread(data.unread_count); }).catch(() => {});
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const openItem = async (n) => {
    if (!n.read) { api.post(`/notifications/${n.id}/read`).catch(() => {}); setItems((p) => p.map((x) => x.id === n.id ? { ...x, read: true } : x)); setUnread((u) => Math.max(0, u - 1)); }
    setOpen(false);
    if (n.meta?.chat_id) nav(`/chats/${n.meta.chat_id}`);
  };
  const readAll = async () => {
    await api.post("/notifications/read-all").catch(() => {});
    setItems((p) => p.map((x) => ({ ...x, read: true }))); setUnread(0);
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" data-testid="notif-bell" onClick={() => setOpen((o) => !o)} title="Notifications"
        className="relative text-zinc-500 hover:text-white p-1.5 rounded-lg hover:bg-white/5">
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span data-testid="notif-unread-badge" className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div data-testid="notif-panel" className={`absolute ${collapsed ? "left-0" : "right-0"} bottom-10 w-80 max-h-[420px] overflow-hidden rounded-xl border border-white/10 bg-surface shadow-2xl z-50 flex flex-col`}>
          <div className="flex items-center px-4 py-3 border-b border-white/10 shrink-0">
            <span className="text-sm font-bold flex-1">Notifications</span>
            {unread > 0 && <button type="button" data-testid="notif-read-all" onClick={readAll} className="text-xs text-ai font-semibold">Mark all read</button>}
          </div>
          <div className="overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-ink-dim">You're all caught up.</div>
            ) : items.map((n) => (
              <button type="button" key={n.id} onClick={() => openItem(n)} data-testid={`notif-item-${n.id}`}
                className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] ${!n.read ? "bg-ai-tint/30" : ""}`}>
                <div className="flex items-start gap-2">
                  {n.type === "escalation"
                    ? <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    : <Check className="w-4 h-4 text-ai mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate">{n.title}</div>
                    <div className="text-[11px] text-ink-dim leading-snug mt-0.5 line-clamp-2">{n.body}</div>
                  </div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
