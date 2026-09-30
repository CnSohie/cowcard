import { money } from "../lib/currency";

export interface WithdrawAmountsData {
  amount: string; feeAmount: string; netAmount: string; channel: string;
  payoutAmount: string | null; payoutCurrency: string | null; payoutFxRate: string | null;
  status: string; withdrawableSource?: boolean;
}

export default function WithdrawAmounts({ row, expanded = false }: { row: WithdrawAmountsData; expanded?: boolean }) {
  const crypto = row.channel.startsWith("USDT_");
  const rejected = row.status === "REJECTED";
  const payout = crypto ? (row.payoutAmount ? `${row.payoutAmount} USDT` : "打款金额待核实") : `${money(row.payoutAmount ?? row.netAmount, "CNY")} 人民币`;
  const breakdown = <dl className="mt-3 space-y-2 text-xs text-ink/55">
    <div className="flex justify-between gap-4"><dt>申请金额</dt><dd>{money(row.amount, "CNY")} 人民币</dd></div>
    <div className="flex justify-between gap-4"><dt>手续费{rejected ? "（未收取）" : ""}</dt><dd>{money(row.feeAmount, "CNY")} 人民币</dd></div>
    {!rejected && <div className="flex justify-between gap-4"><dt>扣费后净额</dt><dd>{money(row.netAmount, "CNY")} 人民币</dd></div>}
    {!rejected && crypto && row.payoutFxRate && <div className="space-y-1"><dt>申请汇率</dt><dd>1 USDT = {String(row.payoutFxRate).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")} 人民币</dd><dd className="text-[11px] text-ink/40">净额 ÷ 汇率，保留 6 位小数，向下取整</dd></div>}
  </dl>;
  return <div className="min-w-0 text-left">
    <p className="text-[11px] text-ink/45">{rejected ? (row.withdrawableSource === false ? "已退回购物余额" : "已退回可提现余额") : row.status === "APPROVED" ? "已打款" : "实际应打款 · 已扣手续费"}</p>
    <p className="mt-1 break-words text-sm font-normal tabular-nums text-ink/80">{rejected ? `${money(row.amount, "CNY")} 人民币` : payout}</p>
    <p className="mt-1 text-xs text-ink/45">{rejected ? "未收取手续费" : `申请 ${money(row.amount, "CNY")} · 手续费 ${money(row.feeAmount, "CNY")}（人民币）`}</p>
    {crypto && !row.payoutAmount && !rejected && <p className="mt-2 text-xs text-ink/55">{row.status === "PENDING" ? "缺少历史汇率，请驳回后重新申请" : "历史打款金额未记录"}</p>}
    {expanded ? breakdown : !rejected && crypto && row.payoutFxRate && <details className="mt-2"><summary className="cursor-pointer text-[11px] text-ink/50">换算明细</summary>{breakdown}</details>}
  </div>;
}
