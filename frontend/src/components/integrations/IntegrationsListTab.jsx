import { Plug, Send, Globe, Trash2, Copy, Webhook } from "lucide-react";

const ABS_BACKEND = process.env.REACT_APP_BACKEND_URL;

function typeIcon(t) {
  if (t === "incoming_webhook") return <Webhook className="w-3.5 h-3.5 text-yellow-400" />;
  if (t === "outgoing_webhook") return <Send className="w-3.5 h-3.5 text-blue-400" />;
  if (t === "api_fetch") return <Globe className="w-3.5 h-3.5 text-emerald-400" />;
  return <Plug className="w-3.5 h-3.5" />;
}

/** Active integrations list. */
export default function IntegrationsListTab({ list, onRemove, onCopy }) {
  if (list.length === 0) {
    return (
      <div className="text-sm text-zinc-500 border border-dashed border-white/10 rounded-sm p-6 text-center">
        No integrations yet. Add an incoming webhook to receive data from Zapier, Make, or any HTTP source.
      </div>
    );
  }
  return (
    <>
      {list.map((it) => (
        <div
          key={it.id}
          data-testid={`integration-${it.id}`}
          className="border border-white/10 bg-[#121214] rounded-sm p-3"
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              {typeIcon(it.type)}
              <span className="font-medium text-sm truncate">{it.name}</span>
              <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
                · {it.type.replace("_", " ")}
              </span>
            </div>
            <button
              data-testid={`integration-remove-${it.id}`}
              onClick={() => onRemove(it.id)}
              className="text-zinc-500 hover:text-red-400 p-1"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {it.type === "incoming_webhook" && it.webhook_url && (
            <div className="bg-black/60 border border-white/5 rounded-sm p-2 flex items-center gap-2">
              <code className="text-[11px] font-mono text-yellow-200 truncate flex-1">
                {`${ABS_BACKEND}${it.webhook_url}`}
              </code>
              <button
                data-testid={`integration-copy-${it.id}`}
                onClick={() => onCopy(`${ABS_BACKEND}${it.webhook_url}`)}
                className="text-zinc-400 hover:text-white p-1"
                title="Copy URL"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {(it.type === "outgoing_webhook" || it.type === "api_fetch") && it.config?.url && (
            <div className="text-[11px] font-mono text-zinc-400 truncate">
              URL: <span className="text-zinc-200">{it.config.url}</span>
            </div>
          )}
          {it.last_used_at && (
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mt-1">
              Last used: {new Date(it.last_used_at).toLocaleString()}
            </div>
          )}
          {it.type === "incoming_webhook" && (
            <div className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
              Paste this URL into Zapier &gt; Webhooks &gt; <em>POST</em>. Send JSON:{" "}
              <code className="font-mono text-yellow-300">{`{"title":"...","text":"...","source":"Zapier"}`}</code>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
