import { useEffect } from "react";

/** Sets per-page <title>, meta description, OG image, Twitter card. */
export default function SeoHelmet({ title, description, ogImage = "/og/default.png", path = "/" }) {
  useEffect(() => {
    if (title) document.title = title;
    const upsert = (selector, attrs) => {
      let el = document.head.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        document.head.appendChild(el);
        return;
      }
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    };

    if (description) {
      upsert('meta[name="description"]', { name: "description", content: description });
      upsert('meta[property="og:description"]', { property: "og:description", content: description });
      upsert('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    }
    if (title) {
      upsert('meta[property="og:title"]', { property: "og:title", content: title });
      upsert('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    }
    upsert('meta[property="og:image"]', { property: "og:image", content: ogImage });
    upsert('meta[name="twitter:image"]', { name: "twitter:image", content: ogImage });
    upsert('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsert('meta[property="og:type"]', { property: "og:type", content: "website" });
    upsert('meta[property="og:url"]', { property: "og:url", content: `https://teamnest.ai${path}` });
  }, [title, description, ogImage, path]);

  return null;
}
