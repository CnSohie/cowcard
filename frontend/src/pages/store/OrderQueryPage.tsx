import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CheckCircle2, Copy, History, KeyRound, Search, ShieldCheck, TicketCheck, X } from "lucide-react";
import { ApiError, post, type OrderView } from "../../lib/api";
import { consumePresaleVoucherToken, findLocalOrder, forgetOrder, localOrders, rememberOrder, type LocalOrder } from "../../lib/orderHistory";
import { money } from "../../lib/currency";

const STATUS_LABEL: Record<string, [string, string]> = {
  PENDING: ["待支付", "text-amber-600 dark:text-amber-400"],
  PAID: ["已支付 · 待处理", "text-sky-600 dark:text-sky-400"],
  DELIVERED: ["已发货", "text-emerald-600 dark:text-emerald-400"],
  EXPIRED: ["已超时关闭", "text-ink/40"],
  CLOSED: ["已关闭", "text-ink/40"],
  REFUNDED: ["已退款", "text-ink/40"],
};

function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function OrderQueryPage() {
  const location = useLocation() as { state?: { orderNo?: string; contact?: string; queryToken?: string } };
  const [orderNo, setOrderNo] = useState(location.state?.orderNo ?? "");
  const [contact, setContact] = useState(location.state?.contact ?? "");
  const [queryPassword, setQueryPassword] = useState("");
  const [queryToken, setQueryToken] = useState(location.state?.queryToken ?? "");
  const [order, setOrder] = useState<OrderView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(-1);
  const [history, setHistory] = useState<LocalOrder[]>(() => localOrders());
  const [revealedPresaleToken, setRevealedPresaleToken] = useState<string | null>(null);
  const autoQueryKey = useRef("");

  // 从支付页跳来时:若本机历史里有这单,自动补全凭证并直接展示结果
  useEffect(() => {
    const no = location.state?.orderNo;
    if (no) {
      const hit = findLocalOrder(no);
      const token = location.state?.queryToken || hit?.queryToken || "";
      const savedContact = location.state?.contact || hit?.contact || "";
      if (savedContact) setContact((c) => c || savedContact);
      if (token) setQueryToken(token);
      if (token && autoQueryKey.current !== `${no}:${token}`) {
        autoQueryKey.current = `${no}:${token}`;
        void doQuery(no, savedContact, token);
      }
    }
  }, [location.state?.contact, location.state?.orderNo, location.state?.queryToken]);

  async function doQuery(no: string, ct: string, token = queryToken) {
    setBusy(true);
    setError("");
    setOrder(null);
    setRevealedPresaleToken(null);
    try {
      const r = await post<OrderView>("/orders/query", {
        orderNo: no.trim(),
        contact: ct.trim() || undefined,
        queryPassword: token ? undefined : queryPassword || undefined,
        queryToken: token || undefined,
      });
      setOrder(r);
      // 查询成功 → 留存/刷新本机凭证(其他设备下的单也能被记住)
      const previous = findLocalOrder(r.orderNo);
      const oneTimePresaleToken = previous?.presaleVoucherToken ?? null;
      const savedContact = ct.trim() || previous?.contact || "";
      rememberOrder({
        orderNo: r.orderNo, contact: savedContact, productName: r.productName,
        amount: String(r.amount), createdAt: r.createdAt, queryToken: token || undefined,
        presaleVoucherToken: previous?.presaleVoucherToken,
      }, { bump: !previous });
      if (oneTimePresaleToken) {
        setRevealedPresaleToken(oneTimePresaleToken);
        consumePresaleVoucherToken(r.orderNo);
      }
      setHistory(localOrders());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "查询失败");
    } finally {
      setBusy(false);
    }
  }

  function quickQuery(h: LocalOrder) {
    setOrderNo(h.orderNo);
    setContact(h.contact);
    setQueryToken(h.queryToken ?? "");
    void doQuery(h.orderNo, h.contact, h.queryToken ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removeHistory(no: string) {
    forgetOrder(no);
    setHistory(localOrders());
  }

  function copyCard(text: string, i: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(i);
      setTimeout(() => setCopied(-1), 1500);
    });
  }

  const statusInfo = order ? STATUS_LABEL[order.status] ?? [order.status, "text-ink/50"] : null;
  const localOrder = order ? findLocalOrder(order.orderNo) : null;
  const fmtPresaleTime = (s: string | null) => s ? new Date(s).toLocaleString() : "商家另行公告";

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <div className="card p-7 md:p-8">
        <h1 className="mb-6 flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <Search size={19} /> 订单查询
        </h1>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">订单号</label>
            <input className="input font-mono" placeholder="2026…" value={orderNo}
              onChange={(e) => { setOrderNo(e.target.value); setQueryToken(""); }} />
          </div>
          <div>
            <label className="label">下单邮箱</label>
            <input className="input" placeholder="you@example.com" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <label className="label">查询密码(下单时设置过才需要)</label>
          <input className="input" type="password" placeholder="选填" value={queryPassword} onChange={(e) => setQueryPassword(e.target.value)} />
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        <button className="btn-primary mt-5 w-full !py-3.5" disabled={busy || !orderNo || (!contact && !queryToken)}
          onClick={() => doQuery(orderNo, contact)}>
          {busy ? "查询中…" : "查询订单"}
        </button>
      </div>

      {order && statusInfo && (
        <div className="card mt-5 animate-fade-up p-7 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">{order.productName} × {order.quantity}</h2>
            <span className={`text-sm font-semibold ${statusInfo[1]}`}>{statusInfo[0]}</span>
          </div>
          <p className="mt-1 text-xs text-ink/40">
            订单 {order.orderNo} · {money(order.amount)}
            {Number(order.discountAmount) > 0 && ` · 已优惠 ${money(order.discountAmount)}`}
            {" · "}{new Date(order.createdAt).toLocaleString()}
          </p>

          {order.cards.length > 0 && (
            <div className="mt-6">
              <label className="label flex items-center gap-1.5"><KeyRound size={13} /> 卡密(点击复制)</label>
              <div className="space-y-2">
                {order.cards.map((c, i) => (
                  <button key={i} onClick={() => copyCard(c, i)}
                    className="group flex w-full items-center justify-between gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-left transition hover:brightness-95">
                    <code className="break-all font-mono text-sm font-semibold">{c}</code>
                    {copied === i ? <CheckCircle2 size={15} className="shrink-0 text-primary" /> : <Copy size={15} className="shrink-0 text-ink/40 group-hover:text-ink" />}
                  </button>
                ))}
              </div>
            </div>
          )}
          {order.deliveryContent && (
            <div className="mt-6">
              <label className="label flex items-center gap-1.5"><KeyRound size={13} /> 交付内容(点击复制)</label>
              <button onClick={() => copyCard(order.deliveryContent ?? "", 9999)}
                className="group flex w-full items-center justify-between gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-left transition hover:brightness-95">
                <code className="whitespace-pre-wrap break-all font-mono text-sm font-semibold">{order.deliveryContent}</code>
                {copied === 9999 ? <CheckCircle2 size={15} className="shrink-0 text-primary" /> : <Copy size={15} className="shrink-0 text-ink/40 group-hover:text-ink" />}
              </button>
            </div>
          )}
          {order.deliveryMode === "MANUAL" && order.status === "PAID" && (
            <p className="mt-5 rounded-2xl bg-sky-500/10 px-4 py-3 text-xs leading-relaxed text-sky-600 dark:text-sky-400">
              订单已付款,正在等待后台人工发货。处理完成后这里会显示交付内容。
            </p>
          )}
          {order.deliveryMode === "PRESALE_VOUCHER" && (
            <div className="mt-6 rounded-2xl border border-primary/15 bg-accent-soft/60 p-4">
              <label className="label flex items-center gap-1.5"><TicketCheck size={13} /> 电子预售提货码</label>
              {revealedPresaleToken ? (
                <button onClick={() => copyCard(revealedPresaleToken, 8888)}
                  className="group flex w-full items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-left transition hover:brightness-95">
                  <code className="break-all font-mono text-sm font-semibold">{revealedPresaleToken}</code>
                  {copied === 8888 ? <CheckCircle2 size={15} className="shrink-0 text-primary" /> : <Copy size={15} className="shrink-0 text-ink/40 group-hover:text-ink" />}
                </button>
              ) : (
                <p className="rounded-2xl bg-surface px-4 py-3 text-xs leading-relaxed text-ink/55">
                  当前订单的提货码提示为 <span className="font-mono font-semibold text-ink/75">{order.presaleVoucherHint ?? "-"}</span>。明文提货码只在下单浏览器展示一次,平台仅保存不可逆哈希,丢失后无法找回。
                </p>
              )}
              <div className="mt-3 grid gap-2 text-xs leading-relaxed text-ink/55 sm:grid-cols-2">
                <p><span className="font-medium text-ink/70">开放提货:</span> {fmtPresaleTime(order.presaleStartAt)}</p>
                <p><span className="font-medium text-ink/70">最晚截止:</span> {fmtPresaleTime(order.presaleEndAt)}</p>
              </div>
              {(order.presaleVoucherStatus || order.presaleFulfillmentNote) && (
                <p className="mt-3 rounded-2xl bg-surface px-4 py-3 text-xs leading-relaxed text-ink/55">
                  <span className="font-medium text-ink/70">凭证状态:</span> {order.presaleVoucherStatus ?? "-"}
                  {order.presaleFulfillmentNote ? ` · ${order.presaleFulfillmentNote}` : ""}
                </p>
              )}
              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink/45">
                <ShieldCheck size={12} className="mt-0.5 shrink-0" /> 谁持有提货码谁拥有兑换权;登录会员后可提前核销绑定账号。核销后凭证立即销毁,后续在会员中心查询履约状态。
              </p>
              <Link to="/redeem" className="btn-primary mt-4 w-full !py-3">
                前往提货兑换中心
              </Link>
            </div>
          )}
          {order.usageNote && (
            <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-ink/[0.06] p-4 text-xs leading-relaxed text-ink/60">
              {order.usageNote}
            </div>
          )}
          {order.status === "PENDING" && (
            <Link to={`/pay/${order.orderNo}`} className="btn-primary mt-5 w-full !py-3">
              前往支付(已转账可提交 TXID 自助核销)
            </Link>
          )}
        </div>
      )}

      {/* 本机购买记录:一键回查,不用翻邮箱 */}
      {history.length > 0 && (
        <div className="card mt-5 p-6 md:p-7">
          <p className="label !mb-3 flex items-center gap-1.5">
            <History size={13} /> 本机购买记录(仅保存在此浏览器,可随时删除)
          </p>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.orderNo}
                className="flex items-center gap-3 rounded-2xl border border-ink/[0.06] px-4 py-3 transition hover:border-ink/15">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{h.productName}</p>
                  <p className="truncate font-mono text-[11px] text-ink/40">
                    {h.orderNo} · {money(h.amount)} · {fmtDate(h.createdAt)}
                  </p>
                </div>
                <button className="btn-ghost shrink-0 !px-3.5 !py-1.5 text-xs" disabled={busy} onClick={() => quickQuery(h)}>
                  查询
                </button>
                <button title="从本机删除该记录" onClick={() => removeHistory(h.orderNo)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink/30 transition hover:bg-ink/[0.05] hover:text-red-500">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ink/35">设置过查询密码的订单,回查时仍需在上方填写密码。</p>
        </div>
      )}
    </div>
  );
}
