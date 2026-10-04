import StoreAvailability, { StoreLoadingCard } from "./StoreAvailability";
import { Suspense, useEffect, useLayoutEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Languages, Moon, Newspaper, Search, ShoppingBag, Sun, TicketCheck, UserRound, ArrowUpRight, ArrowUp } from "lucide-react";
import { loadSite, readSiteBranding } from "../lib/site";
import SiteMark from "./SiteMark";
import { isMemberLoggedIn, memberInfo } from "../lib/memberApi";
import { applySiteTheme, isDark, toggleMode } from "../lib/theme";
import { setCurrency } from "../lib/currency";
import { useI18n } from "../lib/i18n";

export default function StoreLayout() {
  const [site, setSite] = useState<{ siteName: string; announcement: string; contact?: string; currency?: string }>(() => ({
    siteName: readSiteBranding().siteName,
    announcement: "",
  }));
  const [dark, setDark] = useState(isDark());
  const location = useLocation();
  const { lang, setLang, copy } = useI18n();
  const member = isMemberLoggedIn() ? memberInfo() : null;

  useLayoutEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);
  const BASE_NAV = [
    { to: "/", label: copy.nav.store, icon: ShoppingBag },
    { to: "/posts", label: copy.nav.posts, icon: Newspaper },
    { to: "/order", label: copy.nav.order, icon: Search },
    { to: "/redeem", label: copy.nav.redeem, icon: TicketCheck },
  ];
  const nav = member ? [...BASE_NAV, { to: "/me?tab=support", label: copy.nav.support, icon: UserRound }] : BASE_NAV;

  useEffect(() => {
    loadSite()
      .then((r) => {
        setSite(r);
        setCurrency(r.currency);
        applySiteTheme(r.theme, r.mode);
        setDark(isDark());
      })
      .catch(() => void 0);
  }, []);

  const active = (to: string) => {
    const [path, query] = to.split("?");
    if (query) return location.pathname === path && location.search === `?${query}`;
    return path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);
  };

  return (
    <div className="storefront min-h-screen">
      <header className="sticky top-0 z-40 border-b border-ink/[0.06] bg-surface/95">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <SiteMark alt={site.siteName || "Ka"} className="h-9 w-9 rounded-2xl object-cover" />
            <span className="hidden text-lg font-extrabold tracking-tight min-[400px]:block">{site.siteName}</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex lg:gap-2">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                aria-current={active(n.to) ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition sm:px-4 ${
                  active(n.to) ? "bg-ink/[0.06] text-ink" : "text-ink/60 hover:text-ink"
                }`}
              >
                <n.icon size={16} strokeWidth={1.7} />{n.label}
              </Link>
            ))}
            <LanguageButton lang={lang} label={copy.nav.language} onToggle={() => setLang(lang === "zh" ? "en" : "zh")} />
            <button
              onClick={() => setDark(toggleMode())}
              className="grid h-9 w-9 place-items-center rounded-full border border-ink/10 text-ink/60 transition hover:text-ink"
              title={copy.nav.toggleMode}
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            {member ? (
              <Link
                to="/me"
                className="flex items-center gap-2 rounded-full border border-ink/10 py-1.5 pl-1.5 pr-2 transition hover:border-primary/40 sm:pr-3.5"
                title={copy.nav.memberCenter}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-extrabold text-primary-contrast">
                  {(member.nickname || member.email).slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-[88px] truncate text-xs font-semibold sm:block">
                  {member.nickname || member.email.split("@")[0]}
                </span>
              </Link>
            ) : (
              <Link to="/login" className="btn-primary !px-4 !py-2 text-sm sm:!px-5">
                {copy.nav.login}
              </Link>
            )}
          </nav>
          <div className="flex min-w-0 items-center gap-1.5 md:hidden">
            <LanguageButton lang={lang} label={copy.nav.language} onToggle={() => setLang(lang === "zh" ? "en" : "zh")} />
            <button onClick={() => setDark(toggleMode())}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink/10 text-ink/60"
              title={copy.nav.toggleMode} aria-label={copy.nav.toggleMode}>
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <Link to={member ? "/me" : "/login"}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-contrast"
              title={member ? copy.nav.memberCenter : copy.nav.login} aria-label={member ? copy.nav.memberCenter : copy.nav.login}>
              {member ? <span className="text-xs font-extrabold">{(member.nickname || member.email).slice(0, 1).toUpperCase()}</span> : <UserRound size={15} />}
            </Link>
          </div>
        </div>
        {site.announcement && (
          <div className="bg-accent-soft px-4 py-2 text-center text-xs font-medium text-ink/80">
            {site.announcement}
          </div>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8 md:pb-20">
        <StoreAvailability>
          <Suspense fallback={<StoreLoadingCard label={copy.common.loading} />}>
            <Outlet />
          </Suspense>
        </StoreAvailability>
      </main>
      <footer className="store-footer border-t border-ink/10 bg-surface">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-10 py-12 sm:grid-cols-[2fr_1fr_1fr] sm:py-16">
            <div>
              <Link to="/" className="text-2xl font-bold tracking-tight">{site.siteName}</Link>
              <p className="mt-4 max-w-sm text-sm leading-7 text-ink/55">{lang === "zh" ? "选购数字商品，查看订单与交付记录。" : "Digital goods, order tracking and delivery records."}</p>
              <Link to="/order" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary">{copy.nav.order}<ArrowUpRight size={15} /></Link>
            </div>
            <div>
              <h2 className="mb-4 text-sm font-semibold">{lang === "zh" ? "逛逛商店" : "Explore"}</h2>
              <div className="flex flex-col items-start gap-3 text-sm text-ink/60">
                <Link to="/">{copy.nav.store}</Link><Link to="/posts">{copy.nav.posts}</Link><Link to="/redeem">{copy.nav.redeem}</Link>
              </div>
            </div>
            <div>
              <h2 className="mb-4 text-sm font-semibold">{lang === "zh" ? "服务与帮助" : "Information"}</h2>
              <div className="flex flex-col items-start gap-3 text-sm text-ink/60">
                <Link to="/about">{copy.footer.about}</Link><Link to="/tos">{copy.footer.tos}</Link>
                {site.contact && <p className="max-w-full break-words leading-6">{copy.footer.support}{site.contact}</p>}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-ink/10 py-6 text-xs text-ink/45">
            <p>© {new Date().getFullYear()} {site.siteName}</p>
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })} className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-3 py-2 hover:text-ink">{lang === "zh" ? "返回顶部" : "Back to top"}<ArrowUp size={14} /></button>
          </div>
        </div>
      </footer>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-ink/[0.08] bg-surface/95 px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-10px_30px_rgb(var(--c-ink)/0.06)] backdrop-blur-xl md:hidden">
        {BASE_NAV.map((n) => (
          <Link key={n.to} to={n.to}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold ${active(n.to) ? "text-primary" : "text-ink/45"}`}>
            <n.icon size={18} strokeWidth={active(n.to) ? 2.5 : 2} />
            <span className="max-w-full truncate">{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function LanguageButton({ lang, label, onToggle }: { lang: "zh" | "en"; label: string; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-ink/10 bg-surface px-2.5 text-xs font-bold text-ink/60 transition hover:border-primary/35 hover:text-ink"
      title={label} aria-label={label}>
      <Languages size={14} />
      <span className="min-w-5 text-center">{lang === "zh" ? "EN" : "中"}</span>
    </button>
  );
}
