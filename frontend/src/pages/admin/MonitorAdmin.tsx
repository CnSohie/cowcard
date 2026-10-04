import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { get, post } from "../../lib/api";

interface ChainCard {
  chain: string; level: string; scannedBlock: number | null; blockLag: number | null;
  lastSuccessAgeSeconds: number | null; consecutiveFailures: number; lastError: string | null;
}
interface TaskCard {
  key: string; name: string; level: string; lastSuccessAgeSeconds: number | null;
  lastDurationMs: number | null; consecutiveFailures: number; detail: string;
}
interface FulfillmentCard {
  level: string; autoCard: number; autoCardOldestSeconds: number | null;
  manual: number; manualOldestSeconds: number | null; presale: number; presaleOldestSeconds: number | null;
  recharge: number; rechargeOldestSeconds: number | null; latePaid: number;
  confirming: number; confirmingOldestSeconds: number | null; readFailed: boolean;
}
interface NotifyCard { channel: string; level: string; consecutiveFailures: number; totalFailures: number; detail: string; }
interface ResourceCard {
  level: string; heapPercent: number | null; poolActive: number | null; poolMax: number | null;
  poolPending: number | null; poolReadable: boolean; asyncQueued: number | null; asyncCapacity: number | null;
  diskFreeMb: number | null; diskFreePercent: number | null; detail: string;
}
interface SecurityCard {
  level: string; loginFailures15m: number; rateLimits15m: number; bans15m: number;
  activeBans: number; auditConsecutiveFailures: number;
}
interface IssueCard { key: string; level: string; title: string; detail: string; href: string | null; }
interface Overview {
  level: string; generatedAt: string; stallAfterSeconds: number; stuckAfterSeconds: number;
  manualStuckAfterSeconds: number; openAlerts: number; unackedAlerts: number;
  chains: ChainCard[]; tasks: TaskCard[]; fulfillment: FulfillmentCard;
  notifications: NotifyCard[]; resources: ResourceCard; security: SecurityCard; issues: IssueCard[];
}
interface AlertItem {
  id: number; alertKey: string; title: string; summary: string; status: string;
  firstSeenAt: string; lastSeenAt: string; recoveredAt: string | null;
  ackedAt: string | null; ackedBy: string | null;
}

function levelLabel(level: string, stale: boolean) {
  if (stale) return "数据已过期";
  if (level === "ABNORMAL") return "异常";
  if (level === "UNCONFIGURED") return "未配置";
  if (level === "NO_DATA") return "尚无数据";
  return "正常";
}

function levelChip(level: string, stale: boolean) {
  const shown = stale ? "STALE" : level;
  const tone = shown === "ABNORMAL"
    ? "bg-red-500/10 text-red-600 dark:text-red-400"
    : shown === "STALE" || shown === "NO_DATA"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : shown === "UNCONFIGURED"
        ? "bg-ink/[0.06] text-ink/50"
        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  return `shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tone}`;
}

