import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus, Search } from "lucide-react";
import { ApiError, get, post } from "../../lib/api";
import SensitiveConfirm from "../../components/SensitiveConfirm";

interface RiskItem { id: number; sourceType: string; sourceId: string | null; subject: string; reason: string; severity: string; status: string; createdBy: string | null; reviewedBy: string | null; reviewNote: string | null; createdAt: string; reviewedAt: string | null; }
interface PageResult<T> { items: T[]; total: number; page: number; size: number; }

const SEV: Record<string, string> = {
  LOW: "bg-ink/[0.06] text-ink/45",
  MEDIUM: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  HIGH: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  CRITICAL: "bg-red-500/10 text-red-500",
};

export default function RiskReviewsAdmin() {
  const [data, setData] = useState<PageResult<RiskItem> | null>(null);
  const [status, setStatus] = useState("PENDING");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("");
  const [sourceType, setSourceType] = useState("ORDER");
  const [sourceId, setSourceId] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [reason, setReason] = useState("");
  const [reviewing, setReviewing] = useState<{ item: RiskItem; status: string } | null>(null);
  const [note, setNote] = useState("");

  function load() {
    setLoading(true);
    get<PageResult<RiskItem>>("/admin/risk-reviews", { status: status || undefined, q: q || undefined, page: 0, size: 50 })
      .then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "风控队列加载失败"))
      .finally(() => setLoading(false));
  }
  useEffect(load, [status]);

  async function create() {
    if (!subject.trim() || !reason.trim()) return;
    await post("/admin/risk-reviews", { sourceType, sourceId: sourceId || undefined, subject, reason, severity });
    setSubject(""); setSourceId(""); setReason("");
    load();
  }

  async function exec(auth: { password: string; totpCode: string }) {
    if (!reviewing) return;
    await post(`/admin/risk-reviews/${reviewing.item.id}/review`, { status: reviewing.status, note, ...auth });
    setReviewing(null); setNote("");
    load();
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-extrabold tracking-tight">风控审核队列</h1><p className="mt-1 text-xs text-ink/40">异常订单、用户、支付与预售清算统一进入这里处理。</p></div>
        <div className="relative w-full sm:w-72"><Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" /><input className="input !py-2 !pl-10 text-xs" placeholder="搜索主题 / 来源 ID" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} /></div>
      </div>
      <div className="card mb-5 grid gap-3 p-4 lg:grid-cols-[120px_1fr_140px_120px_1fr_auto]">
        <select className="input" value={sourceType} onChange={(e) => setSourceType(e.target.value)}><option>ORDER</option><option>MEMBER</option><option>PAYMENT</option><option>PRESALE</option></select>
        <input className="input" placeholder="来源 ID / 订单号" value={sourceId} onChange={(e) => setSourceId(e.target.value)} />
        <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select>
        <input className="input" placeholder="主题" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <input className="input" placeholder="风控原因" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn-primary" onClick={create}><Plus size={14} /> 加入队列</button>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">{["", "PENDING", "APPROVED", "REJECTED", "CLOSED"].map((s) => <button key={s} className={`chip !py-2 ${status === s ? "chip-on" : ""}`} onClick={() => setStatus(s)}>{s || "全部"}</button>)}</div>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead><tr><th className="th">风险项</th><th className="th">来源</th><th className="th">等级</th><th className="th">状态</th><th className="th">说明</th><th className="th"></th></tr></thead>
          <tbody>
            {loading && <tr><td className="td py-12 text-center" colSpan={6}><Loader2 className="mx-auto animate-spin text-ink/30" size={18} /></td></tr>}
            {!loading && (data?.items ?? []).map((r) => (
              <tr key={r.id} className="hover:bg-ink/[0.03]">
                <td className="td"><p className="font-bold">{r.subject}</p><p className="text-[11px] text-ink/40">{new Date(r.createdAt).toLocaleString()}</p></td>
                <td className="td text-xs">{r.sourceType} {r.sourceId && `· ${r.sourceId}`}</td>
                <td className="td"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${SEV[r.severity]}`}>{r.severity}</span></td>
                <td className="td text-xs">{r.status}</td>
                <td className="td max-w-[280px] text-xs text-ink/55"><p className="line-clamp-2">{r.reason}</p>{r.reviewNote && <p className="mt-1 text-primary">{r.reviewNote}</p>}</td>
                <td className="td text-right">{r.status === "PENDING" && <div className="flex justify-end gap-2"><button className="btn-ghost !px-3 !py-2 text-xs" onClick={() => setReviewing({ item: r, status: "APPROVED" })}><AlertTriangle size={13} /> 放行</button><button className="btn-ghost !px-3 !py-2 text-xs !text-red-500" onClick={() => setReviewing({ item: r, status: "REJECTED" })}>驳回</button></div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reviewing && <SensitiveConfirm action={{ title: "处理风控项", confirmText: "确认处理", danger: reviewing.status === "REJECTED", summary: <span>{reviewing.item.subject} · {reviewing.status}</span> }} onClose={() => setReviewing(null)} onConfirm={exec}>
        <label className="label">审核备注</label><textarea className="input mb-4 min-h-20" value={note} onChange={(e) => setNote(e.target.value)} placeholder="处理依据 / 后续动作" />
      </SensitiveConfirm>}
    </div>
  );
}
