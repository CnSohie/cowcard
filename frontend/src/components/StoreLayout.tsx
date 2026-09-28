import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Languages, Moon, Newspaper, Search, ShoppingBag, Sun, TicketCheck, UserRound, Zap } from "lucide-react";
import { get } from "../lib/api";
import { isMemberLoggedIn, memberInfo } from "../lib/memberApi";
import { applySiteTheme, isDark, toggleMode } from "../lib/theme";
import { setCurrency } from "../lib/currency";
import { useI18n } from "../lib/i18n";

export default function StoreLayout() {
  const [site, setSite] = useState<{ siteName: string; announcement: string; contact?: string; currency?: string }>({
    siteName: "Ka Store",
    announcement: "",
  });
  const [dark, setDark] = useState(isDark());
  const location = useLocation();
  const { lang, setLang, copy } = useI18n();
  const member = isMemberLoggedIn() ? memberInfo() : null;
  const BASE_NAV = [
    { to: "/", label: copy.nav.store, icon: ShoppingBag },
    { to: "/posts", label: copy.nav.posts, icon: Newspaper },
    { to: "/order", label: copy.nav.order, icon: Search },
    { to: "/redeem", label: copy.nav.redeem, icon: TicketCheck },
  ];
  const nav = member ? [...BASE_NAV, { to: "/me?tab=support", label: copy.nav.support, icon: UserRound }] : BASE_NAV;

  useEffect(() => {
    get<{ siteName: string; announcement: string; contact?: string; theme?: string; mode?: string; currency?: string }>("/store/site")
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
    <div className="cow-theme-stage min-h-screen">
      <div className="cow-theme-decor" aria-hidden="true">
        <span className="cow-cloud cow-cloud-a" />
        <span className="cow-cloud cow-cloud-b" />
        <span className="cow-hill cow-hill-a" />
        <span className="cow-hill cow-hill-b" />
        <span className="cow-mini cow-mini-cow"><i /><b /></span>
        <span className="cow-mini cow-mini-bird"><i /><b /></span>
        <span className="cow-mini cow-mini-sheep"><i /><b /></span>
        <span className="cow-mini cow-mini-butterfly"><i /><b /></span>
      </div>
      <header className="sticky top-0 z-40 border-b border-ink/[0.06] bg-base/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="brand-mark grid h-9 w-9 place-items-center rounded-full bg-primary">
              <Zap size={16} strokeWidth={2.5} className="brand-mark-icon text-accent dark:text-primary-contrast" />
            </span>
            <span className="hidden text-lg font-extrabold tracking-tight min-[400px]:block">{site.siteName}</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex lg:gap-2">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`rounded-full px-3 py-2 text-sm font-medium transition sm:px-4 ${
                  active(n.to) ? "bg-ink/[0.06] text-ink" : "text-ink/60 hover:text-ink"
                }`}
              >
                {n.label}
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
      <main className="mx-auto max-w-6xl px-4 pb-32 pt-8 sm:px-5 sm:pt-10 md:pb-24">
        <Outlet />
      </main>
      <footer className="border-t border-ink/[0.06] py-10 text-center text-xs text-ink/40">
        <p>{site.siteName} · {copy.footer.promise}</p>
        <p className="mt-2 flex items-center justify-center gap-3">
          <Link to="/about" className="font-medium text-ink/55 underline decoration-ink/20 underline-offset-4 hover:text-ink">{copy.footer.about}</Link>
          <Link to="/tos" className="font-medium text-ink/55 underline decoration-ink/20 underline-offset-4 hover:text-ink">{copy.footer.tos}</Link>
        </p>
        {site.contact && <p className="mt-2 text-ink/50">{copy.footer.support}<span className="font-medium text-ink/70">{site.contact}</span></p>}
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
