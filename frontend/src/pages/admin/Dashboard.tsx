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
interface ChainRow {
  chain: string; level: string; ageSeconds: number; blockLag: number | null;
  lastError: string | null; failures: number; scanned: boolean;
}
interface PaidRow {
  level: string; autoCard: number; autoCardOldestSeconds: number | null;
  manual: number; manualOldestSeconds: number | null;
  presale: number; presaleOldestSeconds: number | null;
  recharge: number; rechargeOldestSeconds: number | null; readFailed: boolean;
}
interface NotifyRow {
  channel: string; level: string; totalFailures: number; recentFailures: number; lastFailureAgeSeconds: number | null;
}
interface PoolRow {
  level: string; name: string | null; active: number | null; idle: number | null;
  pending: number | null; max: number | null; readable: boolean;
}
interface OpsSnapshot {
  level: string; stallAfterSeconds: number; stuckAfterSeconds: number;
  chains: ChainRow[]; paid: PaidRow; notifications: NotifyRow[]; pool: PoolRow;
}

function levelLabel(level: string) {
  if (level === "DOWN") return "异常";
  if (level === "DEGRADED") return "需关注";
  return "正常";
}

function levelChip(level: string) {
  const tone = level === "DOWN"
    ? "bg-red-500/10 text-red-600 dark:text-red-400"
    : level === "DEGRADED"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  return `shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tone}`;
}

