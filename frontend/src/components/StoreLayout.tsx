import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Moon, Sun, Zap } from "lucide-react";
import { get } from "../lib/api";
import { isMemberLoggedIn, memberInfo } from "../lib/memberApi";
import { applySiteTheme, isDark, toggleMode } from "../lib/theme";
import { setCurrency } from "../lib/currency";

const BASE_NAV = [
  { to: "/", label: "商店" },
  { to: "/posts", label: "文章" },
  { to: "/order", label: "查单" },
  { to: "/redeem", label: "提货" },
];

export default function StoreLayout() {
  const [site, setSite] = useState<{ siteName: string; announcement: string; contact?: string; currency?: string }>({
    siteName: "Ka Store",
    announcement: "",
  });
  const [dark, setDark] = useState(isDark());
  const location = useLocation();
  const member = isMemberLoggedIn() ? memberInfo() : null;
  const nav = member ? [...BASE_NAV, { to: "/me?tab=support", label: "客服" }] : BASE_NAV;

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
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-ink/[0.06] bg-base/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary">
              <Zap size={16} strokeWidth={2.5} className="text-accent dark:text-primary-contrast" />
            </span>
            <span className="hidden text-lg font-extrabold tracking-tight min-[400px]:block">{site.siteName}</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
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
            <button
              onClick={() => setDark(toggleMode())}
              className="grid h-9 w-9 place-items-center rounded-full border border-ink/10 text-ink/60 transition hover:text-ink"
              title="切换明暗模式"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            {member ? (
              <Link
                to="/me"
                className="flex items-center gap-2 rounded-full border border-ink/10 py-1.5 pl-1.5 pr-2 transition hover:border-primary/40 sm:pr-3.5"
                title="会员中心"
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
                登录
              </Link>
            )}
          </nav>
        </div>
        {site.announcement && (
          <div className="bg-accent-soft px-4 py-2 text-center text-xs font-medium text-ink/80">
            {site.announcement}
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-5 sm:pt-10">
        <Outlet />
      </main>
      <footer className="border-t border-ink/[0.06] py-10 text-center text-xs text-ink/40">
        <p>{site.siteName} · 支付即发货 · 7×24 全自动</p>
        <p className="mt-2">
          <Link to="/tos" className="font-medium text-ink/55 underline decoration-ink/20 underline-offset-4 hover:text-ink">服务条款</Link>
        </p>
        {site.contact && <p className="mt-2 text-ink/50">售后 / 客服:<span className="font-medium text-ink/70">{site.contact}</span></p>}
      </footer>
    </div>
  );
}
