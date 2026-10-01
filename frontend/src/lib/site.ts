import { get } from "./api";
import type { SiteSeo } from "./seo";

export interface SiteConfig extends SiteSeo {
  announcement: string;
  contact?: string;
  currency?: string;
  theme?: string;
  mode?: string;
  heroSlides?: string;
}

// Only public branding is persisted, for the HTML title and first React render.
const BRANDING_KEY = "ka.site.branding";
export function readSiteBranding(): { siteName: string; seoTitle: string } {
  try {
    const value = JSON.parse(localStorage.getItem(BRANDING_KEY) || "null");
    return {
      siteName: typeof value?.siteName === "string" ? value.siteName : "",
      seoTitle: typeof value?.seoTitle === "string" ? value.seoTitle : "",
    };
  } catch {
    return { siteName: "", seoTitle: "" };
  }
}

function rememberSiteBranding(site: SiteConfig) {
  try {
    localStorage.setItem(BRANDING_KEY, JSON.stringify({ siteName: site.siteName, seoTitle: site.seoTitle }));
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