function durationText(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  if (value < 60) return `${value} 秒`;
  const minutes = Math.floor(value / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时 ${minutes % 60} 分钟`;
}

function chainLine(chain: ChainRow) {
  const wait = durationText(chain.ageSeconds);
  const lag = chain.blockLag == null ? "" : chain.blockLag === 0 ? "，已追上链头" : `，落后 ${chain.blockLag} 块`;
  if (!chain.scanned) {
    return chain.level === "DOWN" ? `启动后 ${wait} 仍未扫描成功${lag}` : `尚未完成首次扫描，已等待 ${wait}${lag}`;
  }
  return chain.level === "DOWN" ? `已 ${wait} 没有成功扫描${lag}` : `${wait}前成功${lag}`;
}

function paidText(label: string, count: number, age: number | null, watch: boolean) {
  if (count <= 0) return `${label} 0 单`;
  const wait = age == null ? "付款时间未知" : `最早已等待 ${durationText(age)}`;
  if (!watch) return `${label} ${count} 单待处理，${wait}。这是正常积压，不把站点标成异常`;
  if (age != null && age < 60) return `${label} ${count} 单，${wait}，仍在发货窗口内`;
  return `${label} ${count} 单，${wait}`;
}

function notifyText(row: NotifyRow) {
  const name = row.channel === "email" ? "邮件" : row.channel === "telegram" ? "Telegram" : row.channel;
  if (row.recentFailures > 0) {
    const last = row.lastFailureAgeSeconds == null ? "" : `，最近一次 ${durationText(row.lastFailureAgeSeconds)}前`;
    return `${name}近 15 分钟失败 ${row.recentFailures} 次，累计 ${row.totalFailures} 次${last}`;
  }
  if (row.totalFailures > 0) return `${name}近 15 分钟没有失败，累计 ${row.totalFailures} 次`;
  return `${name}正常`;
}

function poolText(pool: PoolRow) {
  if (!pool.readable || pool.active == null || pool.max == null) return "还不能读取数据库连接池。";
  const waiting = pool.pending ?? 0;
  const base = `${pool.active} / ${pool.max} 使用中，空闲 ${pool.idle ?? 0}，等待 ${waiting}`;
  if (waiting > 0) return `${base}。有请求在等连接，连接池已耗尽`;
  if (pool.level === "DEGRADED") return `${base}。连接已全部借出，还没有请求在排队`;
  return base;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [ops, setOps] = useState<OpsSnapshot | null>(null);

  const [error, setError] = useState("");
  const [opsError, setOpsError] = useState("");
  const [loading, setLoading] = useState(false);
  const [opsLoading, setOpsLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const inFlight = useRef(false);
  const opsFlight = useRef(false);
  const opsRef = useRef<OpsSnapshot | null>(null);
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
  const refreshOps = useCallback(async () => {
    if (opsFlight.current) return;
    opsFlight.current = true;
    setOpsLoading(true);
    try {
      const result = await get<OpsSnapshot>("/admin/observability");
      if (!mounted.current) return;
      opsRef.current = result;
      setOps(result);
      setOpsError("");
    } catch {
      if (mounted.current) {
        setOpsError(opsRef.current ? "运行状态刷新失败，下面仍是上次读到的状态。" : "运行状态加载失败，请重试。");
      }
    } finally {
      opsFlight.current = false;
      if (mounted.current) setOpsLoading(false);
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

  useEffect(() => {
    void refreshOps();
    const update = () => { if (!document.hidden) void refreshOps(); };
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [refreshOps]);

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
          <button className="btn-ghost !py-2" disabled={loading || opsLoading} onClick={() => { void refresh(); void refreshOps(); }}><RefreshCw size={14} className={loading || opsLoading ? "animate-spin" : ""} />刷新</button>
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

      <section aria-label="运行状态" className="card mt-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">运行状态</h2>
          {ops && <span className={levelChip(ops.level)}>{levelLabel(ops.level)}</span>}
        </div>
        <p className="mt-2 text-xs leading-5 text-ink/50">
          扫链超过 {ops?.stallAfterSeconds ?? 120} 秒没有成功、自动发卡 / 预售 / 充值超过 {ops?.stuckAfterSeconds ?? 60} 秒仍停在已支付，或数据库连接有请求在等待，会标成异常。人工发货只展示。通知失败标成需关注。
        </p>
        {opsError && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{opsError}</p>}
        {!ops && !opsError && <p className="mt-4 text-sm text-ink/50">正在读取运行状态…</p>}
        {ops && (
          <div className="mt-4 space-y-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">扫链</h3>
                <span className={levelChip(ops.chains.some((chain) => chain.level === "DOWN") ? "DOWN" : "UP")}>
                  {ops.chains.length === 0 ? "未启用" : levelLabel(ops.chains.some((chain) => chain.level === "DOWN") ? "DOWN" : "UP")}
                </span>
              </div>
              {ops.chains.length === 0 ? (
                <p className="mt-2 text-sm text-ink/55">没有启用的链，扫链任务处于关闭状态。</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {ops.chains.map((chain) => (
                    <li key={chain.chain} className="min-w-0 rounded-2xl bg-ink/[0.03] px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{chain.chain}</span>
                        <span className={levelChip(chain.level)}>{levelLabel(chain.level)}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-ink/60">{chainLine(chain)}{chain.failures > 0 ? `，累计失败 ${chain.failures} 次` : ""}</p>
                      {chain.lastError && <p className="mt-1 break-all text-xs leading-5 text-ink/45">最近错误：{chain.lastError}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">已支付未交付</h3>
                <span className={levelChip(ops.paid.level)}>{levelLabel(ops.paid.level)}</span>
              </div>
              {ops.paid.readFailed ? (
                <p className="mt-2 text-sm text-ink/60">暂时读不到订单状态。</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm leading-6 text-ink/70">
                  <li>{paidText("自动发卡", ops.paid.autoCard, ops.paid.autoCardOldestSeconds, true)}</li>
                  <li>{paidText("预售凭证", ops.paid.presale, ops.paid.presaleOldestSeconds, true)}</li>
                  <li>{paidText("充值未入账", ops.paid.recharge, ops.paid.rechargeOldestSeconds, true)}</li>
                  <li>{paidText("人工发货", ops.paid.manual, ops.paid.manualOldestSeconds, false)}</li>
                </ul>
              )}
              {(ops.paid.autoCard + ops.paid.presale + ops.paid.recharge + ops.paid.manual) > 0 && (
                <Link to="/admin/orders?status=PAID" className="mt-2 inline-block text-xs font-bold text-primary hover:underline">查看未发货订单</Link>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">通知</h3>
                <span className={levelChip(ops.notifications.some((row) => row.level === "DEGRADED") ? "DEGRADED" : "UP")}>
                  {levelLabel(ops.notifications.some((row) => row.level === "DEGRADED") ? "DEGRADED" : "UP")}
                </span>
              </div>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-ink/70">
                {ops.notifications.map((row) => <li key={row.channel}>{notifyText(row)}</li>)}
              </ul>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">数据库连接</h3>
                <span className={levelChip(ops.pool.level)}>{levelLabel(ops.pool.level)}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-ink/70">{poolText(ops.pool)}</p>
            </div>
          </div>
        )}
        <p className="mt-4 break-all text-xs leading-5 text-ink/45">
          Prometheus 只在本机抓取 http://127.0.0.1:8080/actuator/prometheus 。公网入口不转发 /actuator。
        </p>
      </section>

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
