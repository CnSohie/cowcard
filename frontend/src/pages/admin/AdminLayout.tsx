import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BadgePercent, CreditCard, Gift, HandCoins, KeyRound, LayoutDashboard, LogOut, Menu, Moon,
  MessageSquare, Newspaper, Package, ScrollText, Settings, ShieldAlert, ShieldCheck, ShoppingCart, Sun, Users, UsersRound, X, Zap,
} from "lucide-react";
import { get, isLoggedIn, setTokens } from "../../lib/api";
import { isDark, toggleMode } from "../../lib/theme";

const NAV = [
  { to: "/admin", label: "概览", icon: LayoutDashboard, end: true, perm: "dashboard:read" as string | null },
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

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-ink/[0.06] px-5">
        <div className="flex items-center gap-2.5">
          <span className="brand-mark grid h-8 w-8 place-items-center rounded-full bg-primary">
            <Zap size={14} strokeWidth={2.5} className="brand-mark-icon text-accent dark:text-primary-contrast" />
          </span>
          <span className="font-extrabold tracking-tight">Ka 后台</span>
        </div>
        <button className="md:hidden" onClick={() => setDrawer(false)}><X size={18} className="text-ink/50" /></button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.filter((n) => canAccess(n.perm)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setDrawer(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm transition ${
                isActive ? "bg-primary font-semibold text-primary-contrast" : "text-ink/60 hover:bg-ink/[0.05] hover:text-ink"
              }`}>
            <n.icon size={16} />
            <span className="min-w-0 flex-1 truncate">{n.label}</span>
            {n.to === "/admin/support-tickets" && supportPending > 0 && (
              <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-extrabold text-white">
                {supportPending > 99 ? "99+" : supportPending}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-ink/[0.06] p-3">
        <div className="mb-1 flex items-center justify-between px-3">
          <span className="text-xs text-ink/40">{displayName}</span>
          <button onClick={() => setDark(toggleMode())}
            className="grid h-8 w-8 place-items-center rounded-full text-ink/50 transition hover:bg-ink/[0.06] hover:text-ink"
            title="切换明暗">
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
        <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm text-ink/60 transition hover:bg-ink/[0.05] hover:text-red-500">
          <LogOut size={15} /> 退出登录
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* 桌面侧栏 */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-ink/[0.06] bg-surface md:block">
        {sidebar}
      </aside>
      {/* 移动端抽屉 */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" />
          <aside className="absolute inset-y-0 left-0 w-64 bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}
      {/* 移动端顶栏 */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink/[0.06] bg-base/80 px-4 backdrop-blur-xl md:hidden">
        <button onClick={() => setDrawer(true)} className="grid h-9 w-9 place-items-center rounded-full border border-ink/10">
          <Menu size={16} />
        </button>
        <span className="font-bold">Ka 后台</span>
      </header>
      <main className="p-5 md:ml-60 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
