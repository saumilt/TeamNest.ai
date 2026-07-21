import { useMemo, useState } from "react";
import { Search, ChevronDown, LifeBuoy, X } from "lucide-react";
import { HELP_ARTICLES, HELP_CATEGORIES } from "@/data/helpArticles";

/** Searchable in-app Help Center. Filters articles by title/category/keywords/body. */
export default function HelpCenter() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [openId, setOpenId] = useState(null);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    return HELP_ARTICLES.filter((a) => {
      if (cat !== "All" && a.category !== cat) return false;
      if (!term) return true;
      const hay = [
        a.title, a.category, (a.keywords || []).join(" "),
        Array.isArray(a.body) ? a.body.join(" ") : a.body,
      ].join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [q, cat]);

  const cats = ["All", ...HELP_CATEGORIES];

  return (
    <div className="min-h-full bg-bg" data-testid="help-center">
      {/* Header */}
      <div className="border-b border-hairline bg-surface">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
          <div className="flex items-center gap-2 mb-2">
            <LifeBuoy className="w-5 h-5 text-brand" />
            <h1 className="text-2xl font-bold text-ink">Help Center</h1>
          </div>
          <p className="text-[14px] text-ink-dim mb-5">Search every feature and learn how it works.</p>
          <div className="relative">
            <Search className="w-4 h-4 text-ink-mute absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              data-testid="help-search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search help… e.g. credit limits, student plan, @ai, workspace"
              className="w-full h-12 rounded-xl bg-surface-2 ring-1 ring-hairline pl-10 pr-10 text-ink text-[15px] focus:ring-brand outline-none"
            />
            {q && (
              <button onClick={() => setQ("")} data-testid="help-search-clear"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
        {/* Category chips */}
        <div className="flex flex-wrap gap-2 mb-5">
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              data-testid={`help-cat-${c}`}
              onClick={() => setCat(c)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${cat === c ? "bg-brand text-black" : "bg-surface-2 text-ink-dim hover:text-ink"}`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Results */}
        {results.length === 0 ? (
          <div className="text-center py-16 text-ink-mute" data-testid="help-empty">
            <p className="text-[15px]">No articles match “{q}”.</p>
            <p className="text-[13px] mt-1">Try a different keyword or pick a category.</p>
          </div>
        ) : (
          <div className="space-y-2" data-testid="help-results">
            {results.map((a) => {
              const open = openId === a.id;
              return (
                <div key={a.id} className="rounded-xl bg-surface ring-1 ring-hairline overflow-hidden" data-testid={`help-article-${a.id}`}>
                  <button
                    type="button"
                    data-testid={`help-article-toggle-${a.id}`}
                    onClick={() => setOpenId(open ? null : a.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-2 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-ink">{a.title}</div>
                      <div className="text-[11px] text-ink-mute uppercase tracking-wider mt-0.5">{a.category}</div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-ink-mute shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <div className="px-4 pb-4 pt-1 space-y-2" data-testid={`help-article-body-${a.id}`}>
                      {(Array.isArray(a.body) ? a.body : [a.body]).map((p, i) => (
                        <p key={i} className="text-[13.5px] leading-6 text-ink-dim">{p}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
