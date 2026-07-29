import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle, Ban, ChevronLeft, ChevronRight, HandCoins, KeyRound, Loader2,
  PackageCheck, RefreshCw, Search, TicketCheck, Wallet, X,
} from "lucide-react";
import { ApiError, get, post, type OrderView } from "../../lib/api";
import SensitiveConfirm from "../../components/SensitiveConfirm";
import { money } from "../../lib/currency";

/** 订单管理:状态筛选 + 单号/邮箱搜索 + 右侧详情抽屉(卡密/补单/关单)。 */

interface AdminOrder {
  id: number; orderNo: string; orderType: "GOODS" | "RECHARGE"; memberId: number | null;
  productName: string; unitPrice: string; quantity: number; amount: string;
  discountAmount: string; walletPaidAmount: string; couponCode: string | null; contact: string; status: string;
  paidChannel: string | null; buyerIp: string | null; createdAt: string;
  expireAt: string; paidAt: string | null; deliveredAt: string | null;
  deliveryMode: "AUTO_CARD" | "MANUAL" | "PRESALE_VOUCHER"; buyerNote: string | null; deliveryContent: string | null;
}
interface PageResult<T> { items: T[]; total: number; page: number; size: number; }

const SIZE = 20;

const STATUS_META: Record<string, { label: string; pill: string; dot: string }> = {
  PENDING:   { label: "待支付", pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  PAID:      { label: "已支付", pill: "bg-sky-500/10 text-sky-600 dark:text-sky-400", dot: "bg-sky-500" },
  DELIVERED: { label: "已发货", pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  EXPIRED:   { label: "已超时", pill: "bg-ink/[0.06] text-ink/45", dot: "bg-ink/30" },
  CLOSED:    { label: "已关闭", pill: "bg-ink/[0.06] text-ink/45", dot: "bg-ink/30" },
  REFUNDED:  { label: "已退款", pill: "bg-violet-500/10 text-violet-600 dark:text-violet-400", dot: "bg-violet-500" },
};

const TABS: [string, string][] = [
  ["", "全部"], ["PENDING", "待支付"], ["PAID", "已支付"], ["DELIVERED", "已发货"],
  ["EXPIRED", "已超时"], ["CLOSED", "已关闭"], ["REFUNDED", "已退款"],
];

const CHANNEL_LABEL: Record<string, string> = {
  ALIPAY_OFFICIAL: "支付宝", EPAY: "支付宝(聚合)", CRYPTO_TRANSFER: "链上转账",
  CRYPTO_WALLET: "钱包直付", BALANCE: "余额支付", MANUAL: "人工补单",
};

function fmt(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, pill: "bg-ink/[0.06] text-ink/45", dot: "bg-ink/30" };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${m.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} /> {m.label}
    </span>
  );
}

