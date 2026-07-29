import { useEffect, useMemo, useState } from "react";
import { Gift, Loader2, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { ApiError, get, post } from "../../lib/api";
import SensitiveConfirm from "../../components/SensitiveConfirm";
import { money } from "../../lib/currency";

interface GiftCard { id: number; batchNo: string; name: string; code: string; amount: string; status: string; redeemedBy: number | null; expireAt: string | null; createdAt: string; }
interface PageResult<T> { items: T[]; total: number; page: number; size: number; }
type PendingAction = { kind: "generate" } | { kind: "toggle"; card: GiftCard } | { kind: "delete"; card: GiftCard };

const STATUS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  DISABLED: "bg-ink/[0.06] text-ink/45",
  REDEEMED: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

export default function GiftCardsAdmin() {
  const [data, setData] = useState<PageResult<GiftCard> | null>(null);
  const [q, setQ] = useState("");
  const [name, setName] = useState("礼品卡");
  const [amount, setAmount] = useState("10.00");
  const [quantity, setQuantity] = useState(10);
  const [expireAt, setExpireAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);

  function load() {
    setLoading(true);
    get<PageResult<GiftCard>>("/admin/gift-cards", { q: q || undefined, page: 0, size: 80 })
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "礼品卡加载失败"))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const stats = useMemo(() => {
    const items = data?.items ?? [];
    return {
      active: items.filter((x) => x.status === "ACTIVE").length,
      redeemed: items.filter((x) => x.status === "REDEEMED").length,
      disabled: items.filter((x) => x.status === "DISABLED").length,
    };
  }, [data]);

  async function exec(auth: { password: string; totpCode: string }) {
    if (!pending) return;
    if (pending.kind === "generate") {
      await post("/admin/gift-cards/generate", { name, amount, quantity, expireAt: expireAt || null, ...auth });
    } else if (pending.kind === "toggle") {
      await post(`/admin/gift-cards/${pending.card.id}/toggle`, {
        enabled: pending.card.status !== "ACTIVE",
        ...auth,
      });
    } else {
      await post(`/admin/gift-cards/${pending.card.id}/delete`, auth);
    }
    setPending(null);
    load();
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">礼品卡</h1>
          <p className="mt-1 text-xs text-ink/40">生成、启停和删除都需要 2FA,已兑换卡不可修改。</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
          <input className="input !py-2 !pl-10 text-xs" placeholder="批次 / 名称 / 卡码" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        </div>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card grid gap-3 p-4 md:grid-cols-[1fr_130px_110px_190px_auto]">
          <input className="input" placeholder="批次名称" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="面额" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="input" type="number" min={1} max={10000} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          <input className="input" type="datetime-local" value={expireAt} onChange={(e) => setExpireAt(e.target.value)} />
          <button className="btn-primary" onClick={() => setPending({ kind: "generate" })}><Plus size={14} /> 生成</button>
        </div>
        <div className="card grid grid-cols-3 gap-2 p-4 text-center">
          <div><p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{stats.active}</p><p className="text-[11px] text-ink/40">可兑换</p></div>
          <div><p className="text-lg font-extrabold text-violet-600 dark:text-violet-400">{stats.redeemed}</p><p className="text-[11px] text-ink/40">已兑换</p></div>
          <div><p className="text-lg font-extrabold text-ink/45">{stats.disabled}</p><p className="text-[11px] text-ink/40">已禁用</p></div>
        </div>
      </div>

      {error && <p className="mb-3 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead><tr><th className="th">卡码</th><th className="th">批次</th><th className="th">面额</th><th className="th">状态</th><th className="th">兑换</th><th className="th">过期</th><th className="th"></th></tr></thead>
          <tbody>
            {loading && <tr><td className="td py-12 text-center text-ink/40" colSpan={7}><Loader2 size={18} className="mx-auto animate-spin" /></td></tr>}
            {!loading && (data?.items ?? []).map((c) => (
              <tr key={c.id} className="hover:bg-ink/[0.03]">
                <td className="td font-mono text-xs">{c.code}</td>
                <td className="td"><p className="font-medium">{c.name}</p><p className="text-[11px] text-ink/40">{c.batchNo}</p></td>
                <td className="td font-bold">{money(c.amount)}</td>
                <td className="td"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS[c.status] ?? "bg-ink/[0.06] text-ink/45"}`}>{c.status}</span></td>
                <td className="td text-xs text-ink/50">{c.redeemedBy ? `会员 #${c.redeemedBy}` : "未兑换"}</td>
                <td className="td text-xs text-ink/45">{c.expireAt ? new Date(c.expireAt).toLocaleString() : "永不过期"}</td>
                <td className="td text-right">
                  {c.status !== "REDEEMED" && (
                    <div className="flex justify-end gap-2">
                      <button className="btn-ghost !px-3 !py-2 text-xs" onClick={() => setPending({ kind: "toggle", card: c })}>
                        <Gift size={13} /> {c.status === "ACTIVE" ? "禁用" : "启用"}
                      </button>
                      <button className="btn-ghost !px-3 !py-2 text-xs !text-red-500" onClick={() => setPending({ kind: "delete", card: c })}>
                        <Trash2 size={13} /> 删除
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!loading && data?.items.length === 0 && <tr><td className="td py-14 text-center text-ink/40" colSpan={7}>暂无礼品卡</td></tr>}
          </tbody>
        </table>
      </div>

      {pending && (
        <SensitiveConfirm
          action={{
            title: pending.kind === "generate" ? "生成礼品卡" : pending.kind === "toggle" ? "变更礼品卡状态" : "删除礼品卡",
            danger: pending.kind === "delete",
            confirmText: pending.kind === "generate" ? "确认生成" : pending.kind === "toggle" ? "确认变更" : "确认删除",
            summary: pending.kind === "generate"
              ? <span>将生成 {quantity} 张,单张面额 {money(amount)}。</span>
              : <span>{pending.card.code} · {money(pending.card.amount)}</span>,
          }}
          onClose={() => setPending(null)}
          onConfirm={exec}
        >
          <div className="mb-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-600 dark:text-amber-400">
            礼品卡等同可兑余额,操作后将写入审计日志。
          </div>
        </SensitiveConfirm>
      )}
    </div>
  );
}
