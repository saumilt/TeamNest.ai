import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Store, DollarSign, Save, Loader2, ExternalLink, Zap, CheckCircle2, TrendingUp } from "lucide-react";

const STATUS_CLS = {
  submitted: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
  approved: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  draft: "bg-surface-3 text-ink-mute ring-hairline",
};

/** /market/mine — seller dashboard: my templates, earnings, payout account. */
export default function MyTemplates() {
  const [data, setData] = useState(null);
  const [account, setAccount] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [connecting, setConnecting] = useState(false);

  const load = () => {
    api.get("/market/mine")
      .then(({ data }) => { setData(data); setAccount(data.earnings?.payout_account || ""); })
      .catch(() => setData({ templates: [], earnings: {} }));
    api.get("/market/payout-account/status")
      .then(({ data }) => setStatus(data))
      .catch(() => {});
  };
  useEffect(load, []);

  const connectStripe = async () => {
    setConnecting(true);
    try {
      const { data } = await api.post("/market/payout-account/onboard", {
        origin_url: window.location.origin,
      });
      if (data.url) { window.location.href = data.url; return; }
      toast.success(data.note || "Payout account connected");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start Stripe onboarding");
    }
    setConnecting(false);
  };

  const savePayout = async () => {
    setSaving(true);
    try {
      await api.post("/market/payout-account", { stripe_account_id: account.trim() });
      toast.success("Payout account saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save");
    }
    setSaving(false);
  };

  if (!data) {
    return <div className="p-10 text-ink-mute flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  }
  const e = data.earnings || {};

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6" data-testid="my-templates-page">
      <div>
        <h1 className="text-[20px] font-semibold text-ink flex items-center gap-2">
          <Store className="w-5 h-5 text-amber-300" /> Sell on the Template Store
        </h1>
        <p className="text-[13px] text-ink-mute mt-1">
          Package any Dev OS project as a template from its <span className="text-amber-200">Release</span> tab.
          TeamNest reviews every submission. You keep <span className="text-amber-200 font-semibold">70%</span> of
          every sale — payouts via Stripe Connect.
        </p>
      </div>

      {/* Earnings */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          ["Total earned", `$${((e.total_cents || 0) / 100).toFixed(2)}`],
          ["Pending payout", `$${((e.pending_cents || 0) / 100).toFixed(2)}`],
          ["Sales", e.sales_count || 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-surface ring-1 ring-hairline p-4">
            <div className="text-[11px] uppercase tracking-wider text-ink-mute">{label}</div>
            <div className="text-[22px] font-semibold text-ink mt-1" data-testid={`earnings-${label.toLowerCase().replace(/\s/g, "-")}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Earnings analytics */}
      {(data.templates || []).length > 0 && (
        <div className="rounded-xl bg-surface ring-1 ring-hairline p-4" data-testid="earnings-analytics">
          <div className="text-[13px] font-semibold text-ink flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-300" /> Earnings analytics
            <span className="text-[11px] font-normal text-ink-mute">last 30 days</span>
          </div>

          {/* Revenue trend — 30 mini bars */}
          {(() => {
            const trend = data.trend || [];
            const max = Math.max(1, ...trend.map((d) => d.cents));
            const period = trend.reduce((s, d) => s + d.cents, 0);
            return (
              <div className="mb-4">
                <div className="flex items-end gap-[3px] h-16" data-testid="earnings-trend">
                  {trend.map((d) => (
                    <div
                      key={d.date}
                      title={`${d.date} · $${(d.cents / 100).toFixed(2)}`}
                      className={`flex-1 rounded-t-sm ${d.cents > 0 ? "bg-emerald-400/70 hover:bg-emerald-300" : "bg-surface-3"}`}
                      style={{ height: `${d.cents > 0 ? Math.max(8, (d.cents / max) * 100) : 4}%` }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-ink-mute mt-1.5">
                  <span>{trend[0]?.date?.slice(5)}</span>
                  <span className="text-emerald-300 font-semibold">${(period / 100).toFixed(2)} this period</span>
                  <span>{trend[trend.length - 1]?.date?.slice(5)}</span>
                </div>
              </div>
            );
          })()}

          {/* Per-template performance */}
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" data-testid="template-performance-table">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-ink-mute border-b border-hairline">
                  <th className="py-1.5 pr-2 font-medium">Template</th>
                  <th className="py-1.5 px-2 font-medium text-right">Views</th>
                  <th className="py-1.5 px-2 font-medium text-right">Installs</th>
                  <th className="py-1.5 px-2 font-medium text-right">Conv.</th>
                  <th className="py-1.5 px-2 font-medium text-right">Sales</th>
                  <th className="py-1.5 pl-2 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {data.templates.map((t) => (
                  <tr key={t.id} data-testid={`perf-row-${t.id}`}>
                    <td className="py-2 pr-2 text-ink font-medium truncate max-w-[180px]">{t.name}</td>
                    <td className="py-2 px-2 text-right text-ink-dim">{t.views || 0}</td>
                    <td className="py-2 px-2 text-right text-ink-dim">{t.installs || 0}</td>
                    <td className="py-2 px-2 text-right text-ink-dim">
                      {t.conversion_pct != null ? `${t.conversion_pct}%` : "—"}
                    </td>
                    <td className="py-2 px-2 text-right text-ink-dim">{t.sales || 0}</td>
                    <td className="py-2 pl-2 text-right font-semibold text-emerald-300">
                      ${((t.revenue_cents || 0) / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payout account */}
      <div className="rounded-xl bg-surface ring-1 ring-hairline p-4">
        <div className="text-[13px] font-semibold text-ink flex items-center gap-2 mb-1">
          <DollarSign className="w-4 h-4 text-ink-mute" /> Stripe Connect payout account
          {status?.connected && (
            <span
              data-testid="payout-status-badge"
              className={`ml-1 inline-flex items-center gap-1 h-5 px-2 rounded-full ring-1 text-[10.5px] font-semibold ${
                status.payouts_enabled
                  ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                  : "bg-amber-400/15 text-amber-300 ring-amber-400/30"}`}
            >
              <CheckCircle2 className="w-3 h-3" />
              {status.simulated ? "Connected · test mode" : status.payouts_enabled ? "Payouts enabled" : "Onboarding incomplete"}
            </span>
          )}
        </div>
        <p className="text-[12px] text-ink-mute mb-3">
          Your 70% share is transferred there on each payout run. Connect with Stripe
          in one tap, or paste an existing account ID (starts with <code className="text-amber-300">acct_</code>).
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={connectStripe}
            disabled={connecting}
            data-testid="payout-connect-stripe"
            className="h-9 px-4 rounded-pill bg-[#635bff] hover:bg-[#7a73ff] text-white font-semibold text-[12px] inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {status?.connected ? "Reconnect with Stripe" : "Connect with Stripe"}
          </button>
          <input
            type="text"
            value={account}
            onChange={(ev) => setAccount(ev.target.value)}
            placeholder="acct_1ABC…"
            data-testid="payout-account-input"
            className="flex-1 min-w-[180px] h-9 px-3 rounded-lg bg-surface-2 ring-1 ring-hairline text-[12px] font-mono text-ink outline-none focus:ring-amber-400/40 placeholder:text-ink-mute"
          />
          <button
            type="button"
            onClick={savePayout}
            disabled={saving || !account.trim().startsWith("acct_")}
            data-testid="payout-account-save"
            className="h-9 px-4 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[12px] inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" /> Save
          </button>
        </div>
      </div>

      {/* My templates */}
      <div className="rounded-xl bg-surface ring-1 ring-hairline p-4">
        <div className="text-[13px] font-semibold text-ink mb-3">My templates</div>
        {(data.templates || []).length === 0 ? (
          <p className="text-[12px] text-ink-mute">
            None yet. Open any project's <Link to="/dev-os" className="text-amber-300">Build Room</Link> →
            Release tab → <span className="text-amber-200">Sell as template</span>.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {data.templates.map((t) => (
              <li key={t.id} className="py-3 flex items-center gap-3" data-testid={`my-template-${t.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink truncate">{t.name}</div>
                  <div className="text-[11px] text-ink-mute truncate">
                    {t.pricing?.model === "free" ? "Free" : t.pricing?.model === "monthly" ? `$${t.pricing.price_usd}/mo` : `$${t.pricing?.price_usd} one-time`}
                    {" · "}{t.installs || 0} installs
                    {t.review_notes ? ` · Review: ${t.review_notes}` : ""}
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 capitalize ${STATUS_CLS[t.status] || STATUS_CLS.draft}`}>
                  {t.status}
                </span>
                <a
                  href={`${process.env.REACT_APP_BACKEND_URL}/api/market/templates/${t.id}/demo/index.html`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-ink-mute hover:text-ink p-1.5"
                  title="Live demo"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