export default function OrdersAdmin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialLatePaid = searchParams.get("latePaid") === "1";
  const [status, setStatus] = useState(initialLatePaid ? "" : (searchParams.get("status") ?? ""));
  const [latePaid, setLatePaid] = useState(initialLatePaid);
  const [q, setQ] = useState("");
  const [kw, setKw] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PageResult<AdminOrder> | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 详情抽屉
  const [detail, setDetail] = useState<AdminOrder | null>(null);
  const [cards, setCards] = useState<OrderView | null>(null);
  const [actBusy, setActBusy] = useState("");
  const [actErr, setActErr] = useState("");
  // 敏感操作确认(密码 + 2FA)
  const [sensitive, setSensitive] = useState<"paid" | "close" | "refund" | "deliver" | "manualDeliver" | "cards" | null>(null);
  const [manualContent, setManualContent] = useState("");

  function selectStatus(v: string) {
    setLatePaid(false);
    setStatus(v);
    setPage(1);
    setSearchParams(v ? { status: v } : {});
  }

  function selectLatePaid() {
    setLatePaid(true);
    setStatus("");
    setPage(1);
    setSearchParams({ latePaid: "1" });
  }

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    get<PageResult<AdminOrder>>("/admin/orders", {
      status: status || undefined, latePaid: latePaid || undefined, q: kw || undefined, page: page - 1, size: SIZE,
    })
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "订单加载失败,请检查后端日志"))
      .finally(() => setLoading(false));
    get<Record<string, number>>("/admin/orders/stats").then(setStats).catch(() => void 0);
  }, [status, latePaid, kw, page]);
  useEffect(load, [load]);

  // 抽屉打开时锁滚动 + ESC 关闭
  useEffect(() => {
    if (!detail) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDrawer();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  function openDrawer(o: AdminOrder) {
    setDetail(o);
    setCards(null);
    setManualContent(o.deliveryContent ?? "");
    setActErr("");
  }
  function closeDrawer() {
    setDetail(null);
  }

  async function viewCards(orderNo: string, auth: { password: string; totpCode: string }) {
    setActBusy("cards");
    setActErr("");
    try {
      setCards(await post<OrderView>(`/admin/orders/${orderNo}/cards/view`, auth));
    } catch (e) {
      setActErr(e instanceof ApiError ? e.message : "卡密查询失败");
      throw e;
    } finally {
      setActBusy("");
    }
  }

  /** 敏感操作执行(由 SensitiveConfirm 弹层携带密码+动态码调用)。 */
  async function execSensitive(kind: "paid" | "close" | "refund" | "deliver" | "manualDeliver" | "cards", auth: { password: string; totpCode: string }) {
    if (!detail) return;
    if (kind === "cards") {
      await viewCards(detail.orderNo, auth);
    } else if (kind === "paid") {
      const ok = await post<boolean>(`/admin/orders/${detail.orderNo}/mark-paid`, auth);
      if (!ok) throw new Error("补单失败:订单当前状态不允许(可能已支付或已人工关闭),请刷新查看");
      setDetail((d) => d && { ...d, status: "PAID" });
    } else if (kind === "close") {
      const ok = await post<boolean>(`/admin/orders/${detail.orderNo}/close`, auth);
      if (!ok) throw new Error("关闭失败:订单已不是待支付状态(可能刚被支付),请刷新查看");
      setDetail((d) => d && { ...d, status: "CLOSED" });
    } else if (kind === "refund") {
      const ok = await post<boolean>(`/admin/orders/${detail.orderNo}/refund-recharge`, auth);
      if (!ok) throw new Error("撤销失败:订单已经是退款状态,请刷新查看");
      setDetail((d) => d && { ...d, status: "REFUNDED" });
    } else if (kind === "deliver") {
      const ok = await post<boolean>(`/admin/orders/${detail.orderNo}/deliver`, auth);
      if (!ok) throw new Error("补发失败:订单当前状态不是已支付待发货,请刷新查看");
      setDetail((d) => d && { ...d, status: "DELIVERED", deliveredAt: new Date().toISOString() });
      setCards(null);
    } else {
      const ok = await post<boolean>(`/admin/orders/${detail.orderNo}/manual-deliver`, {
        ...auth,
        content: manualContent.trim(),
      });
      if (!ok) throw new Error("交付失败:订单当前状态不是已支付待发货,请刷新查看");
      setDetail((d) => d && {
        ...d,
        status: "DELIVERED",
        deliveredAt: new Date().toISOString(),
        deliveryContent: manualContent.trim(),
      });
    }
    setSensitive(null);
    if (kind !== "cards") load();
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / SIZE)) : 1;
  const isRecharge = detail?.orderType === "RECHARGE";
  const isManualGoods = detail?.orderType === "GOODS" && detail.deliveryMode === "MANUAL";

  function actionPanel(compact = false) {
    if (!detail) return null;
    return (
      <div className={compact ? "rounded-2xl border border-ink/[0.08] bg-surface p-4" : ""}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-ink">订单操作</p>
            <p className="mt-0.5 text-[11px] text-ink/40">
              {detail.orderType === "RECHARGE"
                ? "充值单可取消、人工入账或撤销充值"
                : detail.deliveryMode === "PRESALE_VOUCHER"
                  ? "预售订单付款后签发电子提货码,核销和履约在前台兑换中心完成"
                  : detail.deliveryMode === "MANUAL"
                  ? "人工商品可关闭、补单或填写交付内容"
                  : "商品单可关闭释放库存、人工补单或补发卡密"}
            </p>
          </div>
          <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-[10px] font-semibold text-ink/45">
            2FA
          </span>
        </div>
        {detail.status === "PENDING" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button className="btn-ghost flex-1" onClick={() => setSensitive("close")}>
              <Ban size={14} /> {detail.orderType === "RECHARGE" ? "取消充值" : detail.deliveryMode === "PRESALE_VOUCHER" ? "关闭并作废提货码" : "关闭并释放库存"}
            </button>
            <button className="btn-primary flex-1" onClick={() => setSensitive("paid")}>
              <HandCoins size={14} /> {detail.orderType === "RECHARGE" ? "人工入账" : "人工补单"}
            </button>
          </div>
        ) : detail.status === "EXPIRED" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button className="btn-ghost flex-1" onClick={closeDrawer}>关闭</button>
            <button className="btn-primary flex-1" onClick={() => setSensitive("paid")}>
              <HandCoins size={14} /> {detail.orderType === "RECHARGE" ? "补记充值入账" : detail.deliveryMode === "PRESALE_VOUCHER" ? "补单并签发提货码" : detail.deliveryMode === "MANUAL" ? "补单待人工发货" : "补单并回占库存"}
            </button>
          </div>
        ) : detail.orderType === "GOODS" && detail.status === "PAID" && detail.deliveryMode !== "PRESALE_VOUCHER" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button className="btn-ghost flex-1" onClick={closeDrawer}>关闭</button>
            <button className="btn-primary flex-1" onClick={() => setSensitive(detail.deliveryMode === "MANUAL" ? "manualDeliver" : "deliver")}>
              <PackageCheck size={14} /> {detail.deliveryMode === "MANUAL" ? "完成人工发货" : "补发卡密"}
            </button>
          </div>
        ) : detail.orderType === "RECHARGE" && ["PAID", "DELIVERED"].includes(detail.status) ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button className="btn-ghost flex-1" onClick={closeDrawer}>关闭</button>
            <button className="btn-ghost flex-1 !text-red-500" onClick={() => setSensitive("refund")}>
              <Ban size={14} /> 撤销充值
            </button>
          </div>
        ) : (
          <p className="rounded-2xl bg-ink/[0.04] px-4 py-3 text-xs text-ink/45">
            当前状态无需人工处理。
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold tracking-tight">订单管理</h1>
        <button className="btn-ghost !py-2" onClick={load}><RefreshCw size={14} /> 刷新</button>
      </div>

      {/* 筛选:分段式状态选择(色点 + 实时计数)+ 搜索 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-ink/[0.05] p-1">
          {TABS.map(([v, l]) => {
            const n = v === "" ? stats.ALL : stats[v];
            const active = status === v;
            const meta = v ? STATUS_META[v] : null;
            return (
              <button key={v}
                onClick={() => selectStatus(v)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  active && !latePaid ? "bg-surface text-ink shadow-sm" : "text-ink/50 hover:text-ink"
                }`}>
                {meta && <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${active && !latePaid ? "" : "opacity-60"}`} />}
                {l}
                {n != null && (
                  v === "PENDING" && n > 0 ? (
                    <span className="rounded-full bg-amber-500/15 px-1.5 py-px font-mono text-[10px] font-bold tabular-nums text-amber-600 dark:text-amber-400">{n}</span>
                  ) : (
                    <span className="font-mono text-[10px] tabular-nums opacity-45">{n}</span>
                  )
                )}
              </button>
            );
          })}
          <button
            onClick={selectLatePaid}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition ${
              latePaid ? "bg-surface text-amber-600 shadow-sm dark:text-amber-400" : "text-ink/50 hover:text-ink"
            }`}
            title="已有成功支付流水,但订单仍超时或关闭,需要人工核实补单">
            <AlertTriangle size={12} />
            迟到到账
            {(stats.LATE_PAID ?? 0) > 0 && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-px font-mono text-[10px] font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {stats.LATE_PAID}
              </span>
            )}
          </button>
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
          <input className="input !py-2 !pl-10 text-xs" placeholder="订单号 / 联系邮箱,回车搜索" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setKw(q.trim()), setPage(1))} />
        </div>
      </div>

      {latePaid && (
        <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          当前只显示已有成功支付流水、但订单仍处于超时或关闭状态的异常单。处理前请核对渠道流水,再用详情里的人工补单恢复库存/优惠券/钱包抵扣。
        </div>
      )}

      {error && <p className="mb-3 rounded-xl bg-red-500/10 px-4 py-2.5 text-xs text-red-500">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[880px]">
          <thead><tr>
            <th className="th">订单</th><th className="th">商品</th><th className="th">金额</th>
            <th className="th">买家</th><th className="th">状态</th><th className="th">渠道</th>
            <th className="th">创建时间</th>
          </tr></thead>
          <tbody>
            {loading && !data && (
              <tr><td className="td py-16 text-center text-ink/40" colSpan={7}>
                <Loader2 size={18} className="mx-auto animate-spin" />
              </td></tr>
            )}
            {(data?.items ?? []).map((o) => (
              <tr key={o.id} className="cursor-pointer transition hover:bg-ink/[0.03]" onClick={() => openDrawer(o)}>
                <td className="td">
                  <p className="font-mono text-xs font-medium text-ink">{o.orderNo}</p>
                  {o.orderType === "RECHARGE" && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                      <Wallet size={9} /> 余额充值
                    </span>
                  )}
                </td>
                <td className="td max-w-[220px]">
                <p className="truncate">{o.productName}{o.orderType === "GOODS" && ` ×${o.quantity}`}</p>
                  {o.orderType === "GOODS" && o.deliveryMode === "MANUAL" && (
                    <p className="mt-1 text-[11px] text-sky-600 dark:text-sky-400">人工发货</p>
                  )}
                  {o.orderType === "GOODS" && o.deliveryMode === "PRESALE_VOUCHER" && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-400">
                      <TicketCheck size={10} /> 预售提货码
                    </p>
                  )}
                </td>
                <td className="td">
                  <p className="font-semibold text-ink">{money(o.amount)}</p>
                  {Number(o.discountAmount) > 0 && <p className="text-[11px] text-ink/40">已优惠 {money(o.discountAmount)}</p>}
                </td>
                <td className="td text-xs">
                  <p className="max-w-[180px] truncate">{o.contact}</p>
                  {o.memberId && <p className="text-[11px] text-ink/40">会员 #{o.memberId}</p>}
                </td>
                <td className="td"><StatusPill status={o.status} /></td>
                <td className="td text-xs">{o.paidChannel ? (CHANNEL_LABEL[o.paidChannel] ?? o.paidChannel) : "—"}</td>
                <td className="td text-xs text-ink/50">{fmt(o.createdAt)}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr><td className="td py-14 text-center text-ink/45" colSpan={7}>
                {latePaid ? "目前没有迟到到账待处理订单" : "没有匹配的订单"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <button className="btn-ghost !px-3" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button>
          <span className="text-xs text-ink/45">{page} / {totalPages} 页 · 共 {data?.total ?? 0} 单</span>
          <button className="btn-ghost !px-3" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button>
        </div>
      )}

      {/* ── 订单详情抽屉 ── */}
      {detail && createPortal((
        <>
          <div className="drawer-mask" onClick={closeDrawer} />
          <aside className="drawer-panel">
            <header className="flex items-center justify-between border-b border-ink/[0.06] px-6 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <h2 className="truncate font-mono text-sm font-bold">{detail.orderNo}</h2>
                  <StatusPill status={detail.status} />
                </div>
                <p className="mt-0.5 text-xs text-ink/40">
                  {detail.orderType === "RECHARGE" ? "钱包余额充值" : "商品订单"} · 创建于 {fmt(detail.createdAt)}
                </p>
              </div>
              <button onClick={closeDrawer}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/45 transition hover:bg-ink/[0.06] hover:text-ink">
                <X size={17} />
              </button>
            </header>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {/* 金额 */}
              <div className="rounded-2xl bg-accent-soft/70 p-5">
                <p className="text-xs text-ink/50">{detail.productName}{detail.orderType === "GOODS" && ` × ${detail.quantity}`}</p>
                <p className="mt-1 text-3xl font-extrabold tracking-tight">{money(detail.amount)}</p>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink/45">
                  <span>单价 {money(detail.unitPrice)}</span>
                  {Number(detail.discountAmount) > 0 && <span>优惠 -{money(detail.discountAmount)}{detail.couponCode && `(${detail.couponCode})`}</span>}
                  {detail.paidChannel && <span>渠道 {CHANNEL_LABEL[detail.paidChannel] ?? detail.paidChannel}</span>}
                  {detail.orderType === "GOODS" && (
                    <span>{detail.deliveryMode === "PRESALE_VOUCHER" ? "预售提货码" : detail.deliveryMode === "MANUAL" ? "人工发货" : "自动卡密"}</span>
                  )}
                </div>
              </div>

              {actionPanel(true)}

              {/* 信息 */}
              <section>
                <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 买家信息</p>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4"><dt className="shrink-0 text-ink/45">联系方式</dt><dd className="break-all text-right">{detail.contact}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-ink/45">会员</dt><dd>{detail.memberId ? `#${detail.memberId}` : "游客"}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-ink/45">下单 IP</dt><dd className="font-mono text-xs">{detail.buyerIp ?? "—"}</dd></div>
                </dl>
              </section>

              {/* 时间线 */}
              <section>
                <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 时间线</p>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-ink/45">创建</dt><dd>{fmt(detail.createdAt)}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink/45">支付截止</dt><dd>{fmt(detail.expireAt)}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink/45">支付</dt><dd>{fmt(detail.paidAt)}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink/45">发货</dt><dd>{fmt(detail.deliveredAt)}</dd></div>
                </dl>
              </section>

              {isManualGoods && (
                <section>
                  <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 人工发货</p>
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-ink/[0.06] p-4">
                      <p className="mb-2 text-xs font-bold text-ink/55">买家提交信息</p>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink/70">
                        {detail.buyerNote || "—"}
                      </p>
                    </div>
                    {detail.deliveryContent && (
                      <div className="rounded-2xl bg-accent-soft/70 p-4">
                        <p className="mb-2 text-xs font-bold text-ink/55">已交付内容</p>
                        <p className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed">
                          {detail.deliveryContent}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* 卡密 */}
              {detail.orderType === "GOODS" && detail.deliveryMode === "AUTO_CARD" && (
                <section>
                  <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 卡密</p>
                  {cards ? (
                    cards.cards.length ? (
                      <div className="max-h-64 space-y-2 overflow-y-auto">
                        {cards.cards.map((c, i) => (
                          <code key={i} className="block break-all rounded-xl bg-ink/[0.05] p-3 font-mono text-xs">{c}</code>
                        ))}
                      </div>
                    ) : <p className="text-sm text-ink/45">该订单暂无卡密(未发货)</p>
                  ) : (
                    <button className="btn-ghost !py-2.5 text-xs" disabled={actBusy === "cards"}
                      onClick={() => setSensitive("cards")}>
                      {actBusy === "cards" ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                      查看明文卡密(需要 2FA,将记录审计)
                    </button>
                  )}
                </section>
              )}
            </div>

            {/* 操作(财务级:密码 + 2FA 双因子确认) */}
            <footer className="border-t border-ink/[0.06] bg-surface/95 px-6 py-4 shadow-[0_-12px_30px_rgba(0,0,0,0.04)]">
              {actErr && <p className="mb-2.5 text-xs text-red-500">{actErr}</p>}
              {actionPanel()}
            </footer>
          </aside>
        </>
      ), document.body)}

      {/* 双因子确认弹层 */}
      {sensitive && detail && (
        <SensitiveConfirm
          action={{
            title: sensitive === "paid"
              ? (isRecharge ? "人工充值入账" : "人工补单")
                : sensitive === "refund" ? "撤销充值"
                : sensitive === "deliver" ? "补发卡密"
                  : sensitive === "manualDeliver" ? "完成人工发货"
                    : sensitive === "cards" ? "查看明文卡密" : (isRecharge ? "取消充值" : "关闭订单"),
            confirmText: sensitive === "paid"
              ? (isRecharge ? "确认入账余额" : isManualGoods ? "确认补单待发货" : "确认补单并发货")
              : sensitive === "refund" ? "确认撤销充值"
                : sensitive === "deliver" ? "确认补发卡密"
                  : sensitive === "manualDeliver" ? "确认交付"
                    : sensitive === "cards" ? "确认查看卡密" : (isRecharge ? "确认取消充值" : "确认关闭并释放库存"),
            danger: sensitive === "close" || sensitive === "refund" || sensitive === "cards",
            summary: (
              <div className="space-y-1">
                <div className="flex justify-between gap-3">
                  <span className="text-ink/45">订单</span>
                  <span className="font-mono text-xs">{detail.orderNo}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink/45">{detail.productName}</span>
                  <span className="font-bold">{money(detail.amount)}</span>
                </div>
                {Number(detail.walletPaidAmount) > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-ink/45">钱包抵扣</span>
                    <span className="font-bold">{money(detail.walletPaidAmount)}</span>
                  </div>
                )}
                {sensitive === "paid" && (
                  <p className="pt-1 text-[11px] leading-relaxed text-ink/40">
                    {detail.status === "EXPIRED"
                      ? (Number(detail.walletPaidAmount) > 0
                          ? "这是超时订单补单:系统会先重新扣回已退的钱包抵扣,并恢复优惠券占用;若会员余额不足或库存不足,补单会被拒绝。请先核实渠道流水已实际到账。"
                          : "这是超时订单补单:系统会恢复优惠券占用;自动卡商品还会重新回占库存,库存不足会拒绝补单。请先核实渠道流水已实际到账。")
                      : isRecharge
                        ? "请先核实渠道流水已实际到账;确认后会把充值金额计入会员余额。"
                        : isManualGoods
                          ? "请先核实渠道流水已实际到账;确认后订单会进入已支付待人工发货。"
                          : "请先核实渠道流水已实际到账;确认后会立即尝试发货,操作不可撤销。"}
                  </p>
                )}
                {sensitive === "deliver" && (
                  <p className="pt-1 text-[11px] leading-relaxed text-ink/40">
                    适用于已支付但首次发卡失败的商品单;请先确认该商品已有足够未售卡密。
                  </p>
                )}
                {sensitive === "cards" && (
                  <p className="pt-1 text-[11px] leading-relaxed text-ink/40">
                    此操作会解密并展示已售卡密明文,仅用于售后核验,系统会写入审计日志。
                  </p>
                )}
              </div>
            ),
          }}
          onConfirm={(auth) => execSensitive(sensitive, auth)}
          onClose={() => setSensitive(null)}
        >
          {sensitive === "manualDeliver" && (
            <div className="mb-4">
              <label className="label">交付内容</label>
              <textarea
                className="input min-h-[120px] resize-none font-mono text-sm leading-relaxed"
                placeholder="填写要展示给买家的账号、密钥、开通结果或服务说明"
                value={manualContent}
                onChange={(e) => setManualContent(e.target.value)}
              />
              <p className="mt-2 text-[11px] leading-relaxed text-ink/40">提交后买家可在订单查询页看到此内容。</p>
            </div>
          )}
        </SensitiveConfirm>
      )}
    </div>
  );
}
