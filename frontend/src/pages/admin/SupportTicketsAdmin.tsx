import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, MessageSquare, Search, XCircle } from "lucide-react";
import { ApiError, get, post } from "../../lib/api";

interface TicketMessage { id: number; senderType: "MEMBER" | "STAFF"; senderName: string | null; content: string; createdAt: string | null; }
interface Ticket { id: number; memberId: number | null; subject: string; category: string | null; relatedOrderNo: string | null; message: string; reply: string | null; status: string; priority: string; repliedBy: string | null; createdAt: string; updatedAt: string; repliedAt: string | null; messages: TicketMessage[]; }
interface PageResult<T> { items: T[]; total: number; page: number; size: number; }
interface TicketStats { pending: number; open: number; waitingUser: number; answered: number; closed: number; total: number; }

const STATUS_META: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "待处理", cls: "bg-red-500/10 text-red-500" },
  ANSWERED: { label: "已回复", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  WAITING_USER: { label: "待用户补充", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  CLOSED: { label: "已关闭", cls: "bg-ink/[0.06] text-ink/45" },
};
const PRIORITY_LABEL: Record<string, string> = { LOW: "低", NORMAL: "普通", HIGH: "高" };

export default function SupportTicketsAdmin() {
  const [data, setData] = useState<PageResult<Ticket> | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    setError("");
    get<PageResult<Ticket>>("/admin/support-tickets", { status: status || undefined, q: q || undefined, page: 0, size: 50 })
      .then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "工单加载失败"))
      .finally(() => setLoading(false));
    get<TicketStats>("/admin/support-tickets/stats").then(setStats).catch(() => void 0);
  }
  useEffect(load, [status]);

  async function save(nextStatus = "ANSWERED") {
    if (!selected) return;
    setError("");
    try {
      await post(`/admin/support-tickets/${selected.id}/reply`, { reply, status: nextStatus, priority: selected.priority });
      setSelected(null); setReply("");
      window.dispatchEvent(new Event("ka:support-updated"));
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "工单保存失败");
    }
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-extrabold tracking-tight">客服工单</h1><p className="mt-1 text-xs text-ink/40">处理会员售后、退款地址、预售履约和订单问题。</p></div>
        <div className="relative w-full sm:w-72"><Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" /><input className="input !py-2 !pl-10 text-xs" placeholder="搜索标题 / 订单号" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} /></div>
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "待处理", value: stats?.pending ?? 0, icon: AlertCircle, cls: "bg-red-500/10 text-red-500" },
          { label: "已回复", value: stats?.answered ?? 0, icon: CheckCircle2, cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
          { label: "待用户补充", value: stats?.waitingUser ?? 0, icon: Clock, cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
          { label: "已关闭", value: stats?.closed ?? 0, icon: XCircle, cls: "bg-ink/[0.06] text-ink/45" },
        ].map((s) => (
          <section key={s.label} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-medium text-ink/45">{s.label}</p><p className="mt-2 text-2xl font-extrabold">{s.value}</p></div>
              <span className={`grid h-10 w-10 place-items-center rounded-2xl ${s.cls}`}><s.icon size={18} /></span>
            </div>
          </section>
        ))}
      </div>
      {stats && stats.pending > 0 && (
        <div className="mb-4 rounded-3xl border border-red-500/15 bg-red-500/[0.07] px-5 py-4 text-sm font-semibold text-red-500">
          当前有 {stats.pending} 个用户工单等待处理
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-2">{["", "OPEN", "ANSWERED", "WAITING_USER", "CLOSED"].map((s) => <button key={s} className={`chip !py-2 ${status === s ? "chip-on" : ""}`} onClick={() => setStatus(s)}>{s ? STATUS_META[s]?.label ?? s : "全部"}</button>)}</div>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[780px]">
            <thead><tr><th className="th">工单</th><th className="th">会员</th><th className="th">订单</th><th className="th">状态</th><th className="th">时间</th></tr></thead>
            <tbody>
              {loading && <tr><td className="td py-12 text-center" colSpan={5}><Loader2 className="mx-auto animate-spin text-ink/30" size={18} /></td></tr>}
              {!loading && (data?.items ?? []).map((t) => (
                <tr key={t.id} className="cursor-pointer hover:bg-ink/[0.03]" onClick={() => { setSelected(t); setReply(t.reply ?? ""); }}>
                  <td className="td"><p className="font-bold">{t.subject}</p><p className="line-clamp-1 text-xs text-ink/45">{t.message}</p></td>
                  <td className="td text-xs">{t.memberId ? `#${t.memberId}` : "-"}</td>
                  <td className="td font-mono text-xs">{t.relatedOrderNo ?? "-"}</td>
                  <td className="td text-xs">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_META[t.status]?.cls ?? "bg-ink/[0.06] text-ink/45"}`}>
                      {STATUS_META[t.status]?.label ?? t.status}
                    </span>
                    <span className="ml-2 text-ink/35">{PRIORITY_LABEL[t.priority] ?? t.priority}</span>
                  </td>
                  <td className="td text-xs text-ink/45">{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card h-fit p-5">
          {selected ? (
            <>
              <p className="mb-2 flex items-center gap-2 font-bold"><MessageSquare size={16} /> {selected.subject}</p>
              <div className="mb-4 max-h-80 space-y-2 overflow-y-auto rounded-2xl bg-ink/[0.025] p-3">
                {(selected.messages?.length ? selected.messages : [
                  { id: 0, senderType: "MEMBER" as const, senderName: null, content: selected.message, createdAt: selected.createdAt },
                  ...(selected.reply ? [{ id: -1, senderType: "STAFF" as const, senderName: selected.repliedBy, content: selected.reply, createdAt: selected.repliedAt }] : []),
                ]).map((m) => {
                  const staff = m.senderType === "STAFF";
                  return (
                    <div key={m.id} className={`rounded-2xl px-4 py-3 ${staff ? "bg-accent-soft/80" : "bg-surface"}`}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-ink/40">
                        <span className="font-bold">{staff ? `客服 ${m.senderName ?? ""}` : `会员 #${selected.memberId ?? "-"}`}</span>
                        <span>{m.createdAt ? new Date(m.createdAt).toLocaleString() : "-"}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/70">{m.content}</p>
                    </div>
                  );
                })}
              </div>
              <label className="label">客服回复</label>
              <textarea className="input min-h-36 text-sm" value={reply} onChange={(e) => setReply(e.target.value)} />
              <div className="mt-4 grid grid-cols-3 gap-2">
                <button className="btn-primary" onClick={() => save("ANSWERED")}>回复</button>
                <button className="btn-ghost" onClick={() => save("WAITING_USER")}>待补充</button>
                <button className="btn-ghost !text-red-500" onClick={() => save("CLOSED")}>关闭</button>
              </div>
            </>
          ) : <p className="py-16 text-center text-sm text-ink/40">选择左侧工单处理</p>}
        </div>
      </div>
    </div>
  );
}
