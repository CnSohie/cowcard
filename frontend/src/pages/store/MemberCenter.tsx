import SecretBlock from "../../components/SecretBlock";
import WithdrawAmounts from "../../components/WithdrawAmounts";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowDownToLine, ArrowUpRight, BadgePercent, BookOpen, Check, ChevronLeft, ChevronRight, Copy, Gift,
  KeyRound, Loader2, LogOut, Megaphone, MessageSquare, ReceiptText, TicketCheck, Users, Wallet, X,
} from "lucide-react";
import { ApiError } from "../../lib/api";
import {
  isMemberLoggedIn, memberLogout, mGet, mPost,
  type MemberMe, type MemberOrderView, type PageResult, type PresaleVoucherView, type PurchaseView, type SupportTicketView,
  type TxnView, type WalletSummary, type WithdrawView,
} from "../../lib/memberApi";
import { currencyCode, currencySymbol, money } from "../../lib/currency";
import { CaptchaBox, captchaHeaders } from "../../lib/captcha";

/** 会员中心:平台余额钱包(充值 / 提现)+ 明细 / 订单 / 已购 / 提现记录 / 推广。 */

type Tab = "txns" | "orders" | "presale" | "support" | "articles" | "withdrawals" | "promo";
const TAB_KEYS: Tab[] = ["txns", "orders", "presale", "support", "articles", "withdrawals", "promo"];

