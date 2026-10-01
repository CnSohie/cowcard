import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { get } from "../../lib/api";
import { money } from "../../lib/currency";

interface DayRevenue { date: string; amount: string; }
interface Stats {
  todayRevenue: string; todayPaidCount: number; weekRevenue: string; revenue7d: DayRevenue[];
  pendingOrders: number; paidOrders: number; deliveredOrders: number; latePaidOrders: number; totalOrders: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const result = await get<Stats>("/admin/dashboard");
      if (!mounted.current) return;
      setStats(result);
      setError("");
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch {
      if (mounted.current) setError("统计加载失败，已显示的数据可能过时，请重试。");
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const update = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => { mounted.current = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [refresh]);

  const days = stats?.revenue7d ?? [];
  const max = (Math.max(0, ...days.map((d) => Number(d.amount))) || 1);
  const opsOrderLink = (stats?.latePaidOrders ?? 0) > 0
    ? "/admin/orders?latePaid=1"
    : (stats?.paidOrders ?? 0) > 0 ? "/admin/orders?status=PAID" : "/admin/orders";

  const tiles = [
    { label: "今日商品成交额", value: stats ? money(stats.todayRevenue) : "—", icon: Wallet, hot: true },
    { label: "今日成交笔数", value: stats?.todayPaidCount ?? "—", icon: TrendingUp, hot: false },
    { label: "已收款待处理", value: stats ? (stats.paidOrders + stats.latePaidOrders) : "—", icon: AlertTriangle, hot: false },
    { label: "已发货订单", value: stats?.deliveredOrders ?? "—", icon: CheckCircle2, hot: false },
  ];

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold tracking-tight">概览</h1>
        <div className="flex items-center gap-3 text-xs text-ink/50">
          {updatedAt && <span>更新于 {updatedAt}</span>}
          <button className="btn-ghost !py-2" disabled={loading} onClick={refresh}><RefreshCw size={14} className={loading ? "animate-spin" : ""} />刷新</button>
        </div>
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-red-500">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className={`card p-5 ${t.hot ? "!bg-primary !border-transparent" : ""}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs ${t.hot ? "text-primary-contrast/70" : "text-ink/45"}`}>{t.label}</span>
              <t.icon size={16} className={t.hot ? "text-primary-contrast/80" : "text-primary"} />
            </div>
            <div className={`mt-2.5 text-3xl font-extrabold tracking-tight ${t.hot ? "text-primary-contrast" : ""}`}>
              {t.value}
            </div>
          </div>
        ))}
      </div>

      {/* 近 7 天商品成交额:单系列柱图(悬停显示数值,文字用墨色) */}
      <div className="card mt-5 p-6">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-bold">近 7 天商品成交额</h2>
          <span className="text-sm text-ink/45">合计 <b className="text-ink">{stats ? money(stats.weekRevenue) : "—"}</b></span>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-ink/50">按订单付款日期统计，包含余额抵扣，扣除已退余额；不含充值、未付款及已退款订单。每分钟自动更新。</p>
        <div className="flex h-44 items-end gap-2 sm:gap-3" role="img" aria-label="近七天商品成交额柱状图，具体金额见下表">
          {days.map((d) => {
            const h = (Number(d.amount) / max) * 100;
            return (
              <div key={d.date} className="group relative flex h-full min-w-0 flex-1 flex-col items-center">
                <span className="pointer-events-none absolute -top-8 hidden whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] font-semibold text-base group-hover:block">
                  {d.date.slice(5)} · {money(d.amount)}
                </span>
                <div className="flex min-h-0 w-full flex-1 items-end justify-center border-b border-ink/10">
                <div
                  data-revenue-bar={d.date}
                  title={`${d.date} · ${money(d.amount)}`}
                  className="w-full max-w-12 rounded-t-[6px] bg-primary/85 transition group-hover:bg-primary"
                  style={{ height: `${h}%`, minHeight: Number(d.amount) > 0 ? 2 : 0 }}
                />
                </div>
                <span className="mt-2 shrink-0 text-[10px] text-ink/40">{d.date.slice(5)}</span>
              </div>
            );
          })}
          {days.length === 0 && <p className="text-sm text-ink/40">{loading ? "加载中…" : "暂无数据"}</p>}
        </div>
        {stats && <details className="mt-4 text-xs text-ink/60"><summary className="cursor-pointer">查看每日金额</summary>
          <table className="mt-2 w-full text-left"><thead><tr><th className="py-2">日期</th><th>商品成交额</th></tr></thead>
            <tbody>{days.map(d => <tr key={d.date}><td className="py-1">{d.date}</td><td>{money(d.amount)}</td></tr>)}</tbody>
          </table>
        </details>}
      </div>

      <div className={`card mt-5 p-5 text-sm leading-relaxed ${
        (stats?.paidOrders ?? 0) + (stats?.latePaidOrders ?? 0) > 0 ? "border-amber-500/25 bg-amber-500/[0.06]" : "text-ink/55"
      }`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold text-ink">运营提示</p>
          <Link to={opsOrderLink} className="text-xs font-bold text-primary hover:underline">查看订单</Link>
        </div>
        <p>
          已支付待发货/待人工处理 <b className="text-ink">{stats?.paidOrders ?? 0}</b> 单；
          迟到到账但订单已超时/关闭 <b className="text-ink">{stats?.latePaidOrders ?? 0}</b> 单。
          前者通常需要补卡密或人工发货，后者需要先核实渠道流水后用订单管理的人工补单恢复资源占用。订单总量 {stats?.totalOrders ?? 0}。
        </p>
      </div>
    </div>
  );
}
