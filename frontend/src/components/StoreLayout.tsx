import StoreAvailability, { StoreLoadingCard } from "./StoreAvailability";
import { Suspense, useEffect, useLayoutEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ArrowUp, Languages, Moon, MoreHorizontal, Newspaper, Search, ShoppingBag, Sun, TicketCheck, UserRound } from "lucide-react";
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
    return path === "/" ? location.pathname === "/" || location.pathname.startsWith("/product/") : location.pathname.startsWith(path);
  };

  return (
    <div className="storefront min-h-screen">
      <header className="store-header sticky top-0 z-40">
        <div className="store-header-inner mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="store-brand flex min-w-0 items-center gap-2.5" title={site.siteName}>
            <SiteMark alt={site.siteName || "Ka"} className="store-brand-icon shrink-0 rounded-[9px] object-cover" />
            <span className={`store-brand-name text-[19px] tracking-tight${site.siteName.length > 10 ? " is-wrap" : ""}`}>{site.siteName}</span>
          </Link>

          <nav className="store-nav-links hidden md:flex" aria-label={lang === "zh" ? "主导航" : "Main navigation"}>
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                aria-current={active(n.to) ? "page" : undefined}
                className="store-nav-link"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-1.5 md:flex">
            <LanguageButton lang={lang} label={copy.nav.language} onToggle={() => setLang(lang === "zh" ? "en" : "zh")} />
            <button
              onClick={() => setDark(toggleMode())}
              className="store-header-ghost w-9 !px-0"
              title={copy.nav.toggleMode}
              aria-label={copy.nav.toggleMode}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <span className="store-header-divider mx-1" aria-hidden="true" />
            {member ? (
              <Link
                to="/me"
                className="flex items-center gap-2 rounded-full border border-[var(--gpt-border)] bg-surface py-1 pl-1 pr-3 transition hover:bg-[var(--gpt-secondary)]"
                title={copy.nav.memberCenter}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-contrast">
                  {(member.nickname || member.email).slice(0, 1).toUpperCase()}
                </span>
                <span className="max-w-[88px] truncate text-xs font-medium">
                  {member.nickname || member.email.split("@")[0]}
                </span>
              </Link>
            ) : (
              <Link to="/login" className="btn-primary !rounded-full !px-4 !py-1.5 !text-xs">
                {copy.nav.login}
              </Link>
            )}
          </div>

          <nav className="store-mobile-primary md:hidden" aria-label={lang === "zh" ? "主要导航" : "Main navigation"}>
            {[BASE_NAV[0], BASE_NAV[2]].map((n) => (
              <Link key={n.to} to={n.to} aria-current={active(n.to) ? "page" : undefined}>
                {lang === "zh" ? (n.to === "/" ? "全部商品" : "我的订单") : n.label}
              </Link>
            ))}
          </nav>

          <div className="store-mobile-actions flex shrink-0 items-center gap-1 md:hidden">
            <button
              onClick={() => setDark(toggleMode())}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/70 hover:bg-ink/5"
              title={copy.nav.toggleMode}
              aria-label={copy.nav.toggleMode}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link
              to={member ? "/me" : "/login"}
              className={
                member
                  ? "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--gpt-border)] text-ink/70 hover:bg-ink/5"
                  : "btn-primary !min-h-8 !rounded-full !px-3.5 !py-0 text-xs"
              }
              title={member ? copy.nav.memberCenter : copy.nav.login}
              aria-label={member ? copy.nav.memberCenter : copy.nav.login}
            >
              {member ? <span className="text-xs font-semibold">{(member.nickname || member.email).slice(0, 1).toUpperCase()}</span> : copy.nav.login}
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/70 hover:bg-ink/5"
              title={lang === "zh" ? "更多" : "More"}
              aria-label={lang === "zh" ? "更多入口" : "More entries"}
            >
              <MoreHorizontal size={19} />
            </button>
          </div>
        </div>

        <div className="store-mobile-secondary px-4 md:hidden">
          <nav aria-label={lang === "zh" ? "更多服务" : "More services"} className="flex min-w-0 items-center gap-x-5">
            {nav.filter((n) => n.to !== "/" && n.to !== "/order").map((n) => (
              <Link
                key={n.to}
                to={n.to}
                aria-current={active(n.to) ? "page" : undefined}
                className={`inline-flex min-h-9 items-center gap-1.5 text-xs ${active(n.to) ? "font-semibold text-primary" : "text-ink/55"}`}
              >
                <n.icon size={13} />{n.label}
              </Link>
            ))}
          </nav>
          <LanguageButton lang={lang} label={copy.nav.language} onToggle={() => setLang(lang === "zh" ? "en" : "zh")} />
        </div>

        {site.announcement && (
          <div className="store-announcement">
            <span className="store-announcement-dot" aria-hidden="true" />
            <span>{site.announcement}</span>
          </div>
        )}
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={lang === "zh" ? "更多入口" : "More entries"}>
          <button
            type="button"
            className="store-sheet-mask absolute inset-0 bg-black/35 backdrop-blur-sm"
            aria-label={lang === "zh" ? "关闭" : "Close"}
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="store-sheet absolute inset-x-0 bottom-0 rounded-t-[22px] bg-surface p-5 pb-7 shadow-2xl"
            style={{ paddingBottom: "calc(1.75rem + env(safe-area-inset-bottom))" }}
          >
            <div className="store-sheet-handle mx-auto mb-4" aria-hidden="true" />
            <p className="section-label">{lang === "zh" ? "全部入口" : "All entries"}</p>
            <div className="grid gap-1">
              {nav.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setMenuOpen(false)}
                  aria-current={active(n.to) ? "page" : undefined}
                  className={`store-sheet-link ${active(n.to) ? "is-active" : ""}`}
                >
                  <n.icon size={16} strokeWidth={1.7} />{n.label}
                  <span className="store-sheet-count">{lang === "zh" ? "进入" : "Open"}</span>
                </Link>
              ))}
            </div>
            <p className="section-label mt-5">{lang === "zh" ? "显示" : "Display"}</p>
            <div className="flex items-center gap-2.5">
              <LanguageButton className="!h-9 !rounded-full !border !border-[var(--gpt-border)] !px-3.5" lang={lang} label={copy.nav.language} onToggle={() => setLang(lang === "zh" ? "en" : "zh")} />
              <button
                onClick={() => setDark(toggleMode())}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--gpt-border)] bg-surface px-3.5 text-xs font-medium text-ink/70"
                title={copy.nav.toggleMode}
              >
                {dark ? <Sun size={14} /> : <Moon size={14} />}
                {dark ? (lang === "zh" ? "浅色" : "Light") : (lang === "zh" ? "深色" : "Dark")}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-6 sm:pt-8 md:pb-20">
        <StoreAvailability>
          <Suspense fallback={<StoreLoadingCard label={copy.common.loading} />}>
            {/* 只在真正切换页面/商品/订单时重置页面状态,查询参数变化保留当前页面。 */}
            <Outlet key={location.pathname} />
          </Suspense>
        </StoreAvailability>
      </main>

      <footer className="store-footer">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="store-footer-top">
            <Link to="/" className="inline-flex items-center gap-2 text-[16px] font-semibold tracking-tight">
              <SiteMark alt="" className="h-6 w-6 rounded-[7px] object-cover" />
              <span>{site.siteName}</span>
            </Link>
            <span className="store-footer-tagline">
              {lang === "zh" ? "价格公开，自动交付，订单进度随时可查。" : "Transparent pricing, instant delivery, trackable orders."}
            </span>
            <button
              type="button"
              onClick={() => setDark(toggleMode())}
              className="ml-auto inline-flex items-center gap-1.5 text-xs text-[var(--gpt-muted)] transition hover:text-ink"
            >
              {dark ? <Moon size={13} /> : <Sun size={13} />}
              {dark ? (lang === "zh" ? "深色外观" : "Dark") : (lang === "zh" ? "浅色外观" : "Light")}
            </button>
          </div>
          <div className="store-footer-bottom">
            <p>© {new Date().getFullYear()} {site.siteName}{site.contact ? ` · ${copy.footer.support}${site.contact}` : ""}</p>
            <div className="store-footer-links">
              <Link to="/">{copy.nav.store}</Link>
              <Link to="/order">{copy.nav.order}</Link>
              <Link to="/posts">{copy.nav.posts}</Link>
              <Link to="/redeem">{copy.nav.redeem}</Link>
              <Link to="/about">{copy.footer.about}</Link>
              <Link to="/tos">{copy.footer.tos}</Link>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}
                className="inline-flex items-center gap-1"
              >
                {lang === "zh" ? "返回顶部" : "Top"}<ArrowUp size={12} />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LanguageButton({ lang, label, onToggle, className = "" }: { lang: "zh" | "en"; label: string; onToggle: () => void; className?: string }) {
  return (
    <button
      onClick={onToggle}
      className={`store-header-ghost shrink-0 ${className}`}
      title={label}
      aria-label={label}
    >
      <Languages size={14} />
      <span className="min-w-4 text-center">{lang === "zh" ? "EN" : "中"}</span>
    </button>
  );
}
