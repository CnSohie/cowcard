import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { get } from "../lib/api";

type Tier = { minQuantity: number; unitPrice: string; levelId: number | null };
export default function WholesaleEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [levels, setLevels] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    get<{ id: number; name: string }[]>("/admin/catalog/price-levels").then(setLevels)
      .catch(() => setError("等级列表加载失败，请刷新后设置专属等级。"));
  }, []);
  let tiers: Tier[] = [];
  try { tiers = JSON.parse(value || "[]"); } catch { /* Existing products have no rules. */ }
  const update = (index: number, patch: Partial<Tier>) => onChange(JSON.stringify(tiers.map((tier, i) => i === index ? { ...tier, ...patch } : tier)));
  return <section className="mt-5 min-w-0 rounded-2xl border border-ink/10 p-4">
    <h3 className="font-bold">数量批发价</h3>
    <p className="mt-2 text-xs leading-relaxed text-ink/55">不添加档位即关闭。达到数量后整单使用对应单价，与会员价取低价，不重复打折；优惠券在此基础上计算。指定等级只对该等级生效。</p>
    <div className="mt-3 space-y-3">
      {tiers.map((tier, i) => <div key={i} className="rounded-xl bg-ink/[0.03] p-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-ink/60">起购件数<input className="input mt-1" type="number" min={1} max={1000} step={1} value={tier.minQuantity}
            onChange={e => update(i, { minQuantity: Number(e.target.value) })} /></label>
          <label className="text-xs text-ink/60">每件单价<input className="input mt-1" type="number" min="0.01" step="0.01" value={tier.unitPrice}
            onChange={e => update(i, { unitPrice: e.target.value })} /></label>
        </div>
        <div className="mt-2 flex items-end gap-2">
          <label className="min-w-0 flex-1 text-xs text-ink/60">适用买家<select className="input mt-1" value={tier.levelId ?? ""}
            onChange={e => update(i, { levelId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">所有用户（含游客）</option>
            {levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}
            {tier.levelId != null && !levels.some(level => level.id === tier.levelId) && <option value={tier.levelId}>等级 #{tier.levelId}</option>}
          </select></label>
          <button type="button" className="btn-ghost !px-3" aria-label="删除批发档位" onClick={() => onChange(JSON.stringify(tiers.filter((_, n) => n !== i)))}><Trash2 size={16} /></button>
        </div>
      </div>)}
    </div>
    {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    <button type="button" className="btn-ghost mt-3 w-full" disabled={tiers.length >= 50}
      onClick={() => onChange(JSON.stringify([...tiers, { minQuantity: 10, unitPrice: "", levelId: null }]))}><Plus size={15} />添加批发档位</button>
  </section>;
}