const TXN_LABEL: Record<TxnView["type"], string> = {
  RECHARGE: "余额充值", PURCHASE: "购买消费", COMMISSION: "推广佣金",
  WITHDRAW_FREEZE: "提现冻结", WITHDRAW_REJECT: "提现退回",
  ADMIN_FREEZE: "风控冻结", ADMIN_UNFREEZE: "解除冻结", RECHARGE_REVERSAL: "撤销充值",
  WALLET_ORDER_REFUND: "订单退回", ADMIN_REFUND: "订单退款", GIFT_CARD: "礼品卡兑换", ADJUST: "人工调整",
};

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "待支付", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  PAID: { label: "已支付", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  DELIVERED: { label: "已发货", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  EXPIRED: { label: "已过期", cls: "bg-ink/[0.06] text-ink/45" },
  CLOSED: { label: "已关闭", cls: "bg-ink/[0.06] text-ink/45" },
  REFUNDED: { label: "已退款", cls: "bg-ink/[0.06] text-ink/45" },
};

const DELIVERY_MODE_LABEL: Record<string, string> = {
  AUTO_CARD: "自动卡密",
  MANUAL: "人工发货",
  PRESALE_VOUCHER: "预售提货",
};

const WD_STATUS: Record<WithdrawView["status"], { label: string; cls: string }> = {
  PENDING: { label: "审核中", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  APPROVED: { label: "已打款", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  REJECTED: { label: "已驳回", cls: "text-ink/50" },
};
const PRESALE_STATUS: Record<string, { label: string; cls: string }> = {
  REDEEMED: { label: "待发货", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  FULFILLED: { label: "已交付", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  EXPIRED: { label: "已清算", cls: "bg-ink/[0.06] text-ink/45" },
  VOID: { label: "已作废", cls: "bg-ink/[0.06] text-ink/45" },
};
const DEFAULT_REJECT_NOTE = "提现申请未通过审核,请核对收款信息后重新提交";
const PENDING_PRESALE_HINT = "付款后签发";
const MAX_RECHARGE = 50_000;

function normalizeMoneyInput(raw: string, max: number) {
  if (raw === "") return { value: "", error: "" };
  const value = raw.replace(/，/g, ".").replace(/,/g, "");
  if (!/^\d*(?:\.\d{0,2})?$/.test(value)) {
    return { value: null, error: "金额只能输入数字，且最多保留两位小数" };
  }
  const normalized = value.startsWith(".") ? `0${value}` : value;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return { value: max.toFixed(2), error: "输入金额过大" };
  if (numeric > max) return { value: max.toFixed(2), error: `输入金额不能超过 ${money(max.toFixed(2))}` };
  return { value: normalized, error: "" };
}

function fmtTime(s: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function orderStatusMeta(o: MemberOrderView) {
  if (o.deliveryMode === "PRESALE_VOUCHER") {
    if (o.status === "DELIVERED") return { label: "提货码已激活", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
    if (o.status === "PAID") return { label: "已付款 · 激活中", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400" };
  }
  if (o.deliveryMode === "MANUAL") {
    if (o.status === "PAID") return { label: "待人工发货", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
    if (o.status === "DELIVERED") return { label: "人工发货完成", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
  }
  if (o.deliveryMode === "AUTO_CARD" && o.status === "PAID") {
    return { label: "已付款 · 正在发卡", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400" };
  }
  return ORDER_STATUS[o.status] ?? { label: o.status, cls: "bg-ink/[0.06] text-ink/45" };
}

function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <button className="btn-ghost !px-3 !py-1.5" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></button>
      <span className="text-xs text-ink/45">{page} / {pages}</span>
      <button className="btn-ghost !px-3 !py-1.5" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></button>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal((
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="drawer-mask !z-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg animate-fade-up overflow-hidden rounded-[28px] border border-ink/[0.08] bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink/[0.06] px-6 py-5">
          <div>
            <h3 className="text-xl font-extrabold tracking-tight">{title}</h3>
            <p className="mt-1 text-xs text-ink/40">充值、消费和提现记录</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-ink/45 hover:bg-ink/[0.06] hover:text-ink">
            <X size={15} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  ), document.body);
}

export default function MemberCenter() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [me, setMe] = useState<MemberMe | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const initialTab = TAB_KEYS.includes(searchParams.get("tab") as Tab) ? searchParams.get("tab") as Tab : "txns";
  const [tab, setTab] = useState<Tab>(initialTab);

  const [txns, setTxns] = useState<PageResult<TxnView> | null>(null);
  const [orders, setOrders] = useState<PageResult<MemberOrderView> | null>(null);
  const [presales, setPresales] = useState<PresaleVoucherView[]>([]);
  const [tickets, setTickets] = useState<PageResult<SupportTicketView> | null>(null);
  const [articles, setArticles] = useState<PageResult<PurchaseView> | null>(null);
  const [withdrawals, setWithdrawals] = useState<PageResult<WithdrawView> | null>(null);
  const [page, setPage] = useState(1);

  const [modal, setModal] = useState<"" | "recharge" | "withdraw" | "gift">("");
  const [amount, setAmount] = useState("");
  const [giftCode, setGiftCode] = useState("");
  const [wdChannel, setWdChannel] = useState("ALIPAY");
  const [wdAccount, setWdAccount] = useState("");
  const [wdAccountName, setWdAccountName] = useState("");
  const [wdBankName, setWdBankName] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalErr, setModalErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketOrderNo, setTicketOrderNo] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [followUps, setFollowUps] = useState<Record<number, string>>({});
  const [ticketErr, setTicketErr] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const handleCaptchaToken = useCallback((token: string) => {
    setCaptchaToken(token);
    if (token) {
      setModalErr((current) => current === "请先完成人机验证" ? "" : current);
      setTicketErr((current) => current === "请先完成人机验证" ? "" : current);
    }
  }, []);
  const handleCaptchaEnabled = useCallback((enabled: boolean) => setCaptchaEnabled(enabled), []);

  const loggedIn = isMemberLoggedIn();

  const loadBase = useCallback(() => {
    mGet<MemberMe>("/member/me").then(setMe).catch(() => void 0);
    mGet<WalletSummary>("/member/wallet").then((summary) => {
      // 兼容后端滚动升级期间尚未返回 withdrawMethods 的旧响应，避免用户中心整页白屏。
      const methods = summary.withdrawMethods ?? [];
      setWallet({ ...summary, withdrawMethods: methods });
      setWdChannel((current) => methods.length > 0 && !methods.some((m) => m.code === current)
        ? methods[0].code : current);
    }).catch(() => void 0);
  }, []);

  useEffect(() => { if (loggedIn) loadBase(); }, [loggedIn, loadBase]);

  useEffect(() => {
    const next = searchParams.get("tab") as Tab;
    if (TAB_KEYS.includes(next) && next !== tab) {
      setTab(next);
      setPage(1);
    }
  }, [searchParams, tab]);

  useEffect(() => {
    if (!loggedIn) return;
    const p = page - 1; // 后端 0 基分页
    if (tab === "txns") mGet<PageResult<TxnView>>("/member/wallet/txns", { page: p, size: 10 }).then(setTxns).catch(() => void 0);
    if (tab === "orders") mGet<PageResult<MemberOrderView>>("/member/orders", { page: p, size: 10 }).then(setOrders).catch(() => void 0);
    if (tab === "presale") mGet<PresaleVoucherView[]>("/member/presale/vouchers").then(setPresales).catch(() => void 0);
    if (tab === "support") mGet<PageResult<SupportTicketView>>("/member/support-tickets", { page: p, size: 10 }).then(setTickets).catch(() => void 0);
    if (tab === "articles") mGet<PageResult<PurchaseView>>("/member/articles", { page: p, size: 10 }).then(setArticles).catch(() => void 0);
    if (tab === "withdrawals") mGet<PageResult<WithdrawView>>("/member/wallet/withdrawals", { page: p, size: 20 }).then(setWithdrawals).catch(() => void 0);
  }, [loggedIn, tab, page]);

  if (!loggedIn) return <Navigate to="/login" replace />;

  const nickname = me?.member.nickname || me?.member.email.split("@")[0] || "会员";
  const inviteLink = me ? `${window.location.origin}/register?ref=${me.member.inviteCode}` : "";
  const withdrawMethods = wallet?.withdrawMethods ?? [];
  const selectedWithdrawMethod = withdrawMethods.find((m) => m.code === wdChannel);
  const requestedWithdraw = Number(amount || 0);
  const withdrawFee = selectedWithdrawMethod
    ? Math.round((requestedWithdraw * Number(selectedWithdrawMethod.feeRate || 0) / 100 + Number(selectedWithdrawMethod.feeFixed || 0) + Number.EPSILON) * 100) / 100
    : 0;
  const withdrawNet = Math.max(0, requestedWithdraw - withdrawFee);

  function switchTab(t: Tab) {
    setTab(t);
    setPage(1);
    setSearchParams(t === "txns" ? {} : { tab: t });
  }

  function changeAmount(raw: string, max: number, maxMessage?: string) {
    const normalized = normalizeMoneyInput(raw, max);
    if (normalized.value !== null) setAmount(normalized.value);
    setModalErr(normalized.error && maxMessage && normalized.error.startsWith("输入金额不能超过")
      ? maxMessage : normalized.error);
  }

  async function doRecharge() {
    const v = Number(amount);
    if (!Number.isFinite(v) || v < 1 || v > MAX_RECHARGE) {
      setModalErr(`单笔充值金额必须在 ${money("1.00")}～${money(MAX_RECHARGE.toFixed(2))} 之间`); return;
    }
    if (captchaEnabled && !captchaToken) { setModalErr("请先完成人机验证"); return; }
    setModalErr(""); setBusy(true);
    try {
      const r = await mPost<{ orderNo: string }>("/member/wallet/recharge", { amount },
        { headers: captchaHeaders(captchaToken) });
      nav(`/pay/${r.orderNo}`);
    } catch (e) {
      setModalErr(e instanceof ApiError ? e.message : "创建充值订单失败");
      setBusy(false);
    } finally {
      setCaptchaToken("");
      setCaptchaResetKey((x) => x + 1);
    }
  }

  async function doWithdraw() {
    const v = Number(amount);
    const available = Number(me?.withdrawableBalance ?? 0);
    if (!Number.isFinite(v) || v <= 0 || v > available) {
      setModalErr(`提现金额不能超过当前可提现余额 ${money(me?.withdrawableBalance ?? "0.00")}`); return;
    }
    if (wallet && v < Number(wallet.minWithdraw)) {
      setModalErr(`最低提现金额为 ${money(wallet.minWithdraw)}`); return;
    }
    const method = withdrawMethods.find((m) => m.code === wdChannel);
    if (!method) { setModalErr("当前没有可用的提现方式"); return; }
    const fee = Math.round((v * Number(method.feeRate || 0) / 100 + Number(method.feeFixed || 0) + Number.EPSILON) * 100) / 100;
    if (fee >= v) { setModalErr("提现金额必须大于手续费"); return; }
    if (!wdAccount.trim()) { setModalErr("请填写收款账号"); return; }
    if (method.accountNameRequired && !wdAccountName.trim()) { setModalErr("请填写与收款账户一致的真实姓名"); return; }
    if (method.bankNameRequired && !wdBankName.trim()) { setModalErr("请填写开户银行名称"); return; }
    if (captchaEnabled && !captchaToken) { setModalErr("请先完成人机验证"); return; }
    setModalErr(""); setBusy(true);
    try {
      await mPost("/member/wallet/withdraw", {
        amount, channel: wdChannel, account: wdAccount.trim(),
        accountName: wdAccountName.trim() || undefined, bankName: wdBankName.trim() || undefined,
      },
        { headers: captchaHeaders(captchaToken) });
      setModal(""); setAmount(""); setWdAccount(""); setWdAccountName(""); setWdBankName("");
      loadBase();
      switchTab("withdrawals");
      mGet<PageResult<WithdrawView>>("/member/wallet/withdrawals", { page: 0, size: 20 }).then(setWithdrawals).catch(() => void 0);
    } catch (e) {
      setModalErr(e instanceof ApiError ? e.message : "提交失败,请稍后再试");
    } finally {
      setCaptchaToken("");
      setCaptchaResetKey((x) => x + 1);
      setBusy(false);
    }
  }

  async function doRedeemGift() {
    if (!giftCode.trim()) { setModalErr("请输入礼品卡码"); return; }
    if (captchaEnabled && !captchaToken) { setModalErr("请先完成人机验证"); return; }
    setModalErr(""); setBusy(true);
    try {
      await mPost("/member/wallet/gift-cards/redeem", { code: giftCode.trim() },
        { headers: captchaHeaders(captchaToken) });
      setModal(""); setGiftCode("");
      loadBase();
      switchTab("txns");
      mGet<PageResult<TxnView>>("/member/wallet/txns", { page: 0, size: 10 }).then(setTxns).catch(() => void 0);
    } catch (e) {
      setModalErr(e instanceof ApiError ? e.message : "兑换失败");
    } finally {
      setCaptchaToken("");
      setCaptchaResetKey((x) => x + 1);
      setBusy(false);
    }
  }

  async function submitTicket() {
    if (!ticketSubject.trim() || !ticketMessage.trim()) return;
    if (captchaEnabled && !captchaToken) { setTicketErr("请先完成人机验证"); return; }
    setTicketErr("");
    try {
      await mPost("/member/support-tickets", {
        subject: ticketSubject.trim(),
        category: "GENERAL",
        relatedOrderNo: ticketOrderNo.trim() || undefined,
        message: ticketMessage.trim(),
      }, { headers: captchaHeaders(captchaToken) });
      setTicketSubject(""); setTicketOrderNo(""); setTicketMessage("");
      switchTab("support");
      mGet<PageResult<SupportTicketView>>("/member/support-tickets", { page: 0, size: 10 }).then(setTickets).catch(() => void 0);
    } catch (e) {
      setTicketErr(e instanceof ApiError ? e.message : "提交失败,请稍后再试");
    } finally {
      setCaptchaToken("");
      setCaptchaResetKey((x) => x + 1);
    }
  }

  async function submitFollowUp(ticket: SupportTicketView) {
    const text = followUps[ticket.id]?.trim();
    if (!text) return;
    setTicketErr("");
    try {
      await mPost(`/member/support-tickets/${ticket.id}/messages`, { message: text });
      setFollowUps((m) => ({ ...m, [ticket.id]: "" }));
      mGet<PageResult<SupportTicketView>>("/member/support-tickets", { page: page - 1, size: 10 }).then(setTickets).catch(() => void 0);
    } catch (e) {
      setTicketErr(e instanceof ApiError ? e.message : "发送失败,请稍后再试");
    }
  }

  function copyInvite() {
    navigator.clipboard?.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  const TABS: { key: Tab; label: string; sub: string; icon: React.ReactNode }[] = [
    { key: "txns", label: "余额明细", sub: "资金流水", icon: <ReceiptText size={15} /> },
    { key: "orders", label: "我的订单", sub: "发货记录", icon: <Wallet size={15} /> },
    { key: "presale", label: "预售提货", sub: "履约状态", icon: <TicketCheck size={15} /> },
    { key: "support", label: "客服工单", sub: "售后沟通", icon: <MessageSquare size={15} /> },
    { key: "articles", label: "已购文章", sub: "内容解锁", icon: <BookOpen size={15} /> },
    { key: "withdrawals", label: "提现记录", sub: "审核进度", icon: <ArrowDownToLine size={15} /> },
    { key: "promo", label: "推广赚佣", sub: "邀请返佣", icon: <Megaphone size={15} /> },
  ];

  return (
    <div className="animate-fade-up">
      {/* 顶部:身份 + 钱包 */}
      <div className="mb-6 grid gap-5 lg:grid-cols-[1fr_400px]">
        <div className="card flex flex-col justify-between p-6 sm:p-7">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3.5">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-lg font-extrabold text-primary-contrast">
                {nickname.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{nickname}</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-primary">
                    <BadgePercent size={12} />
                    {me?.level?.name ?? "默认会员"}
                  </span>
                </div>
                <p className="text-xs text-ink/45">{me?.member.email}</p>
              </div>
            </div>
            <button className="btn-ghost !px-3 !py-2 text-xs" onClick={() => { memberLogout(); nav("/"); }}>
              <LogOut size={13} /> 退出
            </button>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-ink/[0.06] pt-5 text-center">
            <div>
              <p className="text-lg font-extrabold">{me?.invitedCount ?? 0}</p>
              <p className="mt-0.5 text-[11px] text-ink/40">已邀请好友</p>
            </div>
            <div>
              <p className="text-lg font-extrabold">{money(me?.commissionTotal ?? "0.00")}</p>
              <p className="mt-0.5 text-[11px] text-ink/40">累计佣金</p>
            </div>
            <div>
              <p className="text-lg font-extrabold">{me?.level?.discountRate ?? "100.00"}%</p>
              <p className="mt-0.5 text-[11px] text-ink/40">会员折扣率</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <button className="rounded-2xl border border-ink/10 px-4 py-3 text-sm font-bold text-ink transition hover:border-primary/30 hover:bg-accent-soft/60"
              onClick={() => switchTab("support")}>
              <span className="inline-flex items-center gap-2"><MessageSquare size={14} /> 提交工单</span>
            </button>
            <button className="rounded-2xl border border-ink/10 px-4 py-3 text-sm font-bold text-ink transition hover:border-primary/30 hover:bg-accent-soft/60"
              onClick={() => switchTab("orders")}>
              <span className="inline-flex items-center gap-2"><ReceiptText size={14} /> 查看订单</span>
            </button>
            <Link to="/redeem" className="rounded-2xl border border-ink/10 px-4 py-3 text-center text-sm font-bold text-ink transition hover:border-primary/30 hover:bg-accent-soft/60">
              <span className="inline-flex items-center gap-2"><TicketCheck size={14} /> 预售提货</span>
            </Link>
          </div>
        </div>

        {/* 两类余额使用普通排版,不增加独立告警框。 */}
        <div className="card p-6 sm:p-7">
          <p className="text-sm font-medium text-ink">我的钱包 · 人民币</p>
          <div className="mt-5 grid grid-cols-2 gap-5">
            <div><p className="text-xs text-ink/55">购物余额</p><p className="mt-2 break-words text-sm tabular-nums text-ink">{money(me?.shoppingBalance ?? "0.00", "CNY")}</p><p className="mt-1 text-[11px] text-ink/40">可购物，不可提现</p></div>
            <div><p className="text-xs text-ink/55">可提现余额</p><p className="mt-2 break-words text-sm tabular-nums text-ink">{money(me?.withdrawableBalance ?? "0.00", "CNY")}</p><p className="mt-1 text-[11px] text-ink/40">佣金收入，可购物或提现</p></div>
          </div>
          <div className="mt-5 space-y-1 border-t border-ink/[0.06] pt-4 text-[11px] leading-relaxed text-ink/45">
            <p>风控冻结：购物 {money(me?.shoppingFrozen ?? "0.00", "CNY")} · 可提现 {money(me?.withdrawableFrozen ?? "0.00", "CNY")}</p>
            <p>提现处理中：{money(me?.withdrawalFrozen ?? "0.00", "CNY")}</p>
            <p>购物优先使用购物余额，不足部分使用可提现余额。</p>
            {wallet?.freezeReason && <p className="break-words">冻结说明：{wallet.freezeReason}</p>}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <button onClick={() => { setModal("recharge"); setAmount(""); setModalErr(""); }} className="btn-ghost !px-2 !text-xs">充值</button>
            <button onClick={() => { setModal("gift"); setGiftCode(""); setModalErr(""); }} className="btn-ghost !px-2 !text-xs">兑换</button>
            <button onClick={() => { setModal("withdraw"); setAmount(""); setModalErr(""); }} className="btn-ghost !px-2 !text-xs">提现</button>
          </div>
        </div>
      </div>

      {/* Tab 栏 */}
      <div className="mb-5 overflow-x-auto rounded-3xl border border-ink/[0.07] bg-surface p-2 shadow-sm">
        <div className="grid min-w-[980px] grid-cols-7 gap-2">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => switchTab(t.key)}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                  active ? "bg-primary text-primary-contrast shadow-sm" : "text-ink/55 hover:bg-ink/[0.04] hover:text-ink"
                }`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                  active ? "bg-primary-contrast/15 text-primary-contrast" : "bg-accent-soft text-primary"
                }`}>
                  {t.icon}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-extrabold">{t.label}</span>
                  <span className={`mt-0.5 block truncate text-[11px] ${active ? "text-primary-contrast/65" : "text-ink/35"}`}>{t.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 内容 */}
      <div className="card overflow-x-auto">
        {tab === "txns" && (
          <>
            <table className="w-full min-w-[560px]">
              <thead><tr><th className="th">类型</th><th className="th">金额</th><th className="th">变动后余额</th><th className="th">备注</th><th className="th">时间</th></tr></thead>
              <tbody>
                {(txns?.items ?? []).map((t) => {
                  const n = Number(t.amount);
                  return (
                    <tr key={t.id} className="hover:bg-ink/[0.02]">
                      <td className="td font-medium">{TXN_LABEL[t.type] ?? t.type}</td>
                      <td className={`td font-bold ${n >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                        {n > 0 ? "+" : ""}{t.amount}
                      </td>
                      <td className="td">{money(t.balanceAfter)}</td>
                      <td className="td max-w-[200px] truncate text-xs text-ink/45">{t.remark ?? "-"}</td>
                      <td className="td text-xs text-ink/45">{fmtTime(t.createdAt)}</td>
                    </tr>
                  );
                })}
                {txns && txns.items.length === 0 && <tr><td className="td text-center text-ink/40" colSpan={5}>暂无余额变动</td></tr>}
              </tbody>
            </table>
            {txns && <Pager page={page} total={txns.total} size={10} onPage={setPage} />}
          </>
        )}

        {tab === "orders" && (
          <>
            <div className="space-y-3 p-1">
              {(orders?.items ?? []).map((o) => {
                const st = orderStatusMeta(o);
                const modeLabel = DELIVERY_MODE_LABEL[o.deliveryMode] ?? o.deliveryMode;
                const cardVisible = o.deliveryMode === "AUTO_CARD" && o.status === "DELIVERED" && o.cards.length > 0;
                const manualDone = o.deliveryMode === "MANUAL" && o.status === "DELIVERED" && !!o.deliveryContent;
                const presaleActive = o.deliveryMode === "PRESALE_VOUCHER" && ["PAID", "DELIVERED"].includes(o.status);
                return (
                  <div key={o.orderNo} className="rounded-3xl border border-ink/[0.06] bg-surface p-4 transition hover:border-primary/20 hover:shadow-soft">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-bold">{o.productName} × {o.quantity}</p>
                          <span className="rounded-full bg-ink/[0.04] px-2.5 py-1 text-[11px] font-bold text-ink/45">{modeLabel}</span>
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-ink/40">{o.orderNo}</p>
                        <p className="mt-1 text-[11px] text-ink/40">{fmtTime(o.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-extrabold">{money(o.amount)}</p>
                        {Number(o.walletPaidAmount) > 0 && <p className="mt-0.5 text-[11px] text-ink/40">余额抵扣 {money(o.walletPaidAmount)}</p>}
                        <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                      </div>
                    </div>

                    {o.status === "PENDING" && (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-500/[0.08] px-4 py-3">
                        <p className="text-xs leading-relaxed text-ink/55">等待付款</p>
                        <Link to={`/pay/${o.orderNo}`} className="btn-primary !px-4 !py-2 text-xs">继续支付</Link>
                      </div>
                    )}

                    {cardVisible && (
                      <div className="mt-4 space-y-2">
                        <p className="label !mb-1 flex items-center gap-1.5"><KeyRound size={13} /> 已发放卡密</p>
                        {o.cards.map((card, i) => {
                          const tag = `${o.orderNo}-${i}`;
                          return (
                            <SecretBlock key={tag} value={card} label={`卡密 ${i + 1}`} />
                          );
                        })}
                      </div>
                    )}

                    {manualDone && (
                      <div className="mt-4"><SecretBlock value={o.deliveryContent ?? ""} /></div>
                    )}

                    {o.deliveryMode === "MANUAL" && o.status === "PAID" && (
                      <p className="mt-4 rounded-2xl bg-sky-500/[0.08] px-4 py-3 text-xs leading-relaxed text-sky-600 dark:text-sky-400">
                        已付款，等待商家发货。
                      </p>
                    )}

                    {o.deliveryMode === "PRESALE_VOUCHER" && (
                      <div className="mt-4 rounded-2xl border border-primary/15 bg-accent-soft/55 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="flex items-center gap-1.5 text-sm font-bold text-primary"><TicketCheck size={14} /> 电子预售提货</p>
                          {o.presaleVoucherHint && o.presaleVoucherHint !== PENDING_PRESALE_HINT && (
                            <span className="font-mono text-[11px] text-ink/45">{o.presaleVoucherHint}</span>
                          )}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-ink/55">
                          {presaleActive
                            ? "付款已确认。请在下单浏览器领取提货码，保存后可兑换到当前账号。"
                            : "提货码未激活，无法兑换。"}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {presaleActive && <Link to="/redeem" className="btn-primary !px-4 !py-2 text-xs">去核销提货</Link>}
                          <Link to="/order" state={{ orderNo: o.orderNo, contact: me?.member.email }} className="btn-ghost !px-4 !py-2 text-xs">查询提货码</Link>
                        </div>
                      </div>
                    )}

                    {o.usageNote && (
                      <p className="mt-4 whitespace-pre-wrap rounded-2xl border border-ink/[0.06] px-4 py-3 text-xs leading-relaxed text-ink/55">{o.usageNote}</p>
                    )}
                  </div>
                );
              })}
              {orders && orders.items.length === 0 && (
                <div className="py-14 text-center text-ink/40">
                  暂无订单,<Link to="/" className="text-primary underline">去逛逛</Link>
                </div>
              )}
            </div>
            {orders && <Pager page={page} total={orders.total} size={10} onPage={setPage} />}
          </>
        )}

        {tab === "presale" && (
          <div className="space-y-3 p-1">
            {presales.map((v) => {
              const st = PRESALE_STATUS[v.status] ?? { label: v.status, cls: "bg-ink/[0.06] text-ink/45" };
              return (
                <div key={v.workNo} className="rounded-2xl border border-ink/[0.06] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold">{v.productName} × {v.quantity}</p>
                      <p className="mt-1 font-mono text-[11px] text-ink/40">{v.workNo} · {v.tokenHint}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-ink/45 sm:grid-cols-2">
                    <p>开放提货: {fmtTime(v.presaleStartAt)}</p>
                    <p>最晚截止: {fmtTime(v.presaleEndAt)}</p>
                    <p>核销时间: {fmtTime(v.redeemedAt)}</p>
                    <p>交付时间: {fmtTime(v.fulfilledAt)}</p>
                  </div>
                  {v.fulfillmentNote && <p className="mt-3 rounded-2xl bg-accent-soft/70 px-4 py-3 text-xs leading-relaxed text-ink/55">{v.fulfillmentNote}</p>}
                  {v.cards.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {v.cards.map((card, i) => (
                        <SecretBlock key={i} value={card} label={`卡密 ${i + 1}`} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {presales.length === 0 && (
              <div className="py-14 text-center text-ink/40">
                暂无已核销预售凭证,<Link to="/redeem" className="text-primary underline">去提货兑换中心</Link>
              </div>
            )}
          </div>
        )}

        {tab === "support" && (
          <div className="grid gap-5 p-1 lg:grid-cols-[360px_1fr]">
            <div className="rounded-2xl border border-ink/[0.06] p-4">
              <div className="mb-4 rounded-2xl bg-accent-soft/70 px-4 py-3">
                <p className="font-extrabold text-primary">提交工单</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/50">请说明遇到的问题，并附上相关订单号。</p>
              </div>
              <label className="label">标题</label>
              <input className="input mb-3" value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} placeholder="例如: 预售提货未到账" />
              <label className="label">关联订单号</label>
              <input className="input mb-3 font-mono text-xs" value={ticketOrderNo} onChange={(e) => setTicketOrderNo(e.target.value)} placeholder="选填" />
              <label className="label">问题描述</label>
              <textarea className="input min-h-28 text-sm" value={ticketMessage} onChange={(e) => setTicketMessage(e.target.value)} placeholder="请描述问题、退款地址或需要补充的信息" />
              {ticketErr && <p className="mt-3 text-xs text-red-500">{ticketErr}</p>}
              <CaptchaBox
                action="support_ticket"
                onToken={handleCaptchaToken}
                onEnabledChange={handleCaptchaEnabled}
                resetKey={captchaResetKey}
              />
              <button className="btn-primary mt-4 w-full" disabled={!ticketSubject.trim() || !ticketMessage.trim()} onClick={submitTicket}>提交</button>
            </div>
            <div className="space-y-3">
              {(tickets?.items ?? []).map((t) => (
                <div key={t.id} className="rounded-2xl border border-ink/[0.06] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="font-bold">{t.subject}</p><p className="mt-1 text-[11px] text-ink/40">{fmtTime(t.createdAt)} {t.relatedOrderNo && `· ${t.relatedOrderNo}`}</p></div>
                    <span className="chip !py-1 text-[11px]">{t.status}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(t.messages?.length ? t.messages : [
                      { id: 0, senderType: "MEMBER" as const, senderName: null, content: t.message, createdAt: t.createdAt },
                      ...(t.reply ? [{ id: -1, senderType: "STAFF" as const, senderName: "客服", content: t.reply, createdAt: t.repliedAt }] : []),
                    ]).map((m) => {
                      const staff = m.senderType === "STAFF";
                      return (
                        <div key={`${t.id}-${m.id}`} className={`rounded-2xl px-4 py-3 ${staff ? "bg-accent-soft/70" : "bg-ink/[0.04]"}`}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-ink/40">
                            <span className="font-bold">{staff ? "客服回复" : "我的消息"}</span>
                            <span>{fmtTime(m.createdAt)}</span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/70">{m.content}</p>
                        </div>
                      );
                    })}
                  </div>
                  {t.status === "CLOSED" ? (
                    <p className="mt-3 rounded-2xl bg-ink/[0.04] px-4 py-3 text-xs text-ink/45">该工单已关闭。如需继续处理,请提交新的工单。</p>
                  ) : t.canFollowUp ? (
                    <div className="mt-3 rounded-2xl border border-ink/[0.06] p-3">
                      <textarea className="input min-h-20 text-sm" placeholder="继续补充说明或回复客服"
                        value={followUps[t.id] ?? ""} onChange={(e) => setFollowUps((m) => ({ ...m, [t.id]: e.target.value }))} />
                      <button className="btn-primary mt-3 w-full !py-2.5 text-xs" disabled={!followUps[t.id]?.trim()} onClick={() => submitFollowUp(t)}>
                        发送回复
                      </button>
                    </div>
                  ) : (
                    <p className="mt-3 rounded-2xl bg-amber-500/[0.08] px-4 py-3 text-xs text-ink/50">
                      工单已提交,请等待客服回复。客服回复前不能连续追加消息。
                    </p>
                  )}
                </div>
              ))}
              {tickets && tickets.items.length === 0 && <p className="py-16 text-center text-sm text-ink/40">暂无工单</p>}
              {tickets && <Pager page={page} total={tickets.total} size={10} onPage={setPage} />}
            </div>
          </div>
        )}

        {tab === "articles" && (
          <>
            <table className="w-full min-w-[480px]">
              <thead><tr><th className="th">文章</th><th className="th">价格</th><th className="th">购买时间</th><th className="th"></th></tr></thead>
              <tbody>
                {(articles?.items ?? []).map((p) => (
                  <tr key={p.id} className="hover:bg-ink/[0.02]">
                    <td className="td max-w-[280px] truncate font-medium">{p.title}</td>
                    <td className="td font-bold">{money(p.price)}</td>
                    <td className="td text-xs text-ink/45">{fmtTime(p.createdAt)}</td>
                    <td className="td text-right">
                      {p.slug && <Link to={`/posts/${p.slug}`} className="text-xs font-semibold text-primary">阅读 →</Link>}
                    </td>
                  </tr>
                ))}
                {articles && articles.items.length === 0 && <tr><td className="td text-center text-ink/40" colSpan={4}>暂无已购文章,<Link to="/posts" className="text-primary underline">去看看</Link></td></tr>}
              </tbody>
            </table>
            {articles && <Pager page={page} total={articles.total} size={10} onPage={setPage} />}
          </>
        )}

        {tab === "withdrawals" && (
          <>
            <div className="mx-5 mt-5 grid grid-cols-3 gap-3 border-b border-ink/[0.06] pb-5 sm:mx-6">
              <div><p className="text-[11px] text-ink/45">可提现余额</p><p className="mt-2 break-words text-lg font-bold tabular-nums text-primary">{money(me?.withdrawableBalance ?? "0.00", "CNY")}</p></div>
              <div><p className="text-[11px] text-ink/45">提现处理中</p><p className="mt-2 break-words text-lg font-bold tabular-nums text-ink">{money(me?.withdrawalFrozen ?? "0.00", "CNY")}</p></div>
              <div><p className="text-[11px] text-ink/45">最低提现</p><p className="mt-2 break-words text-lg font-bold tabular-nums text-ink">{money(wallet?.minWithdraw ?? "0.00", "CNY")}</p></div>
            </div>
            <div className="divide-y divide-ink/[0.06] px-5 py-3 sm:px-6">
              {(withdrawals?.items ?? []).map((w) => {
                const st = WD_STATUS[w.status] ?? { label: w.status, cls: "bg-ink/[0.06] text-ink/45" };
                const channel = withdrawMethods.find((c) => c.code === w.channel)?.label
                  ?? ({ ALIPAY: "支付宝", BANK: "银行卡", USDT_BEP20: "USDT · BEP20", USDT_TRC20: "USDT · TRC20" }[w.channel] ?? w.channel);
                return <article key={w.id} className="py-5 first:pt-2">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-ink/40">#{w.id} · {fmtTime(w.createdAt)}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="grid min-w-0 gap-4 md:grid-cols-2 md:gap-8">
                    <WithdrawAmounts row={w} />
                    <div className="min-w-0 text-xs">
                      <p className="font-medium text-ink/70">{channel}</p>
                      <p className="mt-2 break-all leading-relaxed text-ink/45">{w.account}</p>
                      {w.accountName && <p className="mt-1 text-ink/45">{w.accountName}{w.bankName ? ` · ${w.bankName}` : ""}</p>}
                    </div>
                  </div>
                  {(w.reviewNote || w.status === "REJECTED") && <div role="note" className="mt-3 space-y-1 text-xs leading-relaxed text-ink/55">
                    <p className="font-normal text-ink/55">{w.status === "REJECTED" ? "拒绝原因" : "审核备注"}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-ink/55">{w.reviewNote?.trim() || DEFAULT_REJECT_NOTE}</p>
                    {w.status === "REJECTED" && <p className="mt-2 text-ink/40">{money(w.amount, "CNY")} 人民币已退回{w.withdrawableSource ? "可提现余额" : "购物余额"}，未收取手续费。</p>}
                  </div>}
                </article>;
              })}
              {withdrawals && withdrawals.items.length === 0 && <p className="py-12 text-center text-sm text-ink/40">暂无提现记录</p>}
            </div>
            {withdrawals && <Pager page={page} total={withdrawals.total} size={20} onPage={setPage} />}
          </>
        )}

        {tab === "promo" && (
          <div className="mx-auto max-w-xl py-4 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-soft">
              <Users size={22} className="text-primary" />
            </span>
            <h3 className="mt-4 text-lg font-bold">邀请好友,赚 {wallet?.commissionRate ?? "0"}% 佣金</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink/50">
              好友通过你的专属链接注册后,其每笔成功支付的订单都会按实付金额的 {wallet?.commissionRate ?? "0"}% 返佣,自动入账你的平台余额,可消费也可申请提现。
            </p>
            <div className="mx-auto mt-6 flex max-w-md items-center gap-2">
              <input className="input flex-1 !bg-ink/[0.03] text-xs" readOnly value={inviteLink} onFocus={(e) => e.target.select()} />
              <button className="btn-primary shrink-0 !px-4" onClick={copyInvite}>
                {copied ? <><Check size={14} /> 已复制</> : <><Copy size={14} /> 复制</>}
              </button>
            </div>
            <p className="mt-3 text-[11px] text-ink/35">邀请码:<span className="font-mono font-bold text-ink/60">{me?.member.inviteCode}</span></p>
          </div>
        )}
      </div>

      {/* 充值弹窗 */}
      {modal === "recharge" && (
        <Modal title="余额充值" onClose={() => setModal("")}>
          <p className="mb-4 rounded-2xl bg-accent-soft/70 px-4 py-3 text-xs leading-relaxed text-ink/55">
            选择充值金额
          </p>
          <div className="mb-4 grid grid-cols-4 gap-2">
            {["20", "50", "100", "200"].map((v) => (
              <button key={v}
                className={`rounded-2xl border px-3 py-3 text-sm font-extrabold transition ${
                  amount === v ? "border-primary/45 bg-accent-soft text-primary" : "border-ink/10 bg-surface text-ink/55 hover:border-primary/30 hover:text-ink"
                }`}
                onClick={() => { setAmount(v); setModalErr(""); }}>{money(v)}</button>
            ))}
          </div>
          <p className="mb-3 text-xs text-ink/55">充值进入购物余额，仅限消费，不可提现。</p>
          <label className="label">充值金额({currencyCode()})</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink/35">{currencySymbol()}</span>
            <input className="input !rounded-3xl !py-4 !pl-10 text-lg font-bold" placeholder="0.00" inputMode="decimal"
              maxLength={12} value={amount} aria-label="充值金额" aria-describedby="recharge-limit"
              onChange={(e) => changeAmount(e.target.value, MAX_RECHARGE, `单笔充值最高 ${money(MAX_RECHARGE.toFixed(2))}`)}
              onKeyDown={(e) => e.key === "Enter" && doRecharge()} />
          </div>
          <p id="recharge-limit" className="mt-2 text-[11px] text-ink/40">单笔充值范围：{money("1.00")}～{money(MAX_RECHARGE.toFixed(2))}，可自填部分金额，最多两位小数。未提现的余额仍可使用。</p>
          {modalErr && <p className="mt-3 text-xs text-red-500">{modalErr}</p>}
          <CaptchaBox
            action="wallet_recharge"
            onToken={handleCaptchaToken}
            onEnabledChange={handleCaptchaEnabled}
            resetKey={captchaResetKey}
          />
          <button className="btn-primary mt-5 w-full !py-4 !text-base" disabled={busy} onClick={doRecharge}>
            {busy ? <><Loader2 size={14} className="animate-spin" /> 创建订单中…</> : "去支付"}
          </button>
        </Modal>
      )}

      {modal === "gift" && (
        <Modal title="兑换礼品卡" onClose={() => setModal("")}>
          <p className="mb-4 rounded-2xl bg-accent-soft/70 px-4 py-3 text-xs leading-relaxed text-ink/55">
            兑换金额将存入余额。卡码不区分大小写。
          </p>
          <label className="label">礼品卡码</label>
          <input className="input !rounded-3xl !py-4 font-mono text-sm uppercase" placeholder="GC..."
            value={giftCode} onChange={(e) => setGiftCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && doRedeemGift()} />
          {modalErr && <p className="mt-3 text-xs text-red-500">{modalErr}</p>}
          <CaptchaBox
            action="gift_card_redeem"
            onToken={handleCaptchaToken}
            onEnabledChange={handleCaptchaEnabled}
            resetKey={captchaResetKey}
          />
          <button className="btn-primary mt-5 w-full !py-4 !text-base" disabled={busy} onClick={doRedeemGift}>
            {busy ? <><Loader2 size={14} className="animate-spin" /> 兑换中…</> : "确认兑换"}
          </button>
        </Modal>
      )}

      {/* 提现弹窗 */}
      {modal === "withdraw" && (
        <Modal title="申请提现" onClose={() => setModal("")}>
          <p className="mb-4 rounded-2xl bg-accent-soft/70 px-4 py-3 text-xs leading-relaxed text-ink/55">
            可提余额 <span className="font-bold text-ink">{money(me?.withdrawableBalance ?? "0.00", "CNY")}</span>
            {wallet && Number(wallet.minWithdraw) > 0 && <> · 最低提现 {money(wallet.minWithdraw)}</>}
            ,提交后需管理员审核,审核期间金额冻结。
          </p>
          <label className="label">提现金额（人民币）</label>
          <div className="relative mb-4">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink/35">{currencySymbol("CNY")}</span>
            <input className="input !rounded-3xl !py-4 !pl-10 !pr-24 text-lg font-bold" placeholder="0.00" inputMode="decimal"
              maxLength={21} value={amount} aria-label="提现金额" aria-describedby="withdraw-limit"
              onChange={(e) => changeAmount(e.target.value, Math.max(0, Number(me?.withdrawableBalance ?? 0)),
                `提现金额不能超过当前可提现余额 ${money(me?.withdrawableBalance ?? "0.00", "CNY")}`)} />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-ink/[0.05] px-3 py-1.5 text-[11px] font-bold text-ink/55 hover:bg-ink/[0.08]"
              onClick={() => { setAmount(me?.withdrawableBalance ?? "0.00"); setModalErr(""); }}>
              全部可提
            </button>
          </div>
          <p id="withdraw-limit" className="-mt-2 mb-4 text-[11px] text-ink/40">最多可提 {money(me?.withdrawableBalance ?? "0.00", "CNY")}，可自填部分金额，最多两位小数。未提现的余额仍可使用。</p>
          {Number.isFinite(requestedWithdraw) && requestedWithdraw > 0 && requestedWithdraw <= Number(me?.withdrawableBalance ?? 0) && <p className="mb-4 text-xs text-ink/55">本次申请 {money(amount, "CNY")} 人民币，申请后剩余可提现余额 {money((Number(me?.withdrawableBalance ?? 0) - requestedWithdraw).toFixed(2), "CNY")} 人民币。手续费从本次申请金额中扣除。</p>}
          {selectedWithdrawMethod && requestedWithdraw > 0 && (
            <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl border border-primary/15 bg-accent-soft/45 p-3 text-center">
              <div><p className="text-[10px] text-ink/40">余额扣除</p><p className="mt-1 text-sm font-bold">{money(amount, "CNY")}</p></div>
              <div><p className="text-[10px] text-ink/40">提现手续费</p><p className="mt-1 text-sm font-bold">-{money(withdrawFee.toFixed(2), "CNY")}</p></div>
              <div><p className="text-[10px] text-ink/40">扣费后人民币</p><p className="mt-1 text-sm font-extrabold text-primary">{money(withdrawNet.toFixed(2), "CNY")}</p></div>
            </div>
          )}
          {selectedWithdrawMethod?.code.startsWith("USDT_") && <p className="mb-4 text-xs leading-relaxed text-ink/60">USDT 打款金额 = 扣费后人民币 ÷ 申请时汇率，保留 6 位小数（向下取整）。提交后在提现记录查看固定的 USDT 金额。</p>}
          <label className="label">收款方式</label>
          {withdrawMethods.length === 0 ? (
            <div className="mb-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              商家暂未开放提现方式，当前无法提交申请。
            </div>
          ) : (
          <div className="mb-4 grid grid-cols-2 gap-2">
            {withdrawMethods.map((c) => (
              <button key={c.code}
                className={`rounded-2xl border px-3 py-3 text-sm font-extrabold transition ${
                  wdChannel === c.code ? "border-primary/45 bg-accent-soft text-primary" : "border-ink/10 bg-surface text-ink/55 hover:border-primary/30 hover:text-ink"
                }`}
                onClick={() => { setWdChannel(c.code); setWdAccount(""); setWdAccountName(""); setWdBankName(""); setModalErr(""); }}>{c.label}</button>
            ))}
          </div>
          )}
          {selectedWithdrawMethod && (() => {
            const method = selectedWithdrawMethod;
            return <div className="space-y-3">
              {method.accountNameRequired && <div>
                <label className="label">收款人真实姓名</label>
                <input className="input !rounded-3xl" placeholder="必须与收款账户实名一致" value={wdAccountName}
                  onChange={(e) => setWdAccountName(e.target.value)} />
              </div>}
              {method.bankNameRequired && <div>
                <label className="label">开户银行</label>
                <input className="input !rounded-3xl" placeholder="例：中国工商银行" value={wdBankName}
                  onChange={(e) => setWdBankName(e.target.value)} />
              </div>}
              <div>
                <label className="label">{method.accountLabel}</label>
                <input className="input !rounded-3xl font-mono" placeholder={method.accountPlaceholder}
                  value={wdAccount} onChange={(e) => setWdAccount(e.target.value)} />
              </div>
              <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">{method.warning}</p>
              {(Number(method.feeRate) > 0 || Number(method.feeFixed) > 0) && <p className="text-[11px] text-ink/40">手续费规则：{Number(method.feeRate) > 0 ? `${method.feeRate}%` : ""}{Number(method.feeRate) > 0 && Number(method.feeFixed) > 0 ? " + " : ""}{Number(method.feeFixed) > 0 ? money(method.feeFixed, "CNY") : ""}</p>}
            </div>;
          })()}
          {modalErr && <p className="mt-3 text-xs text-red-500">{modalErr}</p>}
          <CaptchaBox
            action="wallet_withdraw"
            onToken={handleCaptchaToken}
            onEnabledChange={handleCaptchaEnabled}
            resetKey={captchaResetKey}
          />
          <button className="btn-primary mt-5 w-full !py-4 !text-base" disabled={busy || withdrawMethods.length === 0} onClick={doWithdraw}>
            {busy ? <><Loader2 size={14} className="animate-spin" /> 提交中…</> : "提交审核"}
          </button>
        </Modal>
      )}
    </div>
  );
}
