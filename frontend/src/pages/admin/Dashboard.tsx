import { useEffect, useState } from "react";
import { CheckCircle2, Clock, TrendingUp, Wallet } from "lucide-react";
import { get } from "../../lib/api";
import { money } from "../../lib/currency";

interface DayRevenue { date: string; amount: string; }
interface Stats {
  todayRevenue: string; todayPaidCount: number; weekRevenue: string; revenue7d: DayRevenue[];
  pendingOrders: number; paidOrders: number; deliveredOrders: number; totalOrders: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    get<Stats>("/admin/dashboard").then(setStats).catch(() => void 0);
  }, []);

  const days = stats?.revenue7d ?? [];
  const max = Math.max(1, ...days.map((d) => Number(d.amount)));

  const tiles = [
    { label: "今日营收", value: stats ? money(stats.todayRevenue) : "—", icon: Wallet, hot: true },
    { label: "今日成交笔数", value: stats?.todayPaidCount ?? "—", icon: TrendingUp, hot: false },
    { label: "待支付订单", value: stats?.pendingOrders ?? "—", icon: Clock, hot: false },
    { label: "已发货订单", value: stats?.deliveredOrders ?? "—", icon: CheckCircle2, hot: false },
  ];

  return (
    <div className="animate-fade-up">
      <h1 className="mb-6 text-xl font-extrabold tracking-tight">概览</h1>

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

      {/* 近 7 天营收:单系列柱图(悬停显示数值,文字用墨色) */}
      <div className="card mt-5 p-6">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-bold">近 7 天营收</h2>
          <span className="text-sm text-ink/45">合计 <b className="text-ink">{money(stats?.weekRevenue ?? "0")}</b></span>
        </div>
        <div className="flex h-44 items-end gap-2 sm:gap-3">
          {days.map((d) => {
            const h = Math.max(4, (Number(d.amount) / max) * 100);
            return (
              <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end">
                <span className="pointer-events-none absolute -top-8 hidden whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] font-semibold text-base group-hover:block">
                  {d.date.slice(5)} · {money(d.amount)}
                </span>
                <div
                  className="w-full max-w-12 rounded-t-[6px] bg-primary/85 transition group-hover:bg-primary"
                  style={{ height: `${h}%` }}
                />
                <span className="mt-2 text-[10px] text-ink/40">{d.date.slice(5)}</span>
              </div>
            );
          })}
          {days.length === 0 && <p className="text-sm text-ink/40">暂无数据</p>}
        </div>
      </div>

      <div className="card mt-5 p-5 text-sm leading-relaxed text-ink/55">
        <p className="mb-1 font-semibold text-ink">运营提示</p>
        「已支付 {stats?.paidOrders ?? 0} 单」大于 0 说明支付成功但库存不足导致发卡失败——请尽快补充卡密后在订单管理中补发。订单总量 {stats?.totalOrders ?? 0}。
      </div>
    </div>
  );
}
