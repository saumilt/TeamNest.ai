import { useEffect, useState } from "react";
import { Eye, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";

/**
 * PreviewViewersChip — small banner inserted into the chat top-slot.
 *
 * Polls /chats/{chatId}/preview-viewers every 15s. When teammates are
 * currently looking at the dev-OS preview linked to this chat, surfaces a
 * "Priya is viewing the live preview" chip with a one-click "Open
 * DevStudio →" link. Renders nothing when nobody else is viewing — keeps
 * the chat header clean for the 99% case.
 */
export default function PreviewViewersChip({ chatId }) {
  const [viewers, setViewers] = useState([]);
  const [projectId, setProjectId] = useState(null);

  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    let consecutiveAuthFailures = 0;
    let interval = null;
    const poll = async () => {
      try {
        const { data } = await api.get(`/chats/${chatId}/preview-viewers`);
        if (cancelled) return;
        setViewers(data.viewers || []);
        setProjectId(data.project_id || null);
        consecutiveAuthFailures = 0;
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          consecutiveAuthFailures += 1;
          if (consecutiveAuthFailures >= 2 && interval) {
            clearInterval(interval);
            interval = null;
          }
        }
      }
    };
    poll();
    interval = setInterval(poll, 15_000);
    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [chatId]);

  if (viewers.length === 0) return null;

  const names = viewers.map((v) => v.user_name || "Teammate");
  const label =
    viewers.length === 1
      ? `${names[0]} is viewing the live preview`
      : viewers.length === 2
        ? `${names[0]} and ${names[1]} are viewing the live preview`
        : `${names[0]} + ${viewers.length - 1} others are viewing the live preview`;

  const initials = (n) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div
      data-testid="chat-preview-viewers-chip"
      className="mx-3 my-2 px-3 py-2 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center gap-2.5 text-[12px] text-emerald-100"
    >
      <Eye className="w-3.5 h-3.5 text-emerald-300 shrink-0 animate-pulse" />
      <span className="flex -space-x-1.5">
        {viewers.slice(0, 3).map((v) => (
          <span
            key={v.user_id}
            className="w-5 h-5 rounded-full bg-emerald-400/30 ring-2 ring-bg text-[10px] font-semibold text-emerald-100 flex items-center justify-center"
            title={v.user_name}
          >
            {initials(v.user_name || "T")}
          </span>
        ))}
      </span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {projectId && (
        <Link
          to={`/dev-os/projects/${projectId}/studio`}
          data-testid="chat-preview-viewers-open"
          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-200 hover:text-emerald-100 underline-offset-2 hover:underline"
        >
          Join them <ExternalLink className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}
