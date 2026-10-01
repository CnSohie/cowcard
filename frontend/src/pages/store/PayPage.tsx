import SecretBlock from "../../components/SecretBlock";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  AlarmClockOff, ArrowLeft, CheckCircle2, ChevronRight, Copy, ExternalLink,
  FileSearch, Loader2, PartyPopper, Smartphone, Timer, Wallet, X,
} from "lucide-react";
import {
  ApiError, get, post,
  type ChainOption, type Channel, type CryptoIntent, type PayCreation, type PaySummary,
} from "../../lib/api";
import {
  connectWallet, discoverWallets, ensureChain, sendToken,
  type EthereumProvider, type WalletOption,
} from "../../lib/wallet";
import { money } from "../../lib/currency";
import { findLocalOrder } from "../../lib/orderHistory";
import { isMemberLoggedIn, mGet, mPost } from "../../lib/memberApi";
import { useI18n } from "../../lib/i18n";
import { CaptchaBox, captchaHeaders } from "../../lib/captcha";

const CHAIN_LABEL: Record<string, string> = {
  BASE: "Base", POLYGON: "Polygon", BSC: "BNB Chain (BEP20)",
};

export default function PayPage() {
  const { orderNo = "" } = useParams();
  const nav = useNavigate();
  const { copy: ui, lang } = useI18n();
  const t = ui.pay;
  const [channels, setChannels] = useState<Channel[]>([]);
  const [chainOptions, setChainOptions] = useState<ChainOption[]>([]);
  const [channel, setChannel] = useState<string>("");
  const [chain, setChain] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [creation, setCreation] = useState<PayCreation | null>(null);
  const [restoringIntent, setRestoringIntent] = useState(false);
  const [intent, setIntent] = useState<CryptoIntent | null>(null);
  const [orderStatus, setOrderStatus] = useState<string>("PENDING");
  const successHeading = useRef<HTMLHeadingElement>(null);
  const paymentSucceeded = orderStatus === "PAID" || orderStatus === "DELIVERED";
  useLayoutEffect(() => {
    if (!paymentSucceeded) return;
    successHeading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [paymentSucceeded, orderNo]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletPick, setWalletPick] = useState<WalletOption[] | null>(null); // null=关闭;[]=无钱包指引
  // TXID 自助核销(已转账未检测到)
  const [txForm, setTxForm] = useState(false);
  const [txInput, setTxInput] = useState("");
  const [txBusy, setTxBusy] = useState(false);
  const [txMsg, setTxMsg] = useState("");
  const [summary, setSummary] = useState<PaySummary | null>(null);
  const [memberLoggedIn, setMemberLoggedIn] = useState(() => isMemberLoggedIn());
  const [now, setNow] = useState(() => Date.now());
  const [presaleToken, setPresaleToken] = useState<string | null>(null);
  const [presaleTokenHint, setPresaleTokenHint] = useState<string>("");
  const [claimingPresaleToken, setClaimingPresaleToken] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const paymentLock = useRef(false);
  const [pollError, setPollError] = useState(false);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const handleCaptchaToken = useCallback((token: string) => {
    setCaptchaToken(token);
    if (token) {
      setError((current) => current === "请先完成人机验证" ? "" : current);
      setTxMsg((current) => current === "请先完成人机验证" ? "" : current);
    }
  }, []);
  const handleCaptchaEnabled = useCallback((enabled: boolean) => setCaptchaEnabled(enabled), []);

  const isCrypto = channel.startsWith("CRYPTO");

  // 切回支付组合或重新进入收银台时，只读取服务端已有意向，不创建新支付。
  useEffect(() => {
    let disposed = false;
    setCreation(null);
    setIntent(null);
    setRestoringIntent(false);
    if (!isCrypto || !chain || !token) return;
    setRestoringIntent(true);
    const query = new URLSearchParams({ mode: channel === "CRYPTO_WALLET" ? "WALLET" : "TRANSFER", chain, token });
    const local = findLocalOrder(orderNo);
    const read = isMemberLoggedIn() ? mGet : get;
    read<CryptoIntent>(`/pay/crypto/intent/${orderNo}?${query}`, {
      contact: local?.contact, queryToken: local?.queryToken,
    })
      .then((existing) => {
        if (disposed) return;
        const active = existing.status === "CONFIRMING" || existing.status === "CONFIRMED"
          || (existing.status === "WAITING" && Date.parse(existing.expireAt) > Date.now());
        if (active) {
          setIntent(existing);
          setCreation({ kind: "CRYPTO", data: { ...existing } });
        }
      })
      .catch(() => { /* 尚未创建意向时保留正常支付入口。 */ })
      .finally(() => { if (!disposed) setRestoringIntent(false); });
    return () => { disposed = true; };
  }, [orderNo, channel, chain, token, isCrypto]);

  // 订单摘要(金额 / 截止时间),倒计时数据源
  useEffect(() => {
    const local = findLocalOrder(orderNo);
    const read = isMemberLoggedIn() ? mGet : get;
    read<PaySummary>(`/pay/summary/${orderNo}`, {
      contact: local?.contact,
      queryToken: local?.queryToken,
    })
      .then((s) => {
        setSummary(s);
        setOrderStatus(s.status);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : t.loadFailed));
  }, [orderNo]);

  // 秒级时钟(倒计时渲染)
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const sync = () => setMemberLoggedIn(isMemberLoggedIn());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  useEffect(() => {
    get<Channel[]>("/pay/channels").then((cs) => {
      setChannels(cs);
      if (cs.length) setChannel(cs.find((c) => c.code !== "BALANCE")?.code ?? cs[0].code);
    }).catch((e) => setError(e.message)).finally(() => setChannelsLoaded(true));
    get<ChainOption[]>("/pay/crypto/options").then((os) => {
      setChainOptions(os);
      if (os.length) {
        setChain(os[0].chainCode);
        setToken(os[0].tokens[0]?.symbol ?? "");
      }
    }).catch(() => void 0);
  }, []);

  useEffect(() => {
    if (!channels.length) return;
    const disabled = (code: string) => code === "BALANCE" && (!memberLoggedIn || summary?.orderType === "RECHARGE");
    if (!channel || disabled(channel)) {
      const next = channels.find((c) => !disabled(c.code));
      setChannel(next?.code ?? "");
    }
  }, [channels, channel, memberLoggedIn, summary?.orderType]);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let finished = false;
    let failures = 0;
    let timer: number | undefined;
    const poll = async () => {
      if (disposed || finished || inFlight || document.hidden) return;
      window.clearTimeout(timer);
      inFlight = true;
      try {
        const local = findLocalOrder(orderNo);
        const read = isMemberLoggedIn() ? mGet : get;
        const st = await read<string>(`/pay/status/${orderNo}`, {
          contact: local?.contact, queryToken: local?.queryToken,
        });
        if (disposed) return;
        setOrderStatus(st);
        finished = ["DELIVERED", "EXPIRED", "CLOSED"].includes(st);
        if (!finished && creation?.kind === "CRYPTO") {
          const mode = channel === "CRYPTO_WALLET" ? "WALLET" : "TRANSFER";
          const query = new URLSearchParams({ mode, chain, token });
          const next = await read<CryptoIntent>(`/pay/crypto/intent/${orderNo}?${query.toString()}`, {
            contact: local?.contact, queryToken: local?.queryToken,
          });
          if (!disposed) setIntent(next);
        }
        failures = 0;
        if (!disposed) setPollError(false);
      } catch {
        failures += 1;
        if (!disposed) setPollError(true);
      } finally {
        inFlight = false;
        if (!disposed && !finished && !document.hidden) {
          timer = window.setTimeout(poll, Math.min(30_000, (creation ? 3000 : 8000) * 2 ** Math.min(failures, 3)));
        }
      }
    };
    const resume = () => {
      window.clearTimeout(timer);
      if (!document.hidden) void poll();
    };
    timer = window.setTimeout(poll, 3000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [orderNo, creation?.kind, channel, chain, token]);

  useEffect(() => {
    if (orderStatus !== "DELIVERED" || summary?.orderType !== "GOODS") return;
    if (summary.deliveryMode === "PRESALE_VOUCHER") return;
    const local = findLocalOrder(orderNo);
    const timer = window.setTimeout(() => {
      nav("/order", {
        replace: true,
        state: { orderNo, contact: local?.contact, queryToken: local?.queryToken },
      });
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [orderNo, orderStatus, summary?.deliveryMode, summary?.orderType, nav]);

  useEffect(() => {
    if (orderStatus !== "DELIVERED" || summary?.orderType !== "GOODS" || summary.deliveryMode !== "PRESALE_VOUCHER") return;
    if (presaleToken || claimingPresaleToken || presaleTokenHint) return;
    const local = findLocalOrder(orderNo);
    if (!local?.queryToken) return;
    setClaimingPresaleToken(true);
    post<{ token: string | null; tokenHint: string; status: string }>("/orders/presale-token-by-token", {
      orderNo,
      queryToken: local.queryToken,
    })
      .then((r) => {
        if (r.token) setPresaleToken(r.token);
        setPresaleTokenHint(r.tokenHint);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : t.claimFailed))
      .finally(() => setClaimingPresaleToken(false));
  }, [claimingPresaleToken, orderNo, orderStatus, presaleToken, presaleTokenHint, summary?.deliveryMode, summary?.orderType]);

  const createPay = useCallback(async () => {
    if (restoringIntent || paymentLock.current || !summary || orderStatus !== "PENDING" || Date.parse(summary.expireAt) <= Date.now()) return;
    if (!channel || (isCrypto && (!chain || !token))) return;
    paymentLock.current = true;
    setBusy(true);
    setError("");
    setCreation(null);
    setIntent(null);
    if (captchaEnabled && !captchaToken) {
      setError("请先完成人机验证");
      setBusy(false);
      paymentLock.current = false;
      return;
    }
    try {
      const extras = { returnBase: window.location.origin, ...(isCrypto ? { chain, token } : {}) };
      const local = findLocalOrder(orderNo);
      const r = await mPost<PayCreation>("/pay/create", {
        orderNo, channelCode: channel, extras,
        contact: local?.contact,
        queryToken: local?.queryToken,
      },
        { headers: captchaHeaders(captchaToken) });
      setCreation(r);
      if (r.kind === "CRYPTO") setIntent(r.data as unknown as CryptoIntent);
      if (r.kind === "BALANCE") {
        const local = findLocalOrder(orderNo);
        const read = isMemberLoggedIn() ? mGet : get;
        const st = await read<string>(`/pay/status/${orderNo}`, {
          contact: local?.contact,
          queryToken: local?.queryToken,
        });
        setOrderStatus(st);
      }
      if (r.kind === "REDIRECT") window.location.href = String(r.data.url);
      if (r.kind === "HTML_FORM") {
        const w = window.open("", "_self");
        w?.document.write(String(r.data.html));
      }
    } catch (e) {
      if (e instanceof ApiError && (e.code === 401 || e.code === 1003) && !isMemberLoggedIn()) {
        setMemberLoggedIn(false);
        if (channel === "BALANCE") {
          const next = channels.find((c) => c.code !== "BALANCE");
          setChannel(next?.code ?? "");
        }
      }
      setError(e instanceof ApiError ? e.message : t.createFailed);
    } finally {
      setCaptchaToken("");
      setCaptchaResetKey((x) => x + 1);
      setBusy(false);
      paymentLock.current = false;
    }
  }, [restoringIntent, summary, orderStatus, orderNo, channel, chain, token, isCrypto, channels, captchaEnabled, captchaToken]);

  /** 点击「连接钱包支付」:多钱包 → 选择弹层;单钱包 → 直付;无钱包 → 扫码/安装指引。 */
  function openWalletFlow() {
    const ws = discoverWallets();
    if (ws.length === 0) setWalletPick([]);
    else if (ws.length === 1) void payWithWallet(ws[0].provider);
    else setWalletPick(ws);
  }

  async function payWithWallet(provider?: EthereumProvider) {
    if (!intent || walletBusy || intent.status !== "WAITING" || Date.parse(intent.expireAt) <= Date.now()) return;
    setWalletBusy(true);
    setError("");
    try {
      const account = await connectWallet(provider);
      await ensureChain(intent.chainId, provider);
      const txHash = await sendToken({
        from: account,
        tokenContract: intent.tokenContract,
        to: intent.address,
        amountMinor: intent.amountMinor,
        provider,
      });
      const local = findLocalOrder(orderNo);
      const updated = await mPost<CryptoIntent>(`/pay/crypto/intent/${orderNo}/tx`, {
        txHash, contact: local?.contact, queryToken: local?.queryToken,
      });
      setIntent(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.walletFailed);
    } finally {
      setWalletBusy(false);
    }
  }

  function copyText(text: string, tag: string) {
    if (!navigator.clipboard) {
      setError(lang === "zh" ? "无法自动复制，请长按内容手动复制。" : "Copy is unavailable. Select the text to copy it.");
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopied(tag);
      setTimeout(() => setCopied(""), 1500);
    }).catch(() => setError(lang === "zh" ? "复制失败，请选择内容手动复制。" : "Could not copy. Select the text to copy it."));
  }

  /** TXID 自助核销:提交交易哈希,服务端链上回查收据核验金额与收款地址。 */
  async function submitTxId() {
    const v = txInput.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(v)) {
      setTxMsg(t.txHashInvalid);
      return;
    }
    if (captchaEnabled && !captchaToken) {
      setTxMsg("请先完成人机验证");
      return;
    }
    setTxBusy(true);
    setTxMsg("");
    try {
      const local = findLocalOrder(orderNo);
      const updated = await mPost<CryptoIntent>(`/pay/crypto/intent/${orderNo}/tx`, {
        txHash: v, contact: local?.contact, queryToken: local?.queryToken,
      },
        { headers: captchaHeaders(captchaToken) });
      setIntent(updated);
      setTxForm(false);
      setTxInput("");
    } catch (e) {
      setTxMsg(e instanceof ApiError ? e.message : t.txVerifyFailed);
    } finally {
      setCaptchaToken("");
      setCaptchaResetKey((x) => x + 1);
      setTxBusy(false);
    }
  }

  /** 自助核销入口(等待支付 / 支付超时两个面板共用)。 */
  const txSection = (
    <div className="mt-4 border-t border-ink/10 pt-4">
      {!txForm ? (
        <button className="mx-auto flex items-center gap-1.5 text-xs text-ink/45 transition hover:text-primary"
          onClick={() => { setTxForm(true); setTxMsg(""); }}>
          <FileSearch size={13} /> {t.txHelp}
        </button>
      ) : (
        <div className="text-left">
          <label className="label">{t.txLabel}</label>
          <div className="flex gap-2">
            <input className="input flex-1 font-mono text-xs" placeholder="0x…"
              value={txInput} onChange={(e) => setTxInput(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && submitTxId()} />
            <button className="btn-primary shrink-0 !px-5" disabled={txBusy || !txInput} onClick={submitTxId}>
              {txBusy ? <Loader2 size={14} className="animate-spin" /> : t.txSubmit}
            </button>
          </div>
          {txMsg && <p className="mt-2 text-xs text-red-500">{txMsg}</p>}
          <p className="mt-2 text-[11px] leading-relaxed text-ink/35">
            {t.txNote}
          </p>
        </div>
      )}
    </div>
  );

  if (orderStatus === "PAID" || orderStatus === "DELIVERED") {
    const manualDelivery = summary?.orderType === "GOODS" && summary.deliveryMode === "MANUAL";
    const presaleDelivery = summary?.orderType === "GOODS" && summary.deliveryMode === "PRESALE_VOUCHER";
    const autoDelivery = summary?.orderType === "GOODS" && summary.deliveryMode !== "MANUAL" && summary.deliveryMode !== "PRESALE_VOUCHER";
    return (
      <div className="card mx-auto w-full min-w-0 max-w-lg p-6 text-center sm:p-10">
        <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-accent">
          <PartyPopper size={28} />
        </span>
        <h1 ref={successHeading} tabIndex={-1} aria-live="polite" className="scroll-mt-24 text-2xl font-extrabold tracking-tight outline-none">{t.success}</h1>
        <p className="mt-2 text-sm text-ink/55">
          {summary?.orderType === "RECHARGE"
              ? t.rechargeSuccess
            : presaleDelivery
              ? t.presaleSuccess
              : manualDelivery
              ? (orderStatus === "DELIVERED" ? t.manualDone : t.manualPending)
              : orderStatus === "DELIVERED" ? t.cardDone : t.cardPending}
        </p>
        {presaleDelivery && (
          <div className="mt-6 rounded-2xl border border-primary/15 bg-accent-soft/70 p-4 text-left">
            <p className="mb-2 text-xs font-bold text-primary">{t.oneTimeVoucher}</p>
            {claimingPresaleToken ? (
              <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-ink/50">{t.issuingVoucher}</p>
            ) : presaleToken ? (
              <SecretBlock value={presaleToken} label={t.oneTimeVoucher} />
            ) : (
              <p className="rounded-2xl bg-surface px-4 py-3 text-xs leading-relaxed text-ink/55">
                {t.voucherHint} <span className="font-mono font-semibold text-ink/75">{presaleTokenHint || "-"}</span>。{t.voucherRetry}
              </p>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-ink/45">
              {t.voucherNote}
            </p>
          </div>
        )}
        <div className="mt-5 flex flex-col items-center gap-4">
          {autoDelivery && orderStatus === "DELIVERED" && (
            <p className="inline-flex items-center justify-center gap-2 rounded-full bg-accent-soft px-4 py-2 text-xs font-semibold text-primary">
              <Loader2 size={13} className="animate-spin" /> {t.redirecting}
            </p>
          )}
          {summary?.orderType === "RECHARGE" ? (
            <Link to="/me" className="btn-primary inline-flex">{t.backMember}</Link>
          ) : orderStatus === "DELIVERED" || manualDelivery ? (
            <Link to="/order" className="btn-primary inline-flex"
              state={{
                orderNo,
                contact: findLocalOrder(orderNo)?.contact,
                queryToken: findLocalOrder(orderNo)?.queryToken,
              }}>
              {presaleDelivery ? t.viewOrder : manualDelivery ? t.viewProgress : t.viewCards}
            </Link>
          ) : (
            <button className="btn-primary inline-flex" disabled>{t.issuingCards}</button>
          )}
        </div>
      </div>
    );
  }

  // ── 剩余支付时间(过期即拦截,后端每分钟批量关单兜底)──
  const remainMs = summary ? new Date(summary.expireAt).getTime() - now : null;
  const expired = orderStatus === "EXPIRED" || orderStatus === "CLOSED"
    || (remainMs != null && remainMs <= 0 && orderStatus === "PENDING");

  if (expired) {
    return (
      <div className="card mx-auto w-full min-w-0 max-w-lg p-6 text-center sm:p-10">
        <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-ink/[0.06]">
          <AlarmClockOff size={26} className="text-ink/45" />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">{t.expiredTitle}</h1>
        <p className="mt-2 text-sm text-ink/55">
          {t.expiredText.replace("{stock}", summary?.orderType === "RECHARGE" ? "" : t.stockReleased)}
        </p>
        <Link to={summary?.orderType === "RECHARGE" ? "/me" : "/"} className="btn-primary mt-7 inline-flex">
          {summary?.orderType === "RECHARGE" ? t.backMember : ui.common.retry}
        </Link>
      </div>
    );
  }

  const fmtRemain = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const p = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
  };

  const selectedChain = chainOptions.find((c) => c.chainCode === chain);
  const selectedChannel = channels.find((c) => c.code === channel);
  const orderAmount = Number(summary?.amount ?? 0);
  const channelFee = selectedChannel
    ? Math.round((orderAmount * Number(selectedChannel.feeRate || 0) / 100 + Number(selectedChannel.feeFixed || 0) + Number.EPSILON) * 100) / 100
    : 0;
  const actualPay = orderAmount + channelFee;

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <button onClick={() => nav(-1)} className="mb-6 flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={15} /> {ui.common.back}
      </button>
      <div className="mb-5 flex items-center gap-3 text-xs text-ink/50" aria-label={lang === "zh" ? "支付进度" : "Payment progress"}>
        <span className="flex items-center gap-1.5"><CheckCircle2 size={14} />{lang === "zh" ? "订单已创建" : "Order created"}</span>
        <span className="h-px flex-1 bg-ink/10" />
        <span className="font-semibold text-primary">{lang === "zh" ? "2 · 支付" : "2 · Payment"}</span>
        <span className="h-px flex-1 bg-ink/10" />
        <span>{lang === "zh" ? "3 · 完成" : "3 · Complete"}</span>
      </div>
      <div className="card p-5 sm:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-extrabold tracking-tight">{t.cashier}</h1>
          <button onClick={() => copyText(orderNo, "order")} className="inline-flex items-center gap-2 text-xs text-ink/55" aria-label={lang === "zh" ? "复制订单号" : "Copy order number"}><span className="font-mono">{orderNo}</span>{copied === "order" ? <CheckCircle2 size={13} /> : <Copy size={13} />}</button>
        </div>

        {/* 订单摘要 + 剩余时间倒计时 */}
        {summary && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-base px-5 py-5">
            <div className="min-w-0">
              <p className="truncate text-xs text-ink/50">{summary.productName}</p>
              <p className="text-4xl font-semibold tracking-tight">{money(actualPay.toFixed(2))}</p>
              {selectedChannel && channelFee > 0 && (
                <div className="mt-1 space-y-0.5 text-[11px] text-ink/45">
                  <p>{t.orderAmount} {money(summary.amount)} · {t.channelFee} {money(channelFee.toFixed(2))}</p>
                  <p>{t.feeNonRefundable}</p>
                </div>
              )}
              {Number(summary.walletPaidAmount) > 0 && (
                <p className="mt-1 text-[11px] leading-relaxed text-ink/45">
                  {t.walletDeducted.replace("{paid}", money(summary.walletPaidAmount)).replace("{amount}", money(summary.amount))}
                </p>
              )}
            </div>
            {remainMs != null && (
              <div className={`flex items-center gap-2 rounded-full px-4 py-2.5 font-mono text-[1rem] font-bold tabular-nums transition-colors ${
                remainMs <= 180_000
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-surface text-ink/75"
              }`}
                title={t.remainTitle}>
                <Timer size={16} className={remainMs <= 180_000 ? "animate-pulse" : ""} />
                {fmtRemain(remainMs)}
              </div>
            )}
          </div>
        )}
        <details className="mb-5 text-xs text-ink/55"><summary className="w-fit cursor-pointer py-1">{lang === "zh" ? "支付说明" : "Payment notes"}</summary><p className="mt-2 leading-relaxed">{t.memberPayNote}</p></details>
        <p className="mb-3 text-sm font-semibold">{lang === "zh" ? "选择支付方式" : "Payment method"}</p>

        <div className="mb-5 grid grid-cols-2 gap-2.5">
          {channels.map((c) => {
            const balanceDisabled = c.code === "BALANCE" && (!memberLoggedIn || summary?.orderType === "RECHARGE");
            return (
              <button
                key={c.code}
                disabled={balanceDisabled || busy || walletBusy || intent?.status === "CONFIRMING"}
                aria-pressed={channel === c.code}
                title={balanceDisabled ? (summary?.orderType === "RECHARGE" ? t.balanceRechargeDisabled : t.balanceLoginRequired) : undefined}
                onClick={() => { if (balanceDisabled || channel === c.code) return; setError(""); setChannel(c.code); setCreation(null); setIntent(null); }}
                className={`payment-choice rounded-xl border px-3 py-3.5 text-sm font-semibold transition disabled:cursor-not-allowed ${
                  balanceDisabled
                    ? "cursor-not-allowed border-ink/10 bg-ink/[0.035] text-ink/25"
                    : channel === c.code
                      ? "border-primary bg-accent-soft text-primary"
                      : "border-ink/10 text-ink/60 hover:border-ink/30"
                }`}
              >
                {channel === c.code && <CheckCircle2 size={13} aria-hidden="true" className="absolute right-2 top-2 text-primary" />}
                <span className="flex flex-col items-center gap-1">
                {c.code === "BALANCE" ? (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <Wallet size={14} /> {c.displayName}
                  </span>
                ) : c.displayName}
                {(Number(c.feeRate) > 0 || Number(c.feeFixed) > 0) && <span className={`text-[10px] font-normal ${channel === c.code ? "text-primary/70" : "text-ink/35"}`}>
                  {Number(c.feeRate) > 0 ? `${c.feeRate}%` : ""}{Number(c.feeRate) > 0 && Number(c.feeFixed) > 0 ? " + " : ""}{Number(c.feeFixed) > 0 ? money(c.feeFixed) : ""}
                </span>}
                </span>
              </button>
            );
          })}
          {channels.length === 0 && <p className="col-span-2 text-sm text-ink/40">{channelsLoaded ? t.noChannels : ui.common.loading}</p>}
        </div>

        {isCrypto && (
          <div className="mb-5 space-y-3.5">
            <div>
              <label className="label">{t.network}</label>
              <div className="flex flex-wrap gap-2">
                {chainOptions.map((c) => (
                  <button
                    key={c.chainCode}
                    disabled={busy || walletBusy || intent?.status === "CONFIRMING"}
                    aria-pressed={chain === c.chainCode}
                    onClick={() => { if (chain === c.chainCode) return; setChain(c.chainCode); setToken(c.tokens[0]?.symbol ?? ""); setCreation(null); setIntent(null); }}
                    className={`chip !py-2 ${chain === c.chainCode ? "chip-on" : ""}`}
                  >
                    {CHAIN_LABEL[c.chainCode] ?? c.chainCode}
                  </button>
                ))}
              </div>
            </div>
            {selectedChain && (
              <div>
                <label className="label">{t.token}</label>
                <div className="flex gap-2">
                  {selectedChain.tokens.map((t) => (
                    <button
                      key={t.symbol}
                      disabled={busy || walletBusy || intent?.status === "CONFIRMING"}
                      aria-pressed={token === t.symbol}
                      onClick={() => { if (token === t.symbol) return; setToken(t.symbol); setCreation(null); setIntent(null); }}
                      className={`chip !py-2 ${token === t.symbol ? "chip-on" : ""}`}
                    >
                      {t.symbol}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {pollError && <p role="status" className="mb-4 text-xs text-amber-600 dark:text-amber-400">{lang === "zh" ? "状态更新暂时中断，正在重试。已付款请勿重复支付。" : "Reconnecting. If you have paid, do not pay again."}</p>}
        {error && <p role="alert" className="mb-4 text-sm text-red-500">{error}</p>}

        <CaptchaBox
          action="payment"
          onToken={handleCaptchaToken}
          onEnabledChange={handleCaptchaEnabled}
          resetKey={captchaResetKey}
        />

        {channel === "BALANCE" && summary?.orderType === "GOODS" && !memberLoggedIn && (
          <p className="mb-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-600 dark:text-amber-400">
            {t.balanceWarn}
          </p>
        )}

        {!creation && (
          <button className="btn-primary w-full !py-3.5" disabled={restoringIntent || busy || !channel || !summary || (isCrypto && (!chain || !token)) || (captchaEnabled && !captchaToken)} onClick={createPay}>
            {busy || restoringIntent ? <Loader2 size={16} className="animate-spin" /> : channel === "BALANCE" ? `${t.balancePay} ${money(actualPay.toFixed(2))}` : `${t.payNow} · ${money(actualPay.toFixed(2))}`}
          </button>
        )}

        {creation?.kind === "QRCODE" && (
          <div className="mt-2 flex flex-col items-center gap-4 rounded-2xl bg-accent-soft p-7">
            <div className="rounded-2xl bg-white p-3.5 shadow-sm">
              <QRCodeSVG value={String(creation.data.qrContent)} size={192} />
            </div>
            <p className="flex items-center gap-2 text-sm text-ink/60">
              <Loader2 size={14} className="animate-spin text-primary" /> {t.alipayScan}
            </p>
          </div>
        )}

        {creation?.kind === "CRYPTO" && intent && (
          <div className="mt-2 rounded-2xl bg-accent-soft p-5 md:p-6">
            {intent.status === "WAITING" && (
              <>
                <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                  <div className="shrink-0 rounded-2xl bg-white p-3 shadow-sm">
                    <QRCodeSVG value={intent.eip681} size={160} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <label className="label">{t.transferAmount}</label>
                      <button className="group flex w-full items-center justify-between rounded-xl bg-surface px-3.5 py-3"
                        onClick={() => copyText(intent.amount, "amount")}>
                        <span className="break-all text-left font-mono text-[1rem] font-bold sm:text-lg">{intent.amount} {intent.tokenSymbol}</span>
                        {copied === "amount" ? <CheckCircle2 size={15} className="text-primary" /> : <Copy size={15} className="text-ink/40 group-hover:text-ink" />}
                      </button>
                    </div>
                    <div>
                      <label className="label">{t.receivingAddress}({CHAIN_LABEL[intent.chainCode] ?? intent.chainCode})</label>
                      <button className="group flex w-full items-center justify-between gap-2 rounded-xl bg-surface px-3.5 py-3"
                        onClick={() => copyText(intent.address, "addr")}>
                        <span className="select-text break-all text-left font-mono text-xs leading-relaxed">{intent.address}</span>
                        {copied === "addr" ? <CheckCircle2 size={15} className="shrink-0 text-primary" /> : <Copy size={15} className="shrink-0 text-ink/40 group-hover:text-ink" />}
                      </button>
                    </div>
                    <p className="text-[11px] leading-relaxed text-ink/50">
                      · {t.cryptoNote1.replace("{chain}", CHAIN_LABEL[intent.chainCode] ?? intent.chainCode)}<br />
                      · {t.cryptoNote2.replace("{count}", String(intent.requiredConfirmations))}
                    </p>
                  </div>
                </div>
                <button className="btn-primary mt-5 w-full !py-3.5" disabled={walletBusy} onClick={openWalletFlow}>
                  {walletBusy ? <Loader2 size={16} className="animate-spin" /> : <><Wallet size={16} /> {t.walletPay}</>}
                </button>
                {txSection}
              </>
            )}
            {intent.status === "CONFIRMING" && (
              <div className="py-5 text-center">
                <Loader2 className="mx-auto mb-3 animate-spin text-primary" size={30} />
                <p className="font-bold">{t.confirming}</p>
                <p className="mt-1 text-sm text-ink/55">
                  {intent.confirmations} / {intent.requiredConfirmations} {t.confirmUnit}
                </p>
                <div className="mx-auto mt-4 h-2 w-56 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, (intent.confirmations / intent.requiredConfirmations) * 100)}%` }} />
                </div>
                {intent.txHash && (
                  <p className="mt-3 truncate font-mono text-[11px] text-ink/40">
                    <ExternalLink size={11} className="mr-1 inline" />{intent.txHash}
                  </p>
                )}
              </div>
            )}
            {intent.status === "EXPIRED" && (
              <div className="py-5 text-center">
                <p className="font-medium text-red-500">{t.cryptoExpired}</p>
                <button className="btn-ghost mt-4" onClick={createPay}>{t.refreshIntent}</button>
                {txSection}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 钱包选择弹层(EIP-6963 发现)── */}
      {walletPick !== null && createPortal((
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={() => setWalletPick(null)}>
          <div className="card w-full max-w-sm !bg-surface p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold">{walletPick.length > 0 ? t.pickWallet : t.noWallet}</h3>
              <button onClick={() => setWalletPick(null)}
                className="grid h-8 w-8 place-items-center rounded-full text-ink/40 transition hover:bg-ink/[0.06] hover:text-ink">
                <X size={15} />
              </button>
            </div>
            {walletPick.length > 0 ? (
              <div className="space-y-2">
                {walletPick.map((w) => (
                  <button key={w.uuid}
                    onClick={() => { setWalletPick(null); void payWithWallet(w.provider); }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-ink/10 px-4 py-3 text-left transition hover:border-primary/50 hover:bg-accent-soft/40">
                    {w.icon
                      ? <img src={w.icon} alt="" className="h-8 w-8 rounded-lg" />
                      : <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft"><Wallet size={15} className="text-primary" /></span>}
                    <span className="font-semibold">{w.name}</span>
                    <ChevronRight size={15} className="ml-auto text-ink/30" />
                  </button>
                ))}
                <p className="pt-1 text-[11px] text-ink/35">{t.walletSignNote}</p>
              </div>
            ) : (
              <div className="space-y-3.5 text-sm leading-relaxed text-ink/60">
                <p className="flex gap-2.5">
                  <Smartphone size={16} className="mt-0.5 shrink-0 text-primary" />
                  {t.mobileWallet}
                </p>
                <p className="flex gap-2.5">
                  <Wallet size={16} className="mt-0.5 shrink-0 text-primary" />
                  {t.desktopWallet.includes("MetaMask") ? (
                    <>
                      {t.desktopWallet.split("MetaMask")[0]}
                      <a className="font-semibold text-primary underline" href="https://metamask.io/download/"
                        target="_blank" rel="noopener noreferrer">MetaMask</a>
                      {t.desktopWallet.split("MetaMask")[1]}
                    </>
                  ) : t.desktopWallet}
                </p>
              </div>
            )}
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