function ageText(seconds: number | null) {
  if (seconds == null) return "还没有成功记录";
  const value = Math.max(0, Math.floor(seconds));
  if (value < 60) return `${value} 秒前`;
  const minutes = Math.floor(value / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟前`;
}

export default function MonitorAdmin() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [alertError, setAlertError] = useState("");
  const [loading, setLoading] = useState(false);
  const [acking, setAcking] = useState<number | null>(null);
  const flight = useRef(false);
  const mounted = useRef(false);
  const hasData = useRef(false);

  const refresh = useCallback(async () => {
    if (flight.current) return;
    flight.current = true;
    setLoading(true);
    try {
      const [next, nextAlerts] = await Promise.all([
        get<Overview>("/admin/monitor/overview"),
        get<AlertItem[]>("/admin/monitor/alerts").catch(() => {
          if (mounted.current) setAlertError("告警列表加载失败");
          return null;
        }),
      ]);
      if (!mounted.current) return;
      hasData.current = true;
      setOverview(next);
      if (nextAlerts) {
        setAlerts(nextAlerts);
        setAlertError("");
      }
      setStale(false);
      setError("");
    } catch {
      if (!mounted.current) return;
      setStale(true);
      setError(hasData.current ? "数据已过期，下面是上次读到的数字，不能当作当前正常。" : "数据已过期，这次没有读到运行状态。");
    } finally {
      flight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const tick = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(tick, 20_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  async function ack(id: number) {
    setAcking(id);
    try {
      await post<AlertItem>(`/admin/monitor/alerts/${id}/ack`, {});
      await refresh();
    } catch {
      setAlertError("确认失败，请重试");
    } finally {
      setAcking(null);
    }
  }

  const updated = overview ? new Date(overview.generatedAt).toLocaleTimeString() : "";

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight">运行监测</h1>
          <p className="mt-1 text-xs leading-5 text-ink/50">只看收款、发货和扫链。刷新不会去探测链或支付渠道。</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink/50">
          {updated && !stale && <span>更新于 {updated}</span>}
          <button className="btn-ghost !py-2" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />刷新
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mb-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">{error}</p>}

      <section className="card p-5" aria-label="整体状态">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">整体状态</h2>
          <span className={levelChip(overview?.level ?? "NO_DATA", stale)}>{stale ? "数据已过期" : overview ? levelLabel(overview.level, false) : "正在读取"}</span>
        </div>
        <p className="mt-3 text-sm text-ink/70">
          未处理告警 <b className="text-ink">{stale ? "—" : (overview?.unackedAlerts ?? "—")}</b>
          <span className="text-ink/45"> / 未恢复 {stale ? "—" : (overview?.openAlerts ?? "—")}</span>
        </p>
      </section>

      {!overview && !error && <p className="mt-4 text-sm text-ink/50">正在读取运行状态…</p>}

      {overview && (
        <>
          <section className="mt-5" aria-label="链上扫描">
            <h2 className="mb-3 text-sm font-semibold">链上扫描</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {overview.chains.map((chain) => (
                <article key={chain.chain} className="card min-w-0 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold">{chain.chain}</h3>
                    <span className={levelChip(chain.level, stale)}>{levelLabel(chain.level, stale)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-ink/70">
                    {chain.level === "UNCONFIGURED" ? "这条链没有启用。" : chain.level === "NO_DATA" ? "启动后还没有成功扫描。没有待付订单也不代表扫链坏了。" : `最近成功 ${ageText(chain.lastSuccessAgeSeconds)}`}
                  </p>
                  {chain.level !== "UNCONFIGURED" && (
                    <dl className="mt-3 space-y-1 text-xs leading-5 text-ink/55">
                      <div className="flex justify-between gap-3"><dt>扫描高度</dt><dd className="font-mono">{chain.scannedBlock ?? "—"}</dd></div>
                      <div className="flex justify-between gap-3"><dt>落后区块</dt><dd className="font-mono">{chain.blockLag ?? "—"}</dd></div>
                      <div className="flex justify-between gap-3"><dt>连续失败</dt><dd className="font-mono">{chain.consecutiveFailures}</dd></div>
                    </dl>
                  )}
                  {chain.lastError && <p className="mt-2 break-all text-xs leading-5 text-ink/45">最近错误：{chain.lastError}</p>}
                </article>
              ))}
            </div>
          </section>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <section className="card min-w-0 p-5" aria-label="定时任务">
              <h2 className="font-bold">定时任务</h2>
              <ul className="mt-3 space-y-3">
                {overview.tasks.map((task) => (
                  <li key={task.key} className="min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{task.name}</span>
                      <span className={levelChip(task.level, stale)}>{levelLabel(task.level, stale)}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-ink/55">{task.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card min-w-0 p-5" aria-label="系统资源">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold">系统资源</h2>
                <span className={levelChip(overview.resources.level, stale)}>{levelLabel(overview.resources.level, stale)}</span>
              </div>
              <dl className="mt-3 space-y-2 text-sm text-ink/70">
                <div className="flex justify-between gap-3"><dt>JVM 堆内存</dt><dd>{overview.resources.heapPercent == null ? "尚无数据" : `${overview.resources.heapPercent}%`}</dd></div>
                <div className="flex justify-between gap-3"><dt>数据库连接</dt><dd>{overview.resources.poolReadable ? `${overview.resources.poolActive} / ${overview.resources.poolMax}，等待 ${overview.resources.poolPending}` : "不可读"}</dd></div>
                <div className="flex justify-between gap-3"><dt>异步队列</dt><dd>{overview.resources.asyncQueued == null ? "尚无数据" : `${overview.resources.asyncQueued} / ${overview.resources.asyncCapacity}`}</dd></div>
                <div className="flex justify-between gap-3"><dt>磁盘剩余</dt><dd>{overview.resources.diskFreeMb == null ? "尚无数据" : `${overview.resources.diskFreeMb} MB（${overview.resources.diskFreePercent}%）`}</dd></div>
              </dl>
              <p className="mt-3 text-xs leading-5 text-ink/50">{overview.resources.detail}</p>
            </section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="card min-w-0 p-5" aria-label="支付与发货">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold">支付与发货</h2>
                <span className={levelChip(overview.fulfillment.level, stale)}>{levelLabel(overview.fulfillment.level, stale)}</span>
              </div>
              <ul className="mt-3 space-y-1 text-sm leading-6 text-ink/70">
                <li>自动发卡 {overview.fulfillment.autoCard} 单{overview.fulfillment.autoCard > 0 ? `，最早 ${ageText(overview.fulfillment.autoCardOldestSeconds)}` : ""}</li>
                <li>预售凭证 {overview.fulfillment.presale} 单{overview.fulfillment.presale > 0 ? `，最早 ${ageText(overview.fulfillment.presaleOldestSeconds)}` : ""}</li>
                <li>充值未入账 {overview.fulfillment.recharge} 单{overview.fulfillment.recharge > 0 ? `，最早 ${ageText(overview.fulfillment.rechargeOldestSeconds)}` : ""}</li>
                <li>人工发货 {overview.fulfillment.manual} 单，时限 {Math.round(overview.manualStuckAfterSeconds / 3600)} 小时{overview.fulfillment.manual > 0 ? `，最早 ${ageText(overview.fulfillment.manualOldestSeconds)}` : ""}</li>
                <li>迟到收款 {overview.fulfillment.latePaid} 笔</li>
                <li>确认中的意向 {overview.fulfillment.confirming} 笔{overview.fulfillment.confirmingOldestSeconds != null ? `，最早 ${ageText(overview.fulfillment.confirmingOldestSeconds)}` : ""}</li>
              </ul>
              {overview.fulfillment.readFailed && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">这次没有完整读到订单，不能把 0 当成正常。</p>}
            </section>
            <section className="card min-w-0 p-5" aria-label="通知与安全">
              <h2 className="font-bold">通知</h2>
              <ul className="mt-3 space-y-2">
                {overview.notifications.map((row) => (
                  <li key={row.channel} className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 text-sm leading-6 text-ink/70">{row.detail}</p>
                    <span className={levelChip(row.level, stale)}>{levelLabel(row.level, stale)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between gap-2">
                <h2 className="font-bold">安全事件</h2>
                <span className={levelChip(overview.security.level, stale)}>{levelLabel(overview.security.level, stale)}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-ink/55">
                近 15 分钟登录失败 {overview.security.loginFailures15m} 次，限流 {overview.security.rateLimits15m} 次，新封禁 {overview.security.bans15m} 次，当前封禁 {overview.security.activeBans} 个。审计连续失败 {overview.security.auditConsecutiveFailures} 次。
              </p>
            </section>
          </div>

          <section className="card mt-4 min-w-0 p-5" aria-label="异常列表">
            <h2 className="font-bold">需要处理</h2>
            {overview.issues.length === 0 ? (
              <p className="mt-3 text-sm text-ink/55">当前没有需要处理的异常。没有新订单不等于扫链故障。</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {overview.issues.map((issue) => (
                  <li key={issue.key} className="min-w-0 rounded-2xl bg-ink/[0.03] px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{issue.title}</p>
                      <span className={levelChip(issue.level, stale)}>{levelLabel(issue.level, stale)}</span>
                    </div>
                    <p className="mt-1 break-all text-xs leading-5 text-ink/60">{issue.detail}</p>
                    {issue.href && <Link to={issue.href} className="mt-2 inline-block text-xs font-bold text-primary hover:underline">查看对应订单</Link>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card mt-4 min-w-0 p-5" aria-label="告警">
            <h2 className="font-bold">告警</h2>
            <p className="mt-1 text-xs leading-5 text-ink/50">确认只表示已经看见，故障恢复后才会单独通知一次。同类告警 30 分钟内不重复发送。</p>
            {alertError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{alertError}</p>}
            {alerts.length === 0 ? <p className="mt-3 text-sm text-ink/55">没有告警记录。</p> : (
              <ul className="mt-3 space-y-3">
                {alerts.map((alert) => (
                  <li key={alert.id} className="min-w-0 rounded-2xl border border-ink/10 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{alert.status === "RECOVERED" ? `已恢复 · ${alert.title}` : alert.title}</p>
                      {alert.status === "OPEN" && !alert.ackedAt && (
                        <button className="btn-ghost !py-1.5 text-xs" disabled={acking === alert.id || stale} onClick={() => void ack(alert.id)}>确认已看见</button>
                      )}
                      {alert.ackedAt && <span className="text-[11px] text-ink/45">已由 {alert.ackedBy ?? "管理员"} 看见</span>}
                    </div>
                    <p className="mt-1 break-all text-xs leading-5 text-ink/60">{alert.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <p className="mt-4 break-all text-xs leading-5 text-ink/45">
        渠道配置齐全不代表渠道真的可用，本页不会替你去打渠道。整台服务器挂掉时，这个页面和本机 Telegram 会一起失效，请在另一台机器上定时运行 scripts/external-healthcheck.sh。
      </p>
    </div>
  );
}
