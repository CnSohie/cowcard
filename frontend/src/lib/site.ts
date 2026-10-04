import { get } from "./api";
import type { SiteSeo } from "./seo";

export interface SiteConfig extends SiteSeo {
  announcement: string;
  contact?: string;
  currency?: string;
  theme?: string;
  mode?: string;
  heroSlides?: string;
  icon?: string;
}

export const DEFAULT_SITE_ICON = "/favicon.svg";

/** 只接受本站上传路径。其它值一律回落到内置图标。 */
export function siteIconUrl(icon?: string | null) {
  const value = icon?.trim() ?? "";
  if (value.startsWith("/files/") && !value.includes("..") && value.length <= 200 && !/\s/.test(value)) return value;
  return DEFAULT_SITE_ICON;
}

const ICON_LINKS = [
  { key: "svg", rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { key: "ico", rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
  { key: "apple", rel: "apple-touch-icon", href: "/apple-touch-icon.png", type: "image/png" },
] as const;

/** 把浏览器标签和主屏幕图标换成当前站点图标。 */
export function applySiteIcon(icon?: string | null) {
  const href = siteIconUrl(icon);
  const custom = href !== DEFAULT_SITE_ICON;
  for (const spec of ICON_LINKS) {
    let el = document.querySelector<HTMLLinkElement>(`link[data-ka-icon="${spec.key}"]`);
    if (!el) {
      el = document.createElement("link");
      el.rel = spec.rel;
      el.dataset.kaIcon = spec.key;
      document.head.appendChild(el);
    }
    el.href = custom ? href : spec.href;
    if (custom) el.removeAttribute("type");
    else el.type = spec.type;
  }
  window.dispatchEvent(new CustomEvent("ka:site-icon", { detail: href }));
}

export function subscribeSiteIcon(listener: (href: string) => void) {
  const onIcon = (event: Event) => listener(siteIconUrl((event as CustomEvent<string>).detail));
  window.addEventListener("ka:site-icon", onIcon);
  return () => window.removeEventListener("ka:site-icon", onIcon);
}

// Only public branding is persisted, for the HTML title and first React render.
const BRANDING_KEY = "ka.site.branding";
export function readSiteBranding(): { siteName: string; seoTitle: string; icon: string } {
  try {
    const value = JSON.parse(localStorage.getItem(BRANDING_KEY) || "null");
    return {
      siteName: typeof value?.siteName === "string" ? value.siteName : "",
      seoTitle: typeof value?.seoTitle === "string" ? value.seoTitle : "",
      icon: typeof value?.icon === "string" ? value.icon : "",
    };
  } catch {
    return { siteName: "", seoTitle: "", icon: "" };
  }
}

function rememberSiteBranding(site: SiteConfig) {
  try {
    localStorage.setItem(BRANDING_KEY, JSON.stringify({
      siteName: site.siteName,
      seoTitle: site.seoTitle,
      icon: siteIconUrl(site.icon) === DEFAULT_SITE_ICON ? "" : site.icon,
    }));
  } catch { /* Storage may be unavailable; loading the site must still work. */ }
}

// Share only public presentation settings; never cache order, stock or payment data.
let pending: Promise<SiteConfig> | undefined;
let cached: SiteConfig | undefined;
let expiresAt = 0;
export function loadSite(): Promise<SiteConfig> {
  if (cached && Date.now() < expiresAt) return Promise.resolve(cached);
  if (!pending) pending = get<SiteConfig>("/store/site").then((site) => {
    rememberSiteBranding(site);
    cached = site;
    expiresAt = Date.now() + 60_000;
    return site;
  }).finally(() => { pending = undefined; });
  return pending;
}

/** Refresh after saving settings, including any request already in flight. */
export async function refreshSite(): Promise<SiteConfig> {
  if (pending) await pending.catch(() => undefined);
  cached = undefined;
  expiresAt = 0;
  return loadSite();
}
