import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, BadgeX, ChevronLeft, ChevronRight, HandCoins } from "lucide-react";
import { get, post } from "../../lib/api";
import SensitiveConfirm from "../../components/SensitiveConfirm";
import { money } from "../../lib/currency";

/**
 * 提现审核(withdraw:review):
 * - 通过 = 线下打款完成后确认,冻结金额正式扣除
 * - 驳回 = 冻结金额解冻退回会员余额
 */

interface WithdrawRow {
  id: number; memberId: number; memberEmail: string;
  amount: string; channel: string; account: string;
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
  REJECTED: { label: "已驳回", cls: "bg-red-500/10 text-red-500" },
};
const CHANNEL_LABEL: Record<string, string> = { ALIPAY: "支付宝", USDT: "USDT", BANK: "银行卡" };
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
    const finalNote = note.trim() || (!review.approve ? "提现申请未通过审核,请核对收款信息后重新提交" : undefined);
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

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <thead><tr>
            <th className="th">会员</th><th className="th">金额</th><th className="th">收款方式</th>
            <th className="th">申请时间</th><th className="th">状态</th><th className="th">审核信息</th>
            <th className="th text-right">操作</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td className="td py-14 text-center text-ink/40" colSpan={7}>加载中…</td></tr>
            ) : !data || data.items.length === 0 ? (
              <tr><td className="td py-14 text-center" colSpan={7}>
                <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-accent-soft">
                  <HandCoins size={18} className="text-primary" />
                </span>
                <span className="text-sm text-ink/40">{status === "PENDING" ? "没有待审核的提现申请" : "暂无记录"}</span>
              </td></tr>
            ) : (
              data.items.map((r) => (
                <tr key={r.id} className="align-top hover:bg-ink/[0.02]">
                  <td className="td">
                    <div className="font-semibold text-ink">{r.memberEmail}</div>
                    <div className="text-xs text-ink/40">会员 #{r.memberId} · 申请 #{r.id}</div>
                  </td>
                  <td className="td">
                    <span className="rounded-2xl bg-accent-soft px-3 py-2 text-sm font-extrabold text-primary">{money(r.amount)}</span>
                  </td>
                  <td className="td">
                    <div className="inline-flex rounded-full border border-ink/10 px-2.5 py-1 text-[11px] font-semibold">
                      {CHANNEL_LABEL[r.channel] ?? r.channel}
                    </div>
                    <div className="mt-2 max-w-[260px] break-all rounded-2xl bg-ink/[0.04] px-3 py-2 font-mono text-[11px] text-ink/60">{r.account}</div>
                  </td>
                  <td className="td text-xs">{fmt(r.createdAt)}</td>
                  <td className="td">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_PILL[r.status].cls}`}>
                      {STATUS_PILL[r.status].label}
                    </span>
                  </td>
                  <td className="td text-xs">
                    {r.reviewedBy ? (
                      <>
                        <div>{r.reviewedBy} · {fmt(r.reviewedAt)}</div>
                        {r.reviewNote && <div className="mt-0.5 max-w-[200px] text-ink/45">{r.reviewNote}</div>}
                      </>
                    ) : "—"}
                  </td>
                  <td className="td text-right">
                    {r.status === "PENDING" && (
                      <div className="flex justify-end gap-2">
                        <button className="rounded-full bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-500/15 dark:text-emerald-400"
                          onClick={() => openReview(r, true)}>
                          <span className="inline-flex items-center gap-1.5"><BadgeCheck size={13} /> 通过</span>
                        </button>
                        <button className="rounded-full bg-red-500/10 px-3.5 py-2 text-xs font-semibold text-red-500 transition hover:bg-red-500/15"
                          onClick={() => openReview(r, false)}>
                          <span className="inline-flex items-center gap-1.5"><BadgeX size={13} /> 驳回</span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
                <div className="flex justify-between gap-3"><span className="text-ink/45">金额</span><span className="font-bold">{money(review.row.amount)}</span></div>
                <div className="flex justify-between gap-3">
                  <span className="shrink-0 text-ink/45">收款</span>
                  <span className="break-all text-right font-mono text-xs">{CHANNEL_LABEL[review.row.channel] ?? review.row.channel} / {review.row.account}</span>
                </div>
                <p className="pt-1 text-[11px] leading-relaxed text-ink/40">
                  {review.approve
                    ? "请先在线下完成打款再确认;冻结金额将正式扣除,不可撤销。"
                    : "驳回后冻结金额自动退回会员余额;原因会员端可见。"}
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
          <label className="label">{review.approve ? "备注(选填,如打款流水号)" : "驳回原因(建议填写)"}</label>
          <textarea className="input mb-4 min-h-[76px] resize-none text-sm leading-relaxed" maxLength={255} value={note}
            placeholder={review.approve ? "例:支付宝转账已打款" : "例:收款账户信息有误,请核对后重新提交"}
            onChange={(e) => setNote(e.target.value)} />
        </SensitiveConfirm>
      )}
    </div>
  );
}
