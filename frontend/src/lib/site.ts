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

// Share only public presentation settings; never cache order, stock or payment data.
let pending: Promise<SiteConfig> | undefined;
let cached: SiteConfig | undefined;
let expiresAt = 0;
export function loadSite(): Promise<SiteConfig> {
  if (cached && Date.now() < expiresAt) return Promise.resolve(cached);
  if (!pending) pending = get<SiteConfig>("/store/site").then((site) => {
    cached = site;
    expiresAt = Date.now() + 60_000;
    return site;
  }).finally(() => { pending = undefined; });
  return pending;
}
