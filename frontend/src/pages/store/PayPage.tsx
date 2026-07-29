import { useCallback, useEffect, useRef, useState } from "react";
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
import { isMemberLoggedIn, mPost } from "../../lib/memberApi";

const CHAIN_LABEL: Record<string, string> = {
  BASE: "Base", POLYGON: "Polygon", BSC: "BNB Chain (BEP20)",
};

export default function PayPage() {
  const { orderNo = "" } = useParams();
  const nav = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [chainOptions, setChainOptions] = useState<ChainOption[]>([]);
  const [channel, setChannel] = useState<string>("");
  const [chain, setChain] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [creation, setCreation] = useState<PayCreation | null>(null);
  const [intent, setIntent] = useState<CryptoIntent | null>(null);
  const [orderStatus, setOrderStatus] = useState<string>("PENDING");
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
  const pollRef = useRef<number | null>(null);

  const isCrypto = channel.startsWith("CRYPTO");

  // 订单摘要(金额 / 截止时间),倒计时数据源
  useEffect(() => {
    get<PaySummary>(`/pay/summary/${orderNo}`)
      .then((s) => {
        setSummary(s);
        setOrderStatus(s.status);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "订单加载失败"));
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
    }).catch((e) => setError(e.message));
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
    pollRef.current = window.setInterval(async () => {
      try {
        const st = await get<string>(`/pay/status/${orderNo}`);
        setOrderStatus(st);
        if (st === "DELIVERED" || st === "EXPIRED" || st === "CLOSED") {
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
        if (creation?.kind === "CRYPTO") {
          setIntent(await get<CryptoIntent>(`/pay/crypto/intent/${orderNo}`));
        }
      } catch { /* 轮询失败静默重试 */ }
    }, 3000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [orderNo, creation?.kind]);

  useEffect(() => {
    if (orderStatus !== "DELIVERED" || summary?.orderType !== "GOODS") return;
    const local = findLocalOrder(orderNo);
    nav("/order", {
      replace: true,
      state: { orderNo, contact: local?.contact, queryToken: local?.queryToken },
    });
  }, [orderNo, orderStatus, summary?.orderType, nav]);

  const createPay = useCallback(async () => {
    setBusy(true);
    setError("");
    setCreation(null);
    setIntent(null);
    try {
      const extras = { returnBase: window.location.origin, ...(isCrypto ? { chain, token } : {}) };
      const r = await mPost<PayCreation>("/pay/create", { orderNo, channelCode: channel, extras });
      setCreation(r);
      if (r.kind === "CRYPTO") setIntent(r.data as unknown as CryptoIntent);
      if (r.kind === "BALANCE") setOrderStatus("PAID");
      if (r.kind === "REDIRECT") window.location.href = String(r.data.url);
      if (r.kind === "HTML_FORM") {
        const w = window.open("", "_self");
        w?.document.write(String(r.data.html));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "支付创建失败");
    } finally {
      setBusy(false);
    }
  }, [orderNo, channel, chain, token, isCrypto]);

  /** 点击「连接钱包支付」:多钱包 → 选择弹层;单钱包 → 直付;无钱包 → 扫码/安装指引。 */
  function openWalletFlow() {
    const ws = discoverWallets();
    if (ws.length === 0) setWalletPick([]);
    else if (ws.length === 1) void payWithWallet(ws[0].provider);
    else setWalletPick(ws);
  }

  async function payWithWallet(provider?: EthereumProvider) {
    if (!intent) return;
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
      const updated = await post<CryptoIntent>(`/pay/crypto/intent/${orderNo}/tx`, { txHash });
      setIntent(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "钱包支付失败");
    } finally {
      setWalletBusy(false);
    }
  }

  function copy(text: string, tag: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(tag);
      setTimeout(() => setCopied(""), 1500);
    });
  }

  /** TXID 自助核销:提交交易哈希,服务端链上回查收据核验金额与收款地址。 */
  async function submitTxId() {
    const v = txInput.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(v)) {
      setTxMsg("哈希格式不正确:应为 0x 开头共 66 位字符");
      return;
    }
    setTxBusy(true);
    setTxMsg("");
    try {
      const updated = await post<CryptoIntent>(`/pay/crypto/intent/${orderNo}/tx`, { txHash: v });
      setIntent(updated);
      setTxForm(false);
      setTxInput("");
    } catch (e) {
      setTxMsg(e instanceof ApiError ? e.message : "核销失败,请稍后再试");
    } finally {
      setTxBusy(false);
    }
  }

  /** 自助核销入口(等待支付 / 支付超时两个面板共用)。 */
  const txSection = (
    <div className="mt-4 border-t border-ink/10 pt-4">
      {!txForm ? (
        <button className="mx-auto flex items-center gap-1.5 text-xs text-ink/45 transition hover:text-primary"
          onClick={() => { setTxForm(true); setTxMsg(""); }}>
          <FileSearch size={13} /> 已转账但一直未检测到?提交交易哈希(TXID)自助核销
        </button>
      ) : (
        <div className="text-left">
          <label className="label">交易哈希 TXID(钱包 / 交易所提现记录里复制)</label>
          <div className="flex gap-2">
            <input className="input flex-1 font-mono text-xs" placeholder="0x…"
              value={txInput} onChange={(e) => setTxInput(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && submitTxId()} />
            <button className="btn-primary shrink-0 !px-5" disabled={txBusy || !txInput} onClick={submitTxId}>
              {txBusy ? <Loader2 size={14} className="animate-spin" /> : "核销"}
            </button>
          </div>
          {txMsg && <p className="mt-2 text-xs text-red-500">{txMsg}</p>}
          <p className="mt-2 text-[11px] leading-relaxed text-ink/35">
            服务端会直接回查链上收据,核验收款地址与金额(支持本订单此前生成过的旧金额);验证通过立即进入确认流程。
          </p>
        </div>
      )}
    </div>
  );

  if (orderStatus === "PAID" || orderStatus === "DELIVERED") {
    const manualDelivery = summary?.orderType === "GOODS" && summary.deliveryMode === "MANUAL";
    const presaleDelivery = summary?.orderType === "GOODS" && summary.deliveryMode === "PRESALE_VOUCHER";
    return (
      <div className="card mx-auto max-w-lg animate-fade-up p-10 text-center">
        <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-accent">
          <PartyPopper size={28} />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">支付成功</h1>
        <p className="mt-2 text-sm text-ink/55">
          {summary?.orderType === "RECHARGE"
            ? "余额已入账,可在会员中心查看。"
            : presaleDelivery
              ? "电子预售提货码已签发,请前往订单查询页保存并在开放时间内兑换。"
              : manualDelivery
              ? (orderStatus === "DELIVERED" ? "人工发货已完成,请前往订单查询页查看交付内容。" : "已收到付款,订单正在等待后台人工处理。")
              : orderStatus === "DELIVERED" ? "卡密已发放,请前往订单查询页提取。" : "已收到付款,正在自动发卡…"}
        </p>
        {summary?.orderType === "RECHARGE" ? (
          <Link to="/me" className="btn-primary mt-7 inline-flex">回到会员中心</Link>
        ) : orderStatus === "DELIVERED" || manualDelivery ? (
          <Link to="/order" className="btn-primary mt-7 inline-flex"
            state={{
              orderNo,
              contact: findLocalOrder(orderNo)?.contact,
              queryToken: findLocalOrder(orderNo)?.queryToken,
            }}>
            {presaleDelivery ? "查看提货码" : manualDelivery ? "查看订单进度" : "查看卡密"}
          </Link>
        ) : (
          <button className="btn-primary mt-7 inline-flex" disabled>正在发卡…</button>
        )}
      </div>
    );
  }

  // ── 剩余支付时间(过期即拦截,后端每分钟批量关单兜底)──
  const remainMs = summary ? new Date(summary.expireAt).getTime() - now : null;
  const expired = orderStatus === "EXPIRED" || orderStatus === "CLOSED"
    || (remainMs != null && remainMs <= 0 && orderStatus === "PENDING");

  if (expired) {
    return (
      <div className="card mx-auto max-w-lg animate-fade-up p-10 text-center">
        <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-ink/[0.06]">
          <AlarmClockOff size={26} className="text-ink/45" />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">订单已超时关闭</h1>
        <p className="mt-2 text-sm text-ink/55">
          未在有效期内完成支付{summary?.orderType === "RECHARGE" ? "" : ",预占库存已释放"};请重新下单。
        </p>
        <Link to={summary?.orderType === "RECHARGE" ? "/me" : "/"} className="btn-primary mt-7 inline-flex">
          {summary?.orderType === "RECHARGE" ? "回到会员中心" : "重新选购"}
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

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <button onClick={() => nav(-1)} className="mb-6 flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={15} /> 返回
      </button>
      <div className="card p-6 md:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-extrabold tracking-tight">收银台</h1>
          <span className="chip font-mono">{orderNo}</span>
        </div>

        {/* 订单摘要 + 剩余时间倒计时 */}
        {summary && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent-soft/60 px-5 py-4">
            <div className="min-w-0">
              <p className="truncate text-xs text-ink/50">{summary.productName}</p>
              <p className="text-2xl font-extrabold tracking-tight">{money(summary.amount)}</p>
            </div>
            {remainMs != null && (
              <div className={`flex items-center gap-2 rounded-full px-4 py-2.5 font-mono text-base font-bold tabular-nums transition-colors ${
                remainMs <= 180_000
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-surface text-ink/75"
              }`}
                title="剩余支付时间,超时订单自动关闭">
                <Timer size={16} className={remainMs <= 180_000 ? "animate-pulse" : ""} />
                {fmtRemain(remainMs)}
              </div>
            )}
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {channels.map((c) => {
            const balanceDisabled = c.code === "BALANCE" && (!memberLoggedIn || summary?.orderType === "RECHARGE");
            return (
              <button
                key={c.code}
                disabled={balanceDisabled}
                title={balanceDisabled ? (summary?.orderType === "RECHARGE" ? "充值订单不能使用余额支付" : "登录会员后可使用余额支付") : undefined}
                onClick={() => { if (balanceDisabled) return; setChannel(c.code); setCreation(null); setIntent(null); }}
                className={`rounded-2xl border px-3 py-3.5 text-sm font-semibold transition ${
                  balanceDisabled
                    ? "cursor-not-allowed border-ink/10 bg-ink/[0.035] text-ink/25"
                    : channel === c.code
                      ? "border-primary bg-primary text-primary-contrast"
                      : "border-ink/10 text-ink/60 hover:border-ink/30"
                }`}
              >
                {c.code === "BALANCE" ? (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <Wallet size={14} /> {c.displayName}
                  </span>
                ) : c.displayName}
              </button>
            );
          })}
          {channels.length === 0 && <p className="col-span-4 text-sm text-ink/40">暂无可用支付方式</p>}
        </div>

        {isCrypto && (
          <div className="mb-5 space-y-3.5">
            <div>
              <label className="label">选择网络</label>
              <div className="flex flex-wrap gap-2">
                {chainOptions.map((c) => (
                  <button
                    key={c.chainCode}
                    onClick={() => { setChain(c.chainCode); setToken(c.tokens[0]?.symbol ?? ""); setCreation(null); }}
                    className={`chip !py-2 ${chain === c.chainCode ? "chip-on" : ""}`}
                  >
                    {CHAIN_LABEL[c.chainCode] ?? c.chainCode}
                  </button>
                ))}
              </div>
            </div>
            {selectedChain && (
              <div>
                <label className="label">支付币种</label>
                <div className="flex gap-2">
                  {selectedChain.tokens.map((t) => (
                    <button
                      key={t.symbol}
                      onClick={() => { setToken(t.symbol); setCreation(null); }}
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

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        {channel === "BALANCE" && summary?.orderType === "GOODS" && !memberLoggedIn && (
          <p className="mb-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-600 dark:text-amber-400">
            余额支付需要登录下单会员账号。游客订单请选择其他支付方式。
          </p>
        )}

        {!creation && (
          <button className="btn-primary w-full !py-3.5" disabled={busy || !channel} onClick={createPay}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : channel === "BALANCE" ? "确认使用余额支付" : "去支付"}
          </button>
        )}

        {creation?.kind === "QRCODE" && (
          <div className="mt-2 flex flex-col items-center gap-4 rounded-2xl bg-accent-soft p-7">
            <div className="rounded-2xl bg-white p-3.5 shadow-sm">
              <QRCodeSVG value={String(creation.data.qrContent)} size={192} />
            </div>
            <p className="flex items-center gap-2 text-sm text-ink/60">
              <Loader2 size={14} className="animate-spin text-primary" /> 请使用支付宝扫码,支付后自动发货
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
                      <label className="label">转账金额(必须完全一致,金额即订单指纹)</label>
                      <button className="group flex w-full items-center justify-between rounded-xl bg-surface px-3.5 py-3"
                        onClick={() => copy(intent.amount, "amount")}>
                        <span className="font-mono text-lg font-extrabold">{intent.amount} {intent.tokenSymbol}</span>
                        {copied === "amount" ? <CheckCircle2 size={15} className="text-primary" /> : <Copy size={15} className="text-ink/40 group-hover:text-ink" />}
                      </button>
                    </div>
                    <div>
                      <label className="label">收款地址({CHAIN_LABEL[intent.chainCode] ?? intent.chainCode})</label>
                      <button className="group flex w-full items-center justify-between gap-2 rounded-xl bg-surface px-3.5 py-3"
                        onClick={() => copy(intent.address, "addr")}>
                        <span className="truncate font-mono text-xs">{intent.address}</span>
                        {copied === "addr" ? <CheckCircle2 size={15} className="shrink-0 text-primary" /> : <Copy size={15} className="shrink-0 text-ink/40 group-hover:text-ink" />}
                      </button>
                    </div>
                    <p className="text-[11px] leading-relaxed text-ink/50">
                      · 请确保网络为 <b className="text-ink">{CHAIN_LABEL[intent.chainCode]}</b>,金额分毫不差(交易所提现请把手续费设为「外扣」)<br />
                      · 请在页面顶部剩余时间内完成转账,到账 {intent.requiredConfirmations} 个区块确认后自动发货
                    </p>
                  </div>
                </div>
                <button className="btn-primary mt-5 w-full !py-3.5" disabled={walletBusy} onClick={openWalletFlow}>
                  {walletBusy ? <Loader2 size={16} className="animate-spin" /> : <><Wallet size={16} /> 连接钱包一键支付</>}
                </button>
                {txSection}
              </>
            )}
            {intent.status === "CONFIRMING" && (
              <div className="py-5 text-center">
                <Loader2 className="mx-auto mb-3 animate-spin text-primary" size={30} />
                <p className="font-bold">已检测到转账,等待区块确认</p>
                <p className="mt-1 text-sm text-ink/55">
                  {intent.confirmations} / {intent.requiredConfirmations} 确认
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
                <p className="font-medium text-red-500">支付超时,请重新发起</p>
                <button className="btn-ghost mt-4" onClick={createPay}>重新获取收款信息</button>
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
              <h3 className="font-bold">{walletPick.length > 0 ? "选择钱包" : "未检测到浏览器钱包"}</h3>
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
                <p className="pt-1 text-[11px] text-ink/35">确认弹窗中的收款地址与金额和页面一致后再签名。</p>
              </div>
            ) : (
              <div className="space-y-3.5 text-sm leading-relaxed text-ink/60">
                <p className="flex gap-2.5">
                  <Smartphone size={16} className="mt-0.5 shrink-0 text-primary" />
                  手机钱包(OKX / imToken / TokenPocket…):直接扫描页面上的收款二维码,链、代币、金额自动填好。
                </p>
                <p className="flex gap-2.5">
                  <Wallet size={16} className="mt-0.5 shrink-0 text-primary" />
                  电脑端:安装 <a className="font-semibold text-primary underline" href="https://metamask.io/download/"
                    target="_blank" rel="noopener noreferrer">MetaMask</a> 等插件钱包后刷新本页,即可一键支付。
                </p>
              </div>
            )}
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
