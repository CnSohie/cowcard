import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, BadgeX, ChevronLeft, ChevronRight, HandCoins } from "lucide-react";
import { get, post } from "../../lib/api";
import SensitiveConfirm from "../../components/SensitiveConfirm";
import WithdrawAmounts from "../../components/WithdrawAmounts";

/**
 * 提现审核(withdraw:review):
 * - 通过 = 线下打款完成后确认,冻结金额正式扣除
 * - 驳回 = 冻结金额解冻退回会员余额
 */

interface WithdrawRow {
  id: number; memberId: number; memberEmail: string;
  withdrawableSource: boolean;
  payoutAmount: string | null; payoutCurrency: string | null; payoutFxRate: string | null;
  amount: string; feeAmount: string; netAmount: string; channel: string; account: string; accountName: string | null; bankName: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedBy: string | null; reviewNote: string | null;
  createdAt: string; reviewedAt: string | null;
}
interface PageResult<T> { items: T[]; total: number; page: number; size: number; }
interface ListResp { page: PageResult<WithdrawRow>; pendingCount: number; }

const SIZE = 15;

const STATUS_TABS = [
  { value: "PENDING", label: "待审核" },
  { value: "", label: "全部" },
  { value: "APPROVED", label: "已打款" },
  { value: "REJECTED", label: "已驳回" },
];
const STATUS_PILL: Record<WithdrawRow["status"], { label: string; cls: string }> = {
  PENDING: { label: "待审核", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  APPROVED: { label: "已打款", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  REJECTED: { label: "已驳回", cls: "text-ink/50" },
};
const CHANNEL_LABEL: Record<string, string> = { ALIPAY: "支付宝", BANK: "银行卡", USDT_TRC20: "USDT · TRC20", USDT_BEP20: "USDT · BEP20" };
const REJECT_REASONS = [
  "收款账户信息有误,请核对后重新提交",
  "收款姓名与账户信息不一致",
  "收款渠道或网络填写不完整",
  "提现金额或账户存在异常,请联系客服核实",
  "风控审核未通过,请补充资料后再提交",
];

function fmt(s: string | null) {
  return s ? new Date(s).toLocaleString() : "—";
}

export default function WithdrawalsAdmin() {
  const [status, setStatus] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PageResult<WithdrawRow> | null>(null);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);

  // 审核弹窗(密码 + 2FA 双因子确认)
  const [review, setReview] = useState<{ row: WithdrawRow; approve: boolean } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    get<ListResp>("/admin/withdrawals", { status: status || undefined, page: page - 1, size: SIZE })
      .then((r) => { setData(r.page); setPending(r.pendingCount); })
      .catch(() => void 0)
      .finally(() => setLoading(false));
  }, [status, page]);
  useEffect(load, [load]);

  function openReview(row: WithdrawRow, approve: boolean) {
    setReview({ row, approve });
    setNote("");
  }

  async function submitReview(auth: { password: string; totpCode: string }) {
    if (!review) return;
    if (!review.approve && !note.trim()) throw new Error("请填写具体的驳回原因，会员将看到此说明");
    const finalNote = note.trim() || undefined;
    await post(`/admin/withdrawals/${review.row.id}/${review.approve ? "approve" : "reject"}`,
      { ...auth, note: finalNote });
    setReview(null);
    load();
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / SIZE)) : 1;

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">提现审核</h1>
          <p className="mt-1 text-xs text-ink/45">申请金额先行冻结;通过后扣除,驳回自动解冻退回余额</p>
        </div>
        {pending > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
            <HandCoins size={13} /> {pending} 笔待处理
          </span>
        )}
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-ink/[0.06] bg-surface p-4">
          <p className="text-[11px] font-semibold text-ink/40">当前待处理</p>
          <p className="mt-1 text-2xl font-extrabold">{pending}</p>
        </div>
        <div className="rounded-2xl border border-ink/[0.06] bg-accent-soft/70 p-4">
          <p className="text-[11px] font-semibold text-primary/70">审核动作</p>
          <p className="mt-1 text-sm font-bold text-primary">通过扣除冻结 · 驳回自动解冻</p>
        </div>
        <div className="rounded-2xl border border-ink/[0.06] bg-surface p-4">
          <p className="text-[11px] font-semibold text-ink/40">安全策略</p>
          <p className="mt-1 text-sm font-bold">管理员密码 + 2FA</p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-ink/10 bg-surface p-1 shadow-sm">
          {STATUS_TABS.map((t) => (
            <button key={t.value}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                status === t.value ? "bg-primary text-primary-contrast shadow-sm" : "text-ink/50 hover:text-ink"
              }`}
              onClick={() => { setStatus(t.value); setPage(1); }}>
              {t.label}{t.value === "PENDING" && pending > 0 ? ` · ${pending}` : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="card divide-y divide-ink/[0.06] overflow-hidden">
        {loading ? <p className="py-14 text-center text-sm text-ink/40">加载中…</p>
          : !data?.items.length ? <p className="py-14 text-center text-sm text-ink/40">{status === "PENDING" ? "没有待审核的提现申请" : "暂无记录"}</p>
          : data.items.map((r) => <article key={r.id} className="p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="break-all text-sm font-semibold text-ink">{r.memberEmail}</p>
                <p className="mt-1 text-[11px] text-ink/40">申请 #{r.id} · 会员 #{r.memberId} · {fmt(r.createdAt)}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_PILL[r.status].cls}`}>{STATUS_PILL[r.status].label}</span>
            </div>
            <div className="grid min-w-0 gap-5 lg:grid-cols-[1fr_1fr_auto] lg:gap-8">
              <WithdrawAmounts row={r} />
              <div className="min-w-0 text-xs">
                <p className="font-semibold text-ink/70">{CHANNEL_LABEL[r.channel] ?? r.channel}</p>
                <p className="mt-2 break-all leading-relaxed text-ink/55">{r.account}</p>
                {r.accountName && <p className="mt-2 text-ink/55">{r.accountName}{r.bankName ? ` · ${r.bankName}` : ""}</p>}
              </div>
              {r.status === "PENDING" && <div className="flex items-start gap-2">
                <button className="btn-primary !px-4 !py-2 !text-xs" disabled={r.channel.startsWith("USDT_") && !r.payoutAmount} onClick={() => openReview(r, true)}><BadgeCheck size={14} />通过</button>
                <button className="btn-ghost !px-4 !py-2 !text-xs" onClick={() => openReview(r, false)}><BadgeX size={14} />驳回</button>
              </div>}
            </div>
            {(r.reviewNote || r.status === "REJECTED") && <div className="mt-3 space-y-1 text-xs leading-relaxed text-ink/55">
              <p className="font-normal text-ink/55">{r.status === "REJECTED" ? "拒绝原因" : "审核备注"}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-ink/55">{r.reviewNote || "历史记录未填写原因，请联系客服"}</p>
              {r.reviewedBy && <p className="mt-2 text-[11px] text-ink/35">{r.reviewedBy} · {fmt(r.reviewedAt)}</p>}
            </div>}
          </article>)}
      </div>

      {data && totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <button className="btn-ghost !px-3.5" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button>
          <span className="text-sm text-ink/50">第 {page} / {totalPages} 页</span>
          <button className="btn-ghost !px-3.5" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button>
        </div>
      )}

      {/* 审核确认:密码 + 2FA 双因子 */}
      {review && (
        <SensitiveConfirm
          action={{
            title: review.approve ? "通过提现申请" : "驳回提现申请",
            confirmText: review.approve ? "确认已打款,正式扣除" : "确认驳回并解冻退回",
            danger: !review.approve,
            summary: (
              <div className="space-y-1">
                <div className="flex justify-between gap-3"><span className="text-ink/45">会员</span><span className="font-medium">{review.row.memberEmail}</span></div>
                <div className="border-y border-ink/[0.06] py-4 my-3"><WithdrawAmounts row={review.row} expanded /></div>
                <div className="flex justify-between gap-3">
                  <span className="shrink-0 text-ink/45">收款</span>
                  <span className="break-all text-right font-mono text-xs">{CHANNEL_LABEL[review.row.channel] ?? review.row.channel} / {review.row.account}</span>
                </div>
                {review.row.accountName && <p>收款人：{review.row.accountName}</p>}
                {review.row.bankName && <p>开户银行：{review.row.bankName}</p>}
                <p className="pt-1 text-[11px] leading-relaxed text-ink/40">
                  {review.approve
                    ? "请先在线下完成打款再确认;冻结金额将正式扣除,不可撤销。"
                    : (review.row.withdrawableSource ? "驳回后退回可提现余额；原因会员端可见。" : "历史申请驳回后退回购物余额，不可再次提现；原因会员端可见。")}
                </p>
              </div>
            ),
          }}
          onConfirm={submitReview}
          onClose={() => setReview(null)}
        >
          {!review.approve && (
            <div className="mb-4">
              <label className="label">常用驳回理由</label>
              <div className="flex flex-wrap gap-2">
                {REJECT_REASONS.map((reason) => (
                  <button key={reason} type="button"
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                      note === reason ? "border-primary/45 bg-accent-soft text-primary" : "border-ink/10 bg-surface text-ink/55 hover:border-primary/30 hover:text-ink"
                    }`}
                    onClick={() => setNote(reason)}>
                    {reason}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="label">{review.approve ? "备注(选填,如打款流水号)" : "驳回原因（必填，会员可见）"}</label>
          <textarea className="input mb-4 min-h-[76px] resize-none text-sm leading-relaxed" maxLength={255} value={note}
            placeholder={review.approve ? "例:支付宝转账已打款" : "例:收款账户信息有误,请核对后重新提交"}
            onChange={(e) => setNote(e.target.value)} />
        </SensitiveConfirm>
      )}
    </div>
  );
}
