import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { Landmark, Plus, RefreshCw, Trash2, Wallet } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Plaid Link "Connect bank" panel for the Bookkeeper page.
 * - Lists connected banks/cards for the workspace.
 * - Opens Plaid Link to add a new institution.
 * - "Refresh" pulls new statements from Plaid and feeds them into the
 *   bookkeeper categorization pipeline. Shows usage-billing summary.
 */
export default function PlaidConnect({ onStatementsImported }) {
  const [config, setConfig] = useState(null);
  const [items, setItems] = useState([]);
  const [usage, setUsage] = useState(null);
  const [linkToken, setLinkToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [c, i, u] = await Promise.all([
        api.get("/plaid/config"),
        api.get("/plaid/items"),
        api.get("/plaid/usage"),
      ]);
      setConfig(c.data);
      setItems(i.data.items || []);
      setUsage(u.data);
    } catch (err) {
      // 503 if Plaid not configured on the server — hide the UI silently.
      // Anything else is logged so a real outage isn't invisible.
      if (err?.response?.status !== 503) {
        console.warn("[plaid] config/items/usage fetch failed:", err?.message || err);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const requestLinkToken = async () => {
    try {
      setBusy(true);
      const { data } = await api.post("/plaid/link-token", {});
      setLinkToken(data.link_token);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not start Plaid Link");
      setBusy(false);
    }
  };

  const onSuccess = useCallback(
    async (publicToken, metadata) => {
      try {
        await api.post("/plaid/exchange", {
          public_token: publicToken,
          institution_name: metadata?.institution?.name || null,
          institution_id: metadata?.institution?.institution_id || null,
        });
        toast.success(`Connected ${metadata?.institution?.name || "your bank"}`);
        setLinkToken(null);
        load();
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Plaid exchange failed");
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const onExit = useCallback(() => {
    setLinkToken(null);
    setBusy(false);
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  // Auto-open the Plaid Link modal once we have a token + the script is ready.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const refresh = async (item) => {
    setRefreshingId(item.id);
    try {
      const { data } = await api.post(`/plaid/items/${item.id}/refresh-statements`);
      const n = data.new_statements || 0;
      if (n === 0) {
        toast.info("No new statements yet — check back after your next billing cycle.");
      } else {
        toast.success(
          `Imported ${n} new statement${n === 1 ? "" : "s"} (${data.pages_downloaded} pages, est. $${data.estimated_billable_usd?.toFixed(2)})`,
        );
        onStatementsImported?.();
      }
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Refresh failed");
    } finally {
      setRefreshingId(null);
    }
  };

  const disconnect = async (item) => {
    if (!window.confirm(`Disconnect ${item.institution_name || "this bank"}?`)) return;
    try {
      await api.delete(`/plaid/items/${item.id}`);
      toast.success("Bank disconnected");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not disconnect");
    }
  };

  if (!config?.configured) return null;

  return (
    <section
      data-testid="plaid-connect"
      className="border border-white/10 rounded-md bg-[#0F0F12] p-5 space-y-4"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-mono uppercase tracking-widest text-zinc-300 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-amber-400" />
            Connected bank &amp; credit card accounts
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Auto-download monthly statements from your bank — AI bookkeeper categorizes everything for you.
            <span className="ml-1 text-zinc-400">
              ${config.price_per_page_usd.toFixed(2)} / page · ${config.price_per_statement_usd.toFixed(2)} / statement.
            </span>
          </p>
        </div>
        <button
          onClick={requestLinkToken}
          disabled={busy}
          data-testid="plaid-connect-btn"
          className="h-10 px-4 rounded-md bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-black font-mono uppercase tracking-widest text-xs flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {busy ? "Opening…" : "Connect bank"}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-zinc-500 italic border border-dashed border-white/10 rounded-md p-4 text-center">
          No banks connected yet. Click "Connect bank" to securely link your accounts via Plaid.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              data-testid={`plaid-item-${item.id}`}
              className="flex items-center justify-between gap-3 bg-[#121214] border border-white/5 rounded-md px-3 py-2.5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Wallet className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-zinc-200 truncate">
                    {item.institution_name || "Connected institution"}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500">
                    Connected {new Date(item.created_at).toLocaleDateString()}
                    {item.last_statements_sync_at &&
                      ` · last sync ${new Date(item.last_statements_sync_at).toLocaleDateString()}`}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => refresh(item)}
                  disabled={refreshingId === item.id}
                  data-testid={`plaid-refresh-${item.id}`}
                  className="h-9 px-3 rounded-md border border-white/10 hover:bg-white/5 text-xs font-mono uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={"w-3.5 h-3.5 " + (refreshingId === item.id ? "animate-spin" : "")} />
                  {refreshingId === item.id ? "Pulling…" : "Refresh"}
                </button>
                <button
                  onClick={() => disconnect(item)}
                  data-testid={`plaid-disconnect-${item.id}`}
                  className="h-9 px-2 rounded-md border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 text-red-400 text-xs"
                  aria-label="Disconnect"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {usage?.current_month && (
        <div
          data-testid="plaid-usage"
          className="border-t border-white/5 pt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-xs"
        >
          <span className="font-mono uppercase tracking-widest text-zinc-500">
            This month ({usage.current_month.month})
          </span>
          <span className="text-zinc-300">
            {usage.current_month.statements_downloaded} statements ·{" "}
            {usage.current_month.pages_downloaded} pages
          </span>
          <span className="text-amber-300 font-medium">
            ${Number(usage.current_month.billable_usd || 0).toFixed(2)} billable
          </span>
        </div>
      )}
    </section>
  );
}
