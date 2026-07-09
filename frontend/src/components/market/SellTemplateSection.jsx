import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Store, Send } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

const FALLBACK_CATEGORIES = [
  { slug: "saas", label: "SaaS" }, { slug: "crm", label: "CRM" },
  { slug: "finance", label: "Finance" }, { slug: "internal", label: "Internal Tools" },
  { slug: "marketplace", label: "Marketplace" }, { slug: "community", label: "Community" },
  { slug: "healthcare", label: "Healthcare" }, { slug: "ai", label: "AI" },
  { slug: "other", label: "Other" },
];

/** "Sell as template" section for the Release tab. */
export default function SellTemplateSection({ project }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [form, setForm] = useState({
    name: project.name || "",
    tagline: "",
    description: "",
    category: "saas",
    pricing_model: "free",
    price_usd: "",
  });

  useEffect(() => {
    api.get("/market/categories")
      .then(({ data }) => {
        if (data.categories?.length) setCategories(data.categories);
      })
      .catch(() => { /* keep fallback */ });
  }, []);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const needsPrice = form.pricing_model !== "free";
  const ready = form.name.trim() && form.tagline.trim() &&
    (!needsPrice || (Number(form.price_usd) > 0));

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.post("/market/templates", {
        project_id: project.id,
        name: form.name.trim(),
        tagline: form.tagline.trim(),
        description: form.description.trim(),
        category: form.category,
        pricing_model: form.pricing_model,
        price_usd: needsPrice ? Number(form.price_usd) : 0,
      });
      toast.success("Submitted for review — we'll notify you once it's approved");
      setSubmitted(true);
      setOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Submission failed");
    }
    setSubmitting(false);
  };

  return (
    <section className="rounded-xl bg-surface-2 ring-1 ring-hairline p-4">
      <div className="inline-flex items-center gap-2 mb-1">
        <Store className="w-4 h-4 text-ink-mute" />
        <div className="text-[13px] font-semibold text-ink">Sell as template</div>
      </div>
      <p className="text-[12px] text-ink-mute mb-3">
        Publish this app on the <Link to="/templates" className="text-amber-300 hover:text-amber-200">Template Store</Link> —
        free, one-time, or monthly price. TeamNest reviews every submission and keeps 30%;
        you keep <span className="text-amber-200 font-semibold">70%</span>. Track sales in{" "}
        <Link to="/market/mine" className="text-amber-300 hover:text-amber-200">My templates</Link>.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={submitted}
        data-testid="sell-template-btn"
        className="h-9 px-4 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[12px] inline-flex items-center gap-1.5 disabled:opacity-40"
      >
        <Store className="w-3.5 h-3.5" /> {submitted ? "Submitted for review" : "Sell this app"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md bg-surface border-hairline" data-testid="sell-template-dialog">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Submit to the Template Store</DialogTitle>
            <DialogDescription className="text-[12px]">
              A snapshot of the current code is packaged. TeamNest reviews before it goes live.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Template name">
              <input type="text" value={form.name} onChange={(e) => set("name")(e.target.value)}
                data-testid="sell-name" className={inputCls} />
            </Field>
            <Field label="One-line tagline">
              <input type="text" value={form.tagline} onChange={(e) => set("tagline")(e.target.value)}
                placeholder="e.g. Ticket queue with SLA badges and canned replies"
                data-testid="sell-tagline" className={inputCls} />
            </Field>
            <Field label="Description (optional)">
              <textarea rows={3} value={form.description} onChange={(e) => set("description")(e.target.value)}
                data-testid="sell-description" className={`${inputCls} h-auto py-2`} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select value={form.category} onChange={(e) => set("category")(e.target.value)}
                  data-testid="sell-category" className={inputCls}>
                  {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Pricing">
                <select value={form.pricing_model} onChange={(e) => set("pricing_model")(e.target.value)}
                  data-testid="sell-pricing-model" className={inputCls}>
                  <option value="free">Free</option>
                  <option value="one_time">One-time price</option>
                  <option value="monthly">Monthly subscription</option>
                </select>
              </Field>
            </div>
            {needsPrice && (
              <Field label={form.pricing_model === "monthly" ? "Price per month (USD)" : "One-time price (USD)"}>
                <input type="number" min="1" step="1" value={form.price_usd}
                  onChange={(e) => set("price_usd")(e.target.value)}
                  placeholder="e.g. 49" data-testid="sell-price" className={inputCls} />
              </Field>
            )}
            {needsPrice && Number(form.price_usd) > 0 && (
              <p className="text-[11px] text-ink-mute">
                You earn <span className="text-emerald-300 font-semibold">${(Number(form.price_usd) * 0.7).toFixed(2)}</span>
                {form.pricing_model === "monthly" ? "/mo" : ""} per sale (70%) — TeamNest keeps 30%.
              </p>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!ready || submitting}
              data-testid="sell-submit-btn"
              className="w-full h-10 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[13px] inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" /> {submitting ? "Submitting…" : "Submit for review"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

const inputCls = "w-full h-9 px-3 rounded-lg bg-surface-2 ring-1 ring-hairline text-[13px] text-ink outline-none focus:ring-amber-400/40 placeholder:text-ink-mute";

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider font-semibold text-ink-mute mb-1">{label}</label>
      {children}
    </div>
  );
}
