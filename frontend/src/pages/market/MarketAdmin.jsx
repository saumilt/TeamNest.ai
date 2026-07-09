import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ShieldCheck, Check, X, ExternalLink, Loader2 } from "lucide-react";

/** /market/review — platform-admin review queue for submitted templates. */
export default function MarketAdmin() {
  const [queue, setQueue] = useState(null);
  const [busy, setBusy] = useState(null);
  const [margin, setMargin] = useState(null);
  const [savingMargin, setSavingMargin] = useState(false);
  const [promo, setPromo] = useState(null);
  const [packs, setPacks] = useState(null);
  const [savingPromo, setSavingPromo] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [approved, setApproved] = useState(null);
  const [cats, setCats] = useState(null);
  const [newCat, setNewCat] = useState("");

  const load = () => {
    api.get("/market/admin/queue")
      .then(({ data }) => setQueue(data.templates || []))
      .catch((e) => {
        if (e?.response?.status === 403) setQueue("forbidden");
        else setQueue([]);
      });
    api.get("/market/admin/templates")
      .then(({ data }) => setApproved(data.templates || []))
      .catch(() => setApproved([]));
    api.get("/market/admin/categories")
      .then(({ data }) => setCats(data.categories || []))
      .catch(() => setCats([]));
    api.get("/admin/billing-settings")
      .then(({ data }) => {
        setMargin(Math.round((data.credit_margin_pct ?? 0.4) * 100));
        setPromo(data.credit_promo || { enabled: true, splash_title: "", banner: "", badge: "" });
        setPacks(data.credit_packs || []);
      })
      .catch(() => setMargin(null));
  };
  useEffect(load, []);

  const toggleFeatured = async (t) => {
    try {
      await api.post(`/market/admin/templates/${t.id}/feature`, { featured: !t.featured });
      setApproved((list) => list.map((x) => (x.id === t.id ? { ...x, featured: !x.featured } : x)));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update featured");
    }
  };

  const addCategory = async () => {
    const label = newCat.trim();
    if (!label) return;
    try {
      const { data } = await api.post("/market/admin/categories", { label });
      setCats((list) => [...(list || []), data]);
      setNewCat("");
      toast.success(`Category "${data.label}" added`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not add category");
    }
  };

  const renameCategory = async (c, label) => {
    if (!label.trim() || label === c.label) return;
    try {
      await api.patch(`/market/admin/categories/${c.id}`, { label: label.trim() });
      setCats((list) => list.map((x) => (x.id === c.id ? { ...x, label: label.trim() } : x)));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Rename failed");
    }
  };

  const toggleCategoryActive = async (c) => {
    try {
      await api.patch(`/market/admin/categories/${c.id}`, { active: !c.active });
      setCats((list) => list.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    }
  };

  const deleteCategory = async (c) => {
    if (!window.confirm(`Delete category "${c.label}"?`)) return;
    try {
      await api.delete(`/market/admin/categories/${c.id}`);
      setCats((list) => list.filter((x) => x.id !== c.id));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };


  const savePromo = async () => {
    setSavingPromo(true);
    try {
      await api.patch("/admin/billing-settings", {
        credit_promo: promo,
        credit_packs: packs.map((p) => ({
          ...p, credits: Number(p.credits) || 0,
          price_usd: Number(p.price_usd) || 0, bonus_pct: Number(p.bonus_pct) || 0,
        })),
      });
      toast.success("Credit specials saved — splash updates on next login");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save specials");
    }
    setSavingPromo(false);
  };

  const runPayout = async () => {
    setPayoutBusy(true);
    try {
      const { data } = await api.post("/market/admin/payout-run");
      const failed = data.results.filter((r) => r.status === "failed").length;
      const skipped = data.results.filter((r) => r.status === "skipped").length;
      toast[data.paid > 0 ? "success" : "info"](
        `Payout run: ${data.paid} paid · ${failed} failed · ${skipped} skipped (of ${data.sellers} sellers)`,
      );
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Payout run failed");
    }
    setPayoutBusy(false);
  };

  const saveMargin = async () => {
    setSavingMargin(true);
    try {
      await api.patch("/admin/billing-settings", { credit_margin_pct: Number(margin) / 100 });
      toast.success(`AI credit margin set to ${margin}% — pricing page updates immediately`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save margin");
    }
    setSavingMargin(false);
  };

  const decide = async (id, action) => {
    let notes = "";
    if (action === "reject") {
      notes = prompt("Reason for rejection (shown to the creator):") || "";
      if (!notes.trim()) return;
    }
    setBusy(id);
    try {
      await api.post(`/market/admin/templates/${id}/${action}`, { notes });
      toast.success(action === "approve" ? "Template approved — it's live in the store" : "Template rejected");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    }
    setBusy(null);
  };

  if (queue === "forbidden") {
    return (
      <div className="p-10 text-center text-[13px] text-ink-mute" data-testid="market-admin-forbidden">
        Only the TeamNest platform admin can review templates.
      </div>
    );
  }
  if (queue === null) {
    return <div className="p-10 text-ink-mute flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5" data-testid="market-admin-page">
      <div>
        <h1 className="text-[20px] font-semibold text-ink flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-amber-300" /> Template review queue
        </h1>
        <p className="text-[13px] text-ink-mute mt-1">
          Approve to publish on the public store. TeamNest keeps 30% of every sale.
        </p>
      </div>

      {margin !== null && (
        <div className="rounded-xl bg-surface ring-1 ring-hairline p-4" data-testid="margin-settings-card">
          <div className="text-[13px] font-semibold text-ink mb-1">Platform setting · AI credit margin</div>
          <p className="text-[12px] text-ink-mute mb-3">
            AI usage is billed to customers at provider cost + this margin. Shown live on the Pricing page.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number" min="0" max="200" step="1"
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              data-testid="margin-input"
              className="w-24 h-9 px-3 rounded-lg bg-surface-2 ring-1 ring-hairline text-[13px] font-mono text-ink outline-none focus:ring-amber-400/40"
            />
            <span className="text-[13px] text-ink-dim">%</span>
            <button
              type="button"
              onClick={saveMargin}
              disabled={savingMargin || margin === "" || Number(margin) < 0}
              data-testid="margin-save"
              className="h-9 px-4 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[12px] disabled:opacity-40"
            >
              {savingMargin ? "Saving…" : "Save margin"}
            </button>
          </div>
        </div>
      )}

      {promo !== null && packs !== null && (
        <div className="rounded-xl bg-surface ring-1 ring-hairline p-4" data-testid="credit-specials-card">
          <div className="text-[13px] font-semibold text-ink mb-1">Platform setting · Credit specials & splash</div>
          <p className="text-[12px] text-ink-mute mb-3">
            Shown as a login popup to every user (dismissable per session). Configure packs, bonuses and the promo banner.
          </p>
          <div className="flex items-center gap-2 mb-2">
            <button type="button" data-testid="promo-enabled-toggle"
              onClick={() => setPromo({ ...promo, enabled: !promo.enabled })}
              className={`h-7 px-3 rounded-full text-[11px] font-semibold ring-1 ${
                promo.enabled ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" : "bg-surface-2 text-ink-mute ring-hairline"}`}>
              {promo.enabled ? "Splash ON" : "Splash OFF"}
            </button>
            <input type="text" value={promo.splash_title || ""} placeholder="Splash title"
              onChange={(e) => setPromo({ ...promo, splash_title: e.target.value })}
              data-testid="promo-title-input"
              className="flex-1 h-8 px-3 rounded-lg bg-surface-2 ring-1 ring-hairline text-[12px] text-ink outline-none" />
          </div>
          <input type="text" value={promo.banner || ""} placeholder="Banner — e.g. Big packs come with 20% bonus credits"
            onChange={(e) => setPromo({ ...promo, banner: e.target.value })}
            data-testid="promo-banner-input"
            className="w-full h-8 px-3 rounded-lg bg-surface-2 ring-1 ring-hairline text-[12px] text-ink outline-none mb-3" />
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[12px] text-ink-mute">Auto-show splash when balance drops below</span>
            <input type="number" min="0" max="1000" value={promo.low_balance_threshold ?? 50}
              onChange={(e) => setPromo({ ...promo, low_balance_threshold: Number(e.target.value) })}
              data-testid="promo-threshold-input"
              className="w-20 h-8 px-2 rounded-lg bg-surface-2 ring-1 ring-hairline text-[12px] font-mono text-ink outline-none" />
            <span className="text-[12px] text-ink-mute">credits (0 = off)</span>
          </div>
          <div className="space-y-1.5 mb-3">
            <div className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 text-[10px] uppercase tracking-wider text-ink-mute px-1">
              <span>Credits</span><span>Price $</span><span>Bonus %</span><span />
            </div>
            {packs.map((p, i) => (
              <div key={p.id || i} className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2">
                {["credits", "price_usd", "bonus_pct"].map((f) => (
                  <input key={f} type="number" value={p[f]}
                    onChange={(e) => setPacks(packs.map((x, y) => (y === i ? { ...x, [f]: e.target.value } : x)))}
                    data-testid={`pack-${f}-${i}`}
                    className="h-8 px-2 rounded-lg bg-surface-2 ring-1 ring-hairline text-[12px] font-mono text-ink outline-none" />
                ))}
                <button type="button" data-testid={`pack-remove-${i}`}
                  onClick={() => setPacks(packs.filter((_, y) => y !== i))}
                  className="text-ink-mute hover:text-rose-300 text-[14px]">×</button>
              </div>
            ))}
            <button type="button" data-testid="pack-add"
              onClick={() => setPacks([...packs, { id: `p${Date.now()}`, credits: 100, price_usd: 20, bonus_pct: 0 }])}
              className="text-[11px] text-amber-200 hover:text-amber-100">+ Add pack</button>
          </div>
          <button type="button" onClick={savePromo} disabled={savingPromo}
            data-testid="promo-save"
            className="h-9 px-4 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[12px] disabled:opacity-40">
            {savingPromo ? "Saving…" : "Save credit specials"}
          </button>
        </div>
      )}

      <div className="rounded-xl bg-surface ring-1 ring-hairline p-4" data-testid="payout-run-card">
        <div className="text-[13px] font-semibold text-ink mb-1">Seller payouts · Stripe Connect</div>
        <p className="text-[12px] text-ink-mute mb-3">
          Transfers all pending seller earnings (70% share) to their Stripe Connect accounts.
          Sellers without an account are skipped; failed transfers stay pending.
        </p>
        <button type="button" onClick={runPayout} disabled={payoutBusy}
          data-testid="payout-run-btn"
          className="h-9 px-4 rounded-pill bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-500/30 font-semibold text-[12px] disabled:opacity-40">
          {payoutBusy ? "Running…" : "Run payout now"}
        </button>
      </div>

      {cats !== null && (
        <div className="rounded-xl bg-surface ring-1 ring-hairline p-4" data-testid="categories-card">
          <div className="text-[13px] font-semibold text-ink mb-1">Marketplace categories</div>
          <p className="text-[12px] text-ink-mute mb-3">
            Sellers pick from these when submitting. Deactivate to hide from filters without deleting.
          </p>
          <div className="flex gap-2 mb-3">
            <input type="text" value={newCat} placeholder="New category name"
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              data-testid="category-new-input"
              className="flex-1 h-9 px-3 rounded-lg bg-surface-2 ring-1 ring-hairline text-[13px] text-ink outline-none focus:ring-amber-400/40" />
            <button type="button" onClick={addCategory} disabled={!newCat.trim()}
              data-testid="category-add-btn"
              className="h-9 px-4 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[12px] disabled:opacity-40">
              Add
            </button>
          </div>
          <div className="space-y-1.5">
            {cats.map((c) => (
              <div key={c.id} className="flex items-center gap-2" data-testid={`category-row-${c.slug}`}>
                <input type="text" defaultValue={c.label}
                  onBlur={(e) => renameCategory(c, e.target.value)}
                  data-testid={`category-label-${c.slug}`}
                  className="flex-1 h-8 px-3 rounded-lg bg-surface-2 ring-1 ring-hairline text-[12px] text-ink outline-none focus:ring-amber-400/40" />
                <span className="text-[10px] font-mono text-ink-mute w-24 truncate">{c.slug}</span>
                <button type="button" onClick={() => toggleCategoryActive(c)}
                  data-testid={`category-toggle-${c.slug}`}
                  className={`h-7 px-3 rounded-full text-[11px] font-semibold ring-1 ${
                    c.active ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" : "bg-surface-2 text-ink-mute ring-hairline"}`}>
                  {c.active ? "Active" : "Hidden"}
                </button>
                <button type="button" onClick={() => deleteCategory(c)}
                  data-testid={`category-delete-${c.slug}`}
                  className="text-ink-mute hover:text-rose-300 text-[16px] leading-none px-1">×</button>
              </div>
            ))}
            {cats.length === 0 && <div className="text-[12px] text-ink-mute">No categories yet.</div>}
          </div>
        </div>
      )}

      {approved !== null && approved.length > 0 && (
        <div className="rounded-xl bg-surface ring-1 ring-hairline p-4" data-testid="featured-card">
          <div className="text-[13px] font-semibold text-ink mb-1">Featured templates</div>
          <p className="text-[12px] text-ink-mute mb-3">
            Featured templates appear in a highlighted row at the top of the public marketplace.
          </p>
          <div className="space-y-1.5">
            {approved.map((t) => (
              <div key={t.id} className="flex items-center gap-3" data-testid={`featured-row-${t.id}`}>
                <div className="min-w-0 flex-1">
                  <span className="text-[13px] text-ink">{t.name}</span>
                  <span className="text-[11px] text-ink-mute ml-2">{t.category || "uncategorised"} · {t.installs} installs</span>
                </div>
                <button type="button" onClick={() => toggleFeatured(t)}
                  data-testid={`featured-toggle-${t.id}`}
                  className={`h-7 px-3 rounded-full text-[11px] font-semibold ring-1 shrink-0 ${
                    t.featured ? "bg-amber-400/20 text-amber-300 ring-amber-400/40" : "bg-surface-2 text-ink-mute ring-hairline hover:text-ink"}`}>
                  {t.featured ? "★ Featured" : "Feature"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {queue.length === 0 ? (
        <div className="rounded-xl bg-surface ring-1 ring-hairline p-8 text-center text-[13px] text-ink-mute">
          Queue is clear — nothing waiting for review. 🎉
        </div>
      ) : (
        queue.map((t) => (
          <div key={t.id} className="rounded-xl bg-surface ring-1 ring-hairline p-4" data-testid={`review-item-${t.id}`}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-ink">{t.name}</div>
                <div className="text-[12px] text-ink-mute">{t.tagline}</div>
                <div className="text-[11px] text-ink-mute mt-1">
                  by {t.creator_name} · {t.category || "uncategorised"} ·{" "}
                  {t.pricing?.model === "free" ? "Free" : t.pricing?.model === "monthly" ? `$${t.pricing.price_usd}/mo` : `$${t.pricing?.price_usd} one-time`}
                  {" · "}{t.files_count} files
                </div>
                {t.description && <p className="text-[12px] text-ink-dim mt-2 line-clamp-3">{t.description}</p>}
              </div>
              <a
                href={`${process.env.REACT_APP_BACKEND_URL}/api/market/templates/${t.id}/demo/index.html`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-surface-2 hover:bg-surface-3 text-ink text-[12px] shrink-0"
              >
                Demo <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => decide(t.id, "approve")}
                disabled={busy === t.id}
                data-testid={`review-approve-${t.id}`}
                className="h-9 px-4 rounded-pill bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-500/30 font-semibold text-[12px] inline-flex items-center gap-1.5 disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5" /> Approve & publish
              </button>
              <button
                type="button"
                onClick={() => decide(t.id, "reject")}
                disabled={busy === t.id}
                data-testid={`review-reject-${t.id}`}
                className="h-9 px-4 rounded-pill bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/30 font-semibold text-[12px] inline-flex items-center gap-1.5 disabled:opacity-40"
              >
                <X className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
