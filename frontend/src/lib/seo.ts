import { useEffect } from "react";
import { loadSite } from "./site";

export interface SiteSeo {
  siteName: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  seoOgImage: string;
  seoIndex: string;
}

export const loadSiteSeo = loadSite;

export function useSeo(input?: {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string | null;
  type?: "website" | "article";
  canonical?: string;
}) {
  useEffect(() => {
    let alive = true;
    loadSiteSeo().then((site) => {
      if (!alive) return;
      const title = input?.title
        ? `${input.title} · ${site.siteName || site.seoTitle || "商城"}`
        : (site.seoTitle || site.siteName || "商城");
      const description = input?.description || site.seoDescription || "自动发卡 · 数字商品秒级到账";
      const keywords = input?.keywords || site.seoKeywords || "";
      const image = input?.image || site.seoOgImage || "";
      const canonical = input?.canonical || window.location.href.split("#")[0];
      const robots = site.seoIndex === "0" ? "noindex,nofollow" : "index,follow";

      document.title = title;
      meta("description", description);
      meta("keywords", keywords);
      meta("robots", robots);
      link("canonical", canonical);
      prop("og:title", title);
      prop("og:description", description);
      prop("og:type", input?.type ?? "website");
      prop("og:url", canonical);
      if (image) prop("og:image", absolutize(image));
      meta("twitter:card", image ? "summary_large_image" : "summary");
      meta("twitter:title", title);
      meta("twitter:description", description);
      if (image) meta("twitter:image", absolutize(image));
    }).catch(() => void 0);
    return () => { alive = false; };
  }, [input?.title, input?.description, input?.keywords, input?.image, input?.type, input?.canonical]);
}

function meta(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

function prop(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.content = content;
}

function link(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function absolutize(url: string) {
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}
