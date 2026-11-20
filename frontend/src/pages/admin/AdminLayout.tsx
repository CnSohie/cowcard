import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, ArrowUpRight, BadgePercent, CreditCard, Gift, HandCoins, KeyRound, LayoutDashboard, LogOut, Menu, Moon,
  MessageSquare, Newspaper, Package, ScrollText, Settings, ShieldAlert, ShieldCheck, ShoppingCart, Sun, Users, UsersRound, X,
} from "lucide-react";
import { get, isLoggedIn, setTokens } from "../../lib/api";
import { isDark, toggleMode } from "../../lib/theme";
import SiteMark from "../../components/SiteMark";

const NAV = [
  { to: "/admin", label: "概览", icon: LayoutDashboard, end: true, perm: "dashboard:read" as string | null },
  { to: "/admin/monitor", label: "运行监测", icon: Activity, perm: "monitor:read" as string | null },
  { to: "/admin/products", label: "商品管理", icon: Package, perm: "product:read" as string | null },
  { to: "/admin/cards", label: "卡密管理", icon: KeyRound, perm: "card:write" as string | null },
  { to: "/admin/orders", label: "订单管理", icon: ShoppingCart, perm: "order:read" as string | null },
  { to: "/admin/coupons", label: "优惠券", icon: BadgePercent, perm: "coupon:read" as string | null },
  { to: "/admin/articles", label: "媒体文章", icon: Newspaper, perm: "article:read" as string | null },
  { to: "/admin/members", label: "用户中心", icon: UsersRound, perm: "member:read" as string | null },
  { to: "/admin/member-levels", label: "会员等级", icon: BadgePercent, perm: "member-level:manage" as string | null },
  { to: "/admin/gift-cards", label: "礼品卡", icon: Gift, perm: "gift-card:read" as string | null },
  { to: "/admin/withdrawals", label: "提现审核", icon: HandCoins, perm: "withdraw:review" as string | null },
  { to: "/admin/risk-reviews", label: "风控队列", icon: ShieldAlert, perm: "risk:review" as string | null },
  { to: "/admin/support-tickets", label: "客服工单", icon: MessageSquare, perm: "support:manage" as string | null },
  { to: "/admin/channels", label: "支付渠道", icon: CreditCard, perm: "payment:config" as string | null },
  { to: "/admin/users", label: "用户与角色", icon: Users, perm: "user:manage" as string | null },
  { to: "/admin/audit", label: "审计日志", icon: ScrollText, perm: "audit:read" as string | null },
  { to: "/admin/settings", label: "站点设置", icon: Settings, perm: "config:write" as string | null },
  { to: "/admin/security", label: "安全设置", icon: ShieldCheck, perm: null },
];

const LEGACY_PERMS: Record<string, string[]> = {
  "coupon:read": ["coupon:manage", "product:read", "product:write"],
  "coupon:manage": ["product:write"],
  "member:read": ["member:manage"],
  "member:status": ["member:manage"],
  "member-level:manage": ["member:manage"],
  "gift-card:read": ["gift-card:manage", "member:manage"],
  "gift-card:manage": ["member:manage"],
};

export default function AdminLayout() {
  const nav = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [dark, setDark] = useState(isDark());
  const [supportPending, setSupportPending] = useState(0);
  const authorities: string[] = JSON.parse(localStorage.getItem("ka.auth") ?? "[]");
  const displayName = localStorage.getItem("ka.user") ?? "";

  useEffect(() => {
    if (!isLoggedIn() || !canAccess("support:manage")) return;
    let active = true;
    const load = () => {
      get<{ pending: number }>("/admin/support-tickets/stats")
        .then((r) => active && setSupportPending(r.pending ?? 0))
        .catch(() => void 0);
    };
    load();
    window.addEventListener("ka:support-updated", load);
    const timer = window.setInterval(load, 30000);
    return () => {
      active = false;
      window.removeEventListener("ka:support-updated", load);
      window.clearInterval(timer);
    };
  }, []);

  function logout() {
    setTokens(null, null);
    localStorage.removeItem("ka.auth");
    nav("/admin/login", { replace: true });
  }

  function canAccess(perm: string | null) {
    if (!perm) return true;
    if (authorities.includes("ROLE_SUPER_ADMIN") || authorities.includes("*")) return true;
    if (authorities.includes(perm)) return true;
    return (LEGACY_PERMS[perm] ?? []).some((p) => authorities.includes(p));
  }

  const currentNav = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to))) ?? NAV[0];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-[60px] items-center justify-between border-b border-[var(--gpt-border)] px-5">
        <div className="flex items-center gap-2.5">
          <SiteMark alt="" className="h-7 w-7 rounded-lg object-cover" />
          <span className="text-[16px] font-semibold tracking-tight text-ink">管理工作台</span>
        </div>
        <button className="md:hidden" onClick={() => setDrawer(false)} aria-label="关闭导航">
          <X size={18} className="text-[var(--gpt-muted)]" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2.5 px-3 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--gpt-muted)]">Workspace</p>
        <nav className="grid gap-1">
          {NAV.filter((n) => canAccess(n.perm)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setDrawer(false)}
              className={({ isActive }) => `admin-nav-link${isActive ? " is-active" : ""}`}
            >
              <n.icon size={15} strokeWidth={1.7} />
              <span className="min-w-0 flex-1 truncate">{n.label}</span>
              {n.to === "/admin/support-tickets" && supportPending > 0 && (
                <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {supportPending > 99 ? "99+" : supportPending}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="border-t border-[var(--gpt-border)] p-3">
        <div className="mb-1.5 flex items-center justify-between px-3 py-1">
          <span className="truncate text-xs text-[var(--gpt-muted)]">{displayName || "管理员"}</span>
          <button
            onClick={() => setDark(toggleMode())}
            className="grid h-7 w-7 place-items-center rounded-lg text-[var(--gpt-muted)] transition hover:bg-[var(--gpt-secondary)] hover:text-ink"
            title="切换明暗"
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
        <button onClick={logout} className="admin-nav-link w-full hover:!text-red-500">
          <LogOut size={15} strokeWidth={1.7} /> 退出登录
        </button>
      </div>
    </div>
  );

  return (
    <div className="admin-shell">
      {/* 桌面侧栏 */}
      <aside className="admin-sidebar hidden md:flex">
        {sidebar}
      </aside>
      {/* 移动端抽屉 */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-[var(--gpt-border)] bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawer(true)}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--gpt-border)] text-ink md:hidden"
              aria-label="打开菜单"
            >
              <Menu size={16} />
            </button>
            <span className="font-medium text-ink">{currentNav.label}</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-[var(--gpt-secondary)]"
            >
              打开商店 <ArrowUpRight size={13} />
            </a>
            <button
              onClick={() => setDark(toggleMode())}
              className="grid h-8 w-8 place-items-center rounded-lg text-[var(--gpt-muted)] transition hover:bg-[var(--gpt-secondary)] hover:text-ink"
              title="切换明暗"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </header>
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
