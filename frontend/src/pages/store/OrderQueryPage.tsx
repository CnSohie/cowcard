import SecretBlock from "../../components/SecretBlock";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { CheckCircle2, Copy, Loader2, History, KeyRound, Search, ShieldCheck, ShoppingBag, TicketCheck, X } from "lucide-react";
import { ApiError, post, type OrderView } from "../../lib/api";
import { consumePresaleVoucherToken, findLocalOrder, forgetOrder, localOrders, rememberOrder, type LocalOrder } from "../../lib/orderHistory";
import { recalledContact } from "../../lib/contactMemory";
import { useI18n } from "../../lib/i18n";
import { orderCopy } from "../../lib/orderCopy";
import { money } from "../../lib/currency";
import { CaptchaBox, captchaHeaders } from "../../lib/captcha";

interface PresaleVoucherClaim {
  token: string | null;
  tokenHint: string;
  status: string;
}


function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function OrderQueryPage() {
  const { lang } = useI18n();
  const t = orderCopy[lang];
  const STATUS_LABEL: Record<string, [string, string]> = {
    PENDING: [t.pending, "text-amber-600 dark:text-amber-400"],
    PAID: [t.paid, "text-sky-600 dark:text-sky-400"],
    DELIVERED: [t.delivered, "text-emerald-600 dark:text-emerald-400"],
    EXPIRED: [t.expired, "text-ink/40"],
    CLOSED: [t.closed, "text-ink/40"],
    REFUNDED: [t.refunded, "text-ink/40"],
  };
  const voucherStatuses: Record<string, string> = { WAITING_PAYMENT: t.pending, ACTIVE: t.voucherActive, REDEEMED: t.redeemed, FULFILLED: t.delivered, EXPIRED: t.expired, VOID: t.closed };
  const location = useLocation() as { state?: { orderNo?: string; contact?: string; queryToken?: string } };
  const [orderNo, setOrderNo] = useState(location.state?.orderNo ?? "");
  const [contact, setContact] = useState(() => location.state?.contact ?? recalledContact());
  const [queryPassword, setQueryPassword] = useState("");
  const [order, setOrder] = useState<OrderView | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [needsCredentials, setNeedsCredentials] = useState(false);
  const [error, setError] = useState<number | "captcha" | "failed" | null>(null);
  const errorText = error === "captcha" ? t.captcha : error === "failed" ? t.failed : error == null ? "" : (t.errors as Record<string, string>)[error] ?? t.failed;
  const [copied, setCopied] = useState(-1);
  const [historySearch, setHistorySearch] = useState("");
  const [manualOpen, setManualOpen] = useState(Boolean(location.state?.orderNo));
  const queryLock = useRef(false);
  const queryOpener = useRef<HTMLElement | null>(null);
  const [history, setHistory] = useState<LocalOrder[]>(() => localOrders());
  const [revealedPresaleToken, setRevealedPresaleToken] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const autoQueryKey = useRef("");
  const handleCaptchaToken = useCallback((token: string) => {
    setCaptchaToken(token);
    if (token) {
      setError((current) => current === "captcha" ? null : current);
    }
  }, []);
  const handleCaptchaEnabled = useCallback((enabled: boolean) => setCaptchaEnabled(enabled), []);

  // 从支付页跳来时:若本机历史里有这单,自动补全凭证并直接展示结果
  useEffect(() => {
    const no = location.state?.orderNo;
    if (no) {
      setOrderNo(no);
      setManualOpen(true);
      const hit = findLocalOrder(no);
      const token = location.state?.queryToken || hit?.queryToken || "";
      const savedContact = location.state?.contact || hit?.contact || "";
      if (savedContact) setContact(savedContact);
      if (token && autoQueryKey.current !== `${no}:${token}`) {
        autoQueryKey.current = `${no}:${token}`;
        void doQuery(no, savedContact, { queryToken: token });
      }
    }
  }, [location.state?.contact, location.state?.orderNo, location.state?.queryToken]);

  async function doQuery(no: string, ct: string, credential?: { queryToken?: string; historyToken?: string }) {
    if (queryLock.current) return;
    queryLock.current = true;
    if (!resultOpen) queryOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setResultOpen(true);
    setNeedsCredentials(false);
    setBusy(true);
    setError(null);
    setOrder(null);
    setCopied(-1);
    setRevealedPresaleToken(null);
    if (!credential && captchaEnabled && !captchaToken) {
      setError("captcha");
      setBusy(false);
      queryLock.current = false;
      setNeedsCredentials(true);
      return;
    }
    try {
      const payload = {
        orderNo: no.trim(),
        contact: ct.trim() || undefined,
        queryPassword: queryPassword || undefined,
      };
      const r = await post<OrderView>(credential ? "/orders/query-by-token" : "/orders/query", credential ? { orderNo: no.trim(), ...credential } : payload, { headers: captchaHeaders(captchaToken) });
      // 查询成功 → 留存/刷新本机凭证(其他设备下的单也能被记住)
      const previous = findLocalOrder(r.orderNo);
      let nextOrder = r;
      const presalePaid = r.deliveryMode === "PRESALE_VOUCHER" && ["PAID", "DELIVERED"].includes(r.status);
      let oneTimePresaleToken = presalePaid ? previous?.presaleVoucherToken ?? null : null;
      if (!oneTimePresaleToken && presalePaid) {
        const claimed = await post<PresaleVoucherClaim>("/orders/presale-token-by-token", { orderNo: no.trim(), historyToken: r.historyToken });
        nextOrder = { ...r, presaleVoucherHint: claimed.tokenHint, presaleVoucherStatus: claimed.status };
        oneTimePresaleToken = claimed.token;
      }
      setOrder(nextOrder);
      const savedContact = ct.trim() || previous?.contact || "";
      rememberOrder({
        orderNo: nextOrder.orderNo, contact: savedContact, productName: nextOrder.productName,
        amount: String(nextOrder.amount), createdAt: nextOrder.createdAt, queryToken: credential?.queryToken,
        historyToken: r.historyToken, historyExpiresAt: r.historyExpiresAt,
        presaleVoucherToken: oneTimePresaleToken ?? previous?.presaleVoucherToken,
      }, { bump: !previous });
      if (oneTimePresaleToken) {
        setRevealedPresaleToken(oneTimePresaleToken);
        consumePresaleVoucherToken(nextOrder.orderNo);
      }
      setHistory(localOrders());
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "failed");
      if (credential && e instanceof ApiError && [3001, 3005, 400].includes(e.code)) {
        setNeedsCredentials(true);
      }
    } finally {
      setCaptchaToken("");
      setCaptchaResetKey((x) => x + 1);
      setBusy(false);
      queryLock.current = false;
    }
  }

  function quickQuery(h: LocalOrder) {
    setQueryPassword("");
    setOrderNo(h.orderNo);
    setContact(h.contact);
    if (h.historyToken && Date.parse(h.historyExpiresAt ?? "") > Date.now()) void doQuery(h.orderNo, h.contact, { historyToken: h.historyToken });
    else if (!h.historyToken && h.queryToken) void doQuery(h.orderNo, h.contact, { queryToken: h.queryToken });
    else { queryOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setNeedsCredentials(true); setResultOpen(true); setOrder(null); setError(h.historyToken ? 3005 : null); }
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

  const statusInfo = order ? (
    order.deliveryMode === "PRESALE_VOUCHER" && order.status === "DELIVERED"
      ? [t.voucherActive, "text-emerald-600 dark:text-emerald-400"]
      : STATUS_LABEL[order.status] ?? [order.status, "text-ink/50"]
  ) : null;
  const fmtPresaleTime = (s: string | null) => s ? new Date(s).toLocaleString(lang === "en" ? "en-US" : "zh-CN") : t.tba;
  const presaleReady = order?.deliveryMode === "PRESALE_VOUCHER" && ["PAID", "DELIVERED"].includes(order.status);

  const queryForm = (<>
        <p className="mb-4 mt-3 text-xs leading-relaxed text-ink/50">{t.manualNote}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t.number}</label>
            <input className="input font-mono" aria-label={t.number} placeholder={t.paste} value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)} />
          </div>
          <div>
            <label className="label">{t.email}</label>
            <input className="input" type="email" autoComplete="email" aria-label={t.email} placeholder="you@example.com" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <label className="label">{t.passwordLabel}</label>
          <input className="input" type="password" aria-label={t.password} placeholder={t.optional} value={queryPassword} onChange={(e) => setQueryPassword(e.target.value)} />
        </div>
        {errorText && (!resultOpen || needsCredentials) && <p role="alert" className="mt-3 text-sm text-red-500">{errorText}</p>}
        <CaptchaBox
          action="order_query"
          onToken={handleCaptchaToken}
          onEnabledChange={handleCaptchaEnabled}
          resetKey={captchaResetKey}
        />
        <button className="btn-primary mt-5 w-full !py-3.5" disabled={busy || !orderNo || !contact}
          onClick={() => doQuery(orderNo, contact)}>
          {busy ? t.querying : t.submit}
        </button>
  </>);

  return (
    <div className="order-query-page mx-auto max-w-2xl animate-fade-up">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">{t.title}</h1>
      </div>
      <section className="card mb-5 p-5 sm:p-7" aria-label={t.recent}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-bold"><History size={17} />{t.recent}<span className="text-sm font-normal text-ink/40">{history.length}</span></h2>
          <Link to="/me" className="text-xs font-semibold text-primary">{t.member}</Link>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink/45">{t.localNote}</p>
        {history.length > 0 ? <>
          <input type="search" className="input my-4" aria-label={t.filter} placeholder={t.search}
            value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
          <div className="max-h-[420px] space-y-2 overflow-y-auto">
            {history.filter((h) => `${h.productName} ${h.contact} ${h.orderNo}`.toLowerCase().includes(historySearch.trim().toLowerCase())).map((h) => (
              <div key={h.orderNo} className={`flex items-center gap-1 rounded-2xl border p-2 transition ${orderNo === h.orderNo ? "border-primary/30 bg-accent-soft" : "border-ink/[0.06] hover:border-primary/30"}`}>
                <button type="button" disabled={busy} onClick={() => quickQuery(h)} aria-label={`${t.query} ${h.productName} ${h.orderNo}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left disabled:opacity-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{h.productName}</p>
                    <p className="mt-1 text-xs text-ink/50">{money(h.amount)} · {fmtDate(h.createdAt)}</p>
                    <p className="mt-1 truncate text-[11px] text-ink/40">{h.contact} {t.ending} {h.orderNo.slice(-6)}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-primary">{t.view}</span>
                </button>
                <button type="button" disabled={busy} aria-label={`${t.delete} ${h.orderNo}`} title={t.deleteHint}
                  onClick={() => removeHistory(h.orderNo)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink/30 hover:bg-ink/5 hover:text-ink"><X size={14} /></button>
              </div>
            ))}
            {!history.some((h) => `${h.productName} ${h.contact} ${h.orderNo}`.toLowerCase().includes(historySearch.trim().toLowerCase())) &&
              <p className="py-6 text-center text-sm text-ink/50">{t.noMatch}</p>}
          </div>
        </> : <div className="my-4 rounded-2xl bg-base p-5 text-sm leading-relaxed text-ink/55">{t.empty}</div>}
      </section>
      <div className="card p-5 sm:p-7 md:p-8">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={manualOpen} aria-controls="manual-order-query" onClick={() => setManualOpen((open) => !open)}>
          <span className="flex items-center gap-2 font-bold"><Search size={17} />{t.manual}</span>
          <span className="text-xs text-primary">{manualOpen ? t.collapse : t.credentials}</span>
        </button>
        <div id="manual-order-query" hidden={!manualOpen}>
        {!(resultOpen && needsCredentials) && queryForm}
        </div>
      </div>
      {resultOpen && <OrderQueryDialog
        returnFocus={queryOpener.current}
        title={lang === "zh" ? "订单详情" : "Order details"}
        closeLabel={lang === "zh" ? "关闭订单详情" : "Close order details"}
        onClose={() => setResultOpen(false)}>
        {busy && <div role="status" className="flex min-h-48 flex-col items-center justify-center gap-4 text-ink/60">
          <Loader2 size={26} className="animate-spin text-primary" />
          <p className="font-medium">{t.querying}</p>
          <p className="max-w-full break-all text-xs text-ink/45">{t.order} {orderNo}</p>
        </div>}
        {needsCredentials && <div>{queryForm}</div>}
        {!busy && errorText && !needsCredentials && <div className="py-8">
          <p role="alert" className="text-sm leading-6 text-red-600 dark:text-red-400">{errorText}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="btn-primary" onClick={() => doQuery(orderNo, contact)}>{lang === "zh" ? "重新查询" : "Try again"}</button>
            <button className="btn-ghost" onClick={() => { setNeedsCredentials(true); }}>{lang === "zh" ? "修改查询信息" : "Edit details"}</button>
          </div>
        </div>}
      {order && statusInfo && (
        <div className="order-query-result min-w-0 max-w-full" data-order-result>
          <section className="order-result-summary">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <h2 className="min-w-0 flex-1 text-lg font-bold leading-snug [overflow-wrap:anywhere]">{order.productName} × {order.quantity}</h2>
              <span className={`rounded-full bg-surface px-3 py-1 text-xs font-semibold ${statusInfo[1]}`}>{statusInfo[0]}</span>
            </div>
            <dl className="order-result-meta">
              <div className="order-result-number"><dt>{t.number}</dt><dd className="font-mono">{order.orderNo}</dd></div>
              <div><dt>{lang === "zh" ? "订单金额" : "Amount"}</dt><dd className="text-xl font-bold text-ink">{money(order.amount)}</dd>
                {Number(order.discountAmount) > 0 && <dd className="text-primary">{t.discount.replace(/^·\s*/, "")} {money(order.discountAmount)}</dd>}
              </div>
              <div><dt>{lang === "zh" ? "创建时间" : "Created"}</dt><dd>{new Date(order.createdAt).toLocaleString(lang === "en" ? "en-US" : "zh-CN")}</dd></div>
            </dl>
          </section>

          {order.cards.length > 0 && (
            <div className="mt-6">
              <label className="label flex items-center gap-1.5"><KeyRound size={13} />{lang === "zh" ? "卡密" : "Cards"}</label>
              <div className="space-y-2">
                {order.cards.map((c, i) => (
                  <SecretBlock key={i} value={c} label={`${lang === "zh" ? "卡密" : "Card"} ${i + 1}`} />
                ))}
              </div>
            </div>
          )}
          {order.deliveryContent && (
            <div className="mt-6">
              <label className="label flex items-center gap-1.5"><KeyRound size={13} />{t.content}</label>
              <SecretBlock value={order.deliveryContent} label={t.content} />
            </div>
          )}
          {order.deliveryMode === "MANUAL" && order.status === "PAID" && (
            <p className="mt-5 rounded-2xl bg-sky-500/10 px-4 py-3 text-xs leading-relaxed text-sky-600 dark:text-sky-400">{t.manualPending}</p>
          )}
          {order.deliveryMode === "PRESALE_VOUCHER" && (
            <div className="mt-6 rounded-2xl border border-primary/15 bg-accent-soft/60 p-4">
              <label className="label flex items-center gap-1.5"><TicketCheck size={13} />{t.voucher}</label>
              {!presaleReady ? (
                <p className="rounded-2xl bg-surface px-4 py-3 text-xs leading-relaxed text-ink/55">
                  {order.status === "PENDING"
                    ? t.unpaidVoucher
                    : t.inactiveVoucher}
                </p>
              ) : revealedPresaleToken ? (
                <button onClick={() => copyCard(revealedPresaleToken, 8888)}
                  className="group flex w-full items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-left transition hover:brightness-95">
                  <code className="break-all font-mono text-sm font-semibold">{revealedPresaleToken}</code>
                  {copied === 8888 ? <CheckCircle2 size={15} className="shrink-0 text-primary" /> : <Copy size={15} className="shrink-0 text-ink/40 group-hover:text-ink" />}
                </button>
              ) : (
                <p className="rounded-2xl bg-surface px-4 py-3 text-xs leading-relaxed text-ink/55">{t.hint}<span className="font-mono font-semibold text-ink/75">{order.presaleVoucherHint ?? "-"}</span>{t.lost}</p>
              )}
              <div className="mt-3 grid gap-2 text-xs leading-relaxed text-ink/55 sm:grid-cols-2">
                <p><span className="font-medium text-ink/70">{t.start}</span> {fmtPresaleTime(order.presaleStartAt)}</p>
                <p><span className="font-medium text-ink/70">{t.end}</span> {fmtPresaleTime(order.presaleEndAt)}</p>
              </div>
              {(order.presaleVoucherStatus || order.presaleFulfillmentNote) && (
                <p className="mt-3 rounded-2xl bg-surface px-4 py-3 text-xs leading-relaxed text-ink/55">
                  <span className="font-medium text-ink/70">{t.voucherStatus}</span> {voucherStatuses[order.presaleVoucherStatus ?? ""] ?? order.presaleVoucherStatus ?? "-"}
                  {order.presaleFulfillmentNote ? ` · ${order.presaleFulfillmentNote}` : ""}
                </p>
              )}
              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink/45">
                <ShieldCheck size={12} className="mt-0.5 shrink-0" />{t.redeemNote}</p>
              <Link to="/redeem" className="btn-primary mt-4 w-full !py-3">{t.redeem}</Link>
            </div>
          )}
          {order.usageNote && (
            <section className="mt-5 min-w-0 rounded-2xl border border-ink/[0.08] p-4">
              <h3 className="mb-2 text-xs font-semibold text-ink/70">{lang === "zh" ? "使用说明" : "Instructions"}</h3>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink/60 [overflow-wrap:anywhere]">{order.usageNote}</p>
            </section>
          )}
          {order.status === "PENDING" && (
            <Link to={`/pay/${order.orderNo}`} className="btn-primary mt-5 w-full !py-3">{t.pay}</Link>
          )}
        </div>
      )}
      </OrderQueryDialog>}
    </div>
  );
}


function OrderQueryDialog({ title, closeLabel, onClose, children, returnFocus }: {
  title: string; closeLabel: string; onClose: () => void; children: ReactNode; returnFocus: HTMLElement | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog ref={dialog} aria-labelledby="order-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}
      className="order-query-dialog border border-ink/10 bg-surface text-ink">
      <div className="order-query-dialog-frame">
        <header className="order-query-dialog-header">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-primary" aria-hidden="true"><ShoppingBag size={18} /></span>
            <h2 id="order-dialog-title" className="min-w-0 font-bold">{title}</h2>
          </div>
          <button autoFocus type="button" aria-label={closeLabel} onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink/[0.04] text-ink/60 hover:bg-ink/10"><X size={19} /></button>
        </header>
        <div className="order-query-dialog-body">{children}</div>
      </div>
    </dialog>, document.body,
  );
}
