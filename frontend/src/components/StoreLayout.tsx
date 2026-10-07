import StoreAvailability, { StoreLoadingCard } from "./StoreAvailability";
import { Suspense, useEffect, useLayoutEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Languages, Moon, MoreHorizontal, Newspaper, Search, ShoppingBag, Sun, TicketCheck, UserRound, ArrowUpRight, ArrowUp } from "lucide-react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { lang, setLang, copy } = useI18n();
  const member = isMemberLoggedIn() ? memberInfo() : null;

  useLayoutEffect(() => {
    setMenuOpen(false);
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

  // 移动端入口面板:锁背景滚动 + Esc 关闭;横屏/放大到桌面断点时释放滚动锁。
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    const desktop = window.matchMedia("(min-width: 768px)");
    const onResize = () => { if (desktop.matches) setMenuOpen(false); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onResize);
    onResize();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onResize);
    };
  }, [menuOpen]);

  const active = (to: string) => {
    const [path, query] = to.split("?");
    if (query) return location.pathname === path && location.search === `?${query}`;
    return path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);
  };

  return (
    <div className="storefront min-h-screen">
      <header className="store-header sticky top-0 z-40 border-b border-ink/[0.06] bg-base/95">
        <div className="store-header-inner mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="store-brand flex min-w-0 items-center gap-2.5" title={site.siteName}>
            <SiteMark alt={site.siteName || "Ka"} className="store-brand-icon shrink-0 rounded-xl object-cover" />
            <span className={`store-brand-name text-lg font-extrabold tracking-tight${site.siteName.length > 10 ? " is-wrap" : ""}`}>{site.siteName}</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex lg:gap-2">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                aria-current={active(n.to) ? "page" : undefined}
                className="store-nav-link"
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
          <nav className="store-mobile-primary md:hidden" aria-label={lang === "zh" ? "主要导航" : "Main navigation"}>
            {[BASE_NAV[0], BASE_NAV[2]].map((n) => <Link key={n.to} to={n.to}
              aria-current={active(n.to) ? "page" : undefined}>
              {lang === "zh" ? n.to === "/" ? "全部商品" : "我的订单" : n.label}
            </Link>)}
          </nav>
          <div className="store-mobile-actions flex shrink-0 items-center gap-1 md:hidden">
            <button onClick={() => setDark(toggleMode())}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/70 hover:bg-ink/5"
              title={copy.nav.toggleMode} aria-label={copy.nav.toggleMode}>
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Link to={member ? "/me" : "/login"}
              className={member
                ? "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink/10 text-ink/70 hover:bg-ink/5"
                : "btn-primary !min-h-9 !px-3.5 !py-0 text-xs"}
              title={member ? copy.nav.memberCenter : copy.nav.login} aria-label={member ? copy.nav.memberCenter : copy.nav.login}>
              {member ? <span className="text-xs font-extrabold">{(member.nickname || member.email).slice(0, 1).toUpperCase()}</span> : copy.nav.login}
            </Link>
            <button type="button" onClick={() => setMenuOpen(true)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/70 hover:bg-ink/5"
              title={lang === "zh" ? "更多" : "More"} aria-label={lang === "zh" ? "更多入口" : "More entries"}>
              <MoreHorizontal size={19} />
            </button>
          </div>
        </div>
        <div className="store-mobile-secondary px-4 md:hidden">
          <nav aria-label={lang === "zh" ? "更多服务" : "More services"} className="flex min-w-0 items-center gap-x-5">
            {nav.filter((n) => n.to !== "/" && n.to !== "/order").map((n) => <Link key={n.to} to={n.to}
              aria-current={active(n.to) ? "page" : undefined}
              className={`inline-flex min-h-9 items-center gap-1.5 text-xs ${active(n.to) ? "font-semibold text-primary" : "text-ink/55"}`}>
              <n.icon size={13} />{n.label}
            </Link>)}
          </nav>
          <LanguageButton lang={lang} label={copy.nav.language} onToggle={() => setLang(lang === "zh" ? "en" : "zh")} />
        </div>
        {site.announcement && (
          <div className="bg-accent-soft px-4 py-2 text-center text-xs font-medium text-ink/80">
            {site.announcement}
          </div>
        )}
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={lang === "zh" ? "更多入口" : "More entries"}>
          <button type="button" className="store-sheet-mask absolute inset-0 bg-ink/40 backdrop-blur-sm"
            aria-label={lang === "zh" ? "关闭" : "Close"} onClick={() => setMenuOpen(false)} />
          <div className="store-sheet absolute inset-x-0 bottom-0 rounded-t-3xl bg-surface p-5 pb-7 shadow-2xl" style={{ paddingBottom: "calc(1.75rem + env(safe-area-inset-bottom))" }}>
            <div className="store-sheet-handle mx-auto mb-4" aria-hidden="true" />
            <p className="section-label">{lang === "zh" ? "全部入口" : "All entries"}</p>
            <div className="grid gap-1.5">
              {nav.map((n) => (
                <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)}
                  aria-current={active(n.to) ? "page" : undefined}
                  className={`store-sheet-link ${active(n.to) ? "is-active" : ""}`}>
                  <n.icon size={17} strokeWidth={1.7} />{n.label}
                  <span className="store-sheet-count">{lang === "zh" ? "进入" : "Open"}</span>
                </Link>
              ))}
            </div>
            <p className="section-label mt-5">{lang === "zh" ? "显示" : "Display"}</p>
            <div className="flex items-center gap-2.5">
              <LanguageButton className="!h-9 !px-3.5" lang={lang} label={copy.nav.language} onToggle={() => setLang(lang === "zh" ? "en" : "zh")} />
              <button onClick={() => setDark(toggleMode())}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink/10 bg-surface px-3.5 text-xs font-bold text-ink/60"
                title={copy.nav.toggleMode}>
                {dark ? <Sun size={15} /> : <Moon size={15} />}
                {dark ? (lang === "zh" ? "浅色" : "Light") : (lang === "zh" ? "深色" : "Dark")}
              </button>
            </div>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 sm:pt-8 md:pb-20">
        <StoreAvailability>
          <Suspense fallback={<StoreLoadingCard label={copy.common.loading} />}>
            {/* 只在真正切换页面/商品/订单时重置页面状态,查询参数变化保留当前页面。 */}
            <Outlet key={location.pathname} />
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
    </div>
  );
}

function LanguageButton({ lang, label, onToggle, className = "" }: { lang: "zh" | "en"; label: string; onToggle: () => void; className?: string }) {
  return (
    <button onClick={onToggle}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-ink/10 bg-surface px-2.5 text-xs font-bold text-ink/60 transition hover:border-primary/35 hover:text-ink ${className}`}
      title={label} aria-label={label}>
      <Languages size={14} />
      <span className="min-w-5 text-center">{lang === "zh" ? "EN" : "中"}</span>
    </button>
  );
}
