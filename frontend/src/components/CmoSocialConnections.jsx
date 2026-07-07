import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Instagram, Facebook, Youtube, RefreshCw, Trash2, Plus, Sparkles } from "lucide-react";
import { api } from "@/lib/api";

const ICONS = {
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
};

const PLATFORM_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook Pages",
  youtube: "YouTube",
};

/**
 * CMO social connections card. Lets the workspace owner connect Instagram,
 * Facebook Pages, and YouTube via OAuth so AI CMO can reason over real
 * follower / reach / view counts when drafting marketing plans.
 *
 * If the server is missing API keys for a platform, that "Connect" button
 * is hidden. Buttons surface a friendly tooltip explaining what's needed.
 */
export default function CmoSocialConnections() {
  const [config, setConfig] = useState(null);
  const [connections, setConnections] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      const [c, conns] = await Promise.all([
        api.get("/social/config"),
        api.get("/social/connections"),
      ]);
      setConfig(c.data);
      setConnections(conns.data.connections || []);
    } catch (err) {
      console.warn("[social] load failed:", err?.message);
    }
  };

  useEffect(() => {
    load();
    // If we just came back from an OAuth callback, the URL has ?connected=...
    if (window.location.search.includes("connected=")) {
      const params = new URLSearchParams(window.location.search);
      const platform = params.get("connected");
      const count = Number(params.get("count") || 0);
      if (count > 0) {
        toast.success(`Connected ${count} ${PLATFORM_LABELS[platform] || platform} account${count === 1 ? "" : "s"}`);
      } else {
        toast.info(`No ${PLATFORM_LABELS[platform] || platform} accounts found to connect.`);
      }
      window.history.replaceState({}, "", "/employees");
    }
  }, []);

  const connect = async (platform) => {
    try {
      setBusy(platform);
      const path =
        platform === "youtube"
          ? "/social/google/auth-url"
          : `/social/meta/auth-url?platform=${platform}`;
      const { data } = await api.get(path);
      window.location.href = data.url;
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not start OAuth");
      setBusy(null);
    }
  };

  const sync = async (conn) => {
    setBusy(conn.id);
    try {
      const { data } = await api.post(`/social/connections/${conn.id}/sync`);
      const s = data.snapshot || {};
      const summary =
        conn.platform === "youtube"
          ? `${(s.subscribers || 0).toLocaleString()} subs · ${(s.views || 0).toLocaleString()} views`
          : conn.platform === "instagram"
            ? `${(s.followers || 0).toLocaleString()} followers · ${(s.media_count || 0)} posts`
            : `${(s.fans || 0).toLocaleString()} fans · ${(s.followers || 0).toLocaleString()} followers`;
      toast.success(`Synced: ${summary}`);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Sync failed");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (conn) => {
    if (!window.confirm(`Disconnect ${conn.display_name}?`)) return;
    try {
      await api.delete(`/social/connections/${conn.id}`);
      toast.success("Disconnected");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not disconnect");
    }
  };

  if (!config) return null;
  const anyAvailable = config.platforms.some((p) => p.available);

  return (
    <section
      data-testid="cmo-social-section"
      className="border border-violet-500/30 bg-violet-500/[0.03] rounded-md p-5 space-y-4"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-mono uppercase tracking-widest text-violet-300">
            AI CMO · Social analytics
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Connect your Instagram, Facebook Pages, and YouTube so AI CMO can reason about real
            follower, reach, and view numbers when planning campaigns.
          </p>
        </div>
      </div>

      {!anyAvailable && (
        <div
          data-testid="social-no-keys"
          className="text-xs text-amber-300 bg-amber-400/5 border border-amber-400/30 rounded-sm p-3"
        >
          Social integrations need API keys configured by your workspace admin. Once added, the
          Connect buttons will activate here.
        </div>
      )}

      {/* Connect buttons row */}
      <div className="flex flex-wrap gap-2">
        {config.platforms
          .filter((p) => p.available)
          .map((p) => {
            const Icon = ICONS[p.key];
            return (
              <button
                key={p.key}
                onClick={() => connect(p.key)}
                disabled={busy === p.key}
                data-testid={`social-connect-${p.key}`}
                className="h-10 px-4 rounded-md bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white font-mono uppercase tracking-widest text-xs flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                <Icon className="w-4 h-4" />
                Connect {p.label}
              </button>
            );
          })}
      </div>

      {/* Connected accounts */}
      {connections.length > 0 && (
        <div className="space-y-2 border-t border-white/5 pt-4">
          {connections.map((conn) => {
            const Icon = ICONS[conn.platform] || Sparkles;
            const snap = conn.last_snapshot || {};
            const summary =
              conn.platform === "youtube"
                ? `${(snap.subscribers || 0).toLocaleString()} subs · ${(snap.views || 0).toLocaleString()} views`
                : conn.platform === "instagram"
                  ? `${(snap.followers || 0).toLocaleString()} followers · ${snap.media_count || 0} posts`
                  : conn.platform === "facebook"
                    ? `${(snap.fans || 0).toLocaleString()} fans`
                    : "—";
            return (
              <div
                key={conn.id}
                data-testid={`social-conn-${conn.id}`}
                className="flex items-center justify-between gap-3 bg-[#121214] border border-white/5 rounded-md px-3 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{conn.display_name}</div>
                    <div className="text-[11px] font-mono text-zinc-500">
                      {PLATFORM_LABELS[conn.platform]} · {conn.last_synced_at ? summary : "Not synced yet"}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => sync(conn)}
                    disabled={busy === conn.id}
                    data-testid={`social-sync-${conn.id}`}
                    className="h-9 px-3 rounded-md border border-white/10 hover:bg-white/5 text-xs font-mono uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={"w-3.5 h-3.5 " + (busy === conn.id ? "animate-spin" : "")} />
                    Sync
                  </button>
                  <button
                    onClick={() => disconnect(conn)}
                    data-testid={`social-disconnect-${conn.id}`}
                    className="h-9 px-2 rounded-md border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 text-red-400"
                    aria-label="Disconnect"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
