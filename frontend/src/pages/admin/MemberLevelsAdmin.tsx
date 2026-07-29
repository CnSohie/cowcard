import { useEffect, useState } from "react";
import { BadgePercent, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { del, get, post } from "../../lib/api";
import { money } from "../../lib/currency";

interface Level {
  id: number | null; name: string; slug: string; icon: string | null; discountRate: string;
  rechargeThreshold: string; spendThreshold: string; sortWeight: number; defaultLevel: boolean; enabled: boolean;
}
interface Product { id: number; name: string; price: string; }
interface LevelPrice { id: number; levelId: number; productId: number; price: string; }

const EMPTY: Level = {
  id: null, name: "", slug: "", icon: "", discountRate: "100.00",
  rechargeThreshold: "0.00", spendThreshold: "0.00", sortWeight: 0, defaultLevel: false, enabled: true,
};

export default function MemberLevelsAdmin() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Level>({ ...EMPTY });
  const [selected, setSelected] = useState<number | null>(null);
  const [prices, setPrices] = useState<LevelPrice[]>([]);
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    get<Level[]>("/admin/member-levels").then((r) => {
      setLevels(r);
      if (!selected && r[0]?.id) setSelected(r[0].id);
    });
    get<Product[]>("/admin/catalog/products").then(setProducts).catch(() => void 0);
  }
  useEffect(load, []);
  useEffect(() => {
    if (selected) get<LevelPrice[]>(`/admin/member-levels/${selected}/prices`).then(setPrices).catch(() => void 0);
  }, [selected]);

  async function saveLevel() {
    setBusy(true);
    try {
      const saved = await post<Level>("/admin/member-levels", editing);
      setEditing({ ...EMPTY });
      setSelected(saved.id);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function savePrice() {
    if (!selected || !productId || !price) return;
    await post(`/admin/member-levels/${selected}/prices`, { productId: Number(productId), price });
    setProductId(""); setPrice("");
    get<LevelPrice[]>(`/admin/member-levels/${selected}/prices`).then(setPrices);
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-tight">会员等级</h1>
        <button className="btn-ghost" onClick={() => post("/admin/member-levels/backfill-default").then(load)}>回填默认等级</button>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr><th className="th">等级</th><th className="th">折扣</th><th className="th">门槛</th><th className="th">状态</th><th className="th"></th></tr></thead>
            <tbody>
              {levels.map((l) => (
                <tr key={l.id ?? l.slug} className="cursor-pointer hover:bg-ink/[0.03]" onClick={() => { setEditing(l); setSelected(l.id); }}>
                  <td className="td"><p className="font-bold">{l.name}</p><p className="font-mono text-[11px] text-ink/40">{l.slug}</p></td>
                  <td className="td font-bold">{l.discountRate}%</td>
                  <td className="td text-xs text-ink/50">充值 {money(l.rechargeThreshold)} · 消费 {money(l.spendThreshold)}</td>
                  <td className="td"><span className="chip !py-1">{l.defaultLevel ? "默认" : l.enabled ? "启用" : "停用"}</span></td>
                  <td className="td text-right">
                    {!l.defaultLevel && <button className="btn-ghost !px-3 !py-2" onClick={(e) => { e.stopPropagation(); if (l.id) del(`/admin/member-levels/${l.id}`).then(load); }}><Trash2 size={13} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-5">
          <div className="card p-5">
            <p className="section-label"><BadgePercent size={13} /> 等级配置</p>
            <div className="grid grid-cols-2 gap-3">
              <input className="input" placeholder="名称" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              <input className="input" placeholder="slug" value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
              <input className="input" placeholder="折扣率 90=九折" value={editing.discountRate} onChange={(e) => setEditing({ ...editing, discountRate: e.target.value })} />
              <input className="input" type="number" placeholder="排序权重" value={editing.sortWeight} onChange={(e) => setEditing({ ...editing, sortWeight: Number(e.target.value) })} />
              <input className="input" placeholder="充值门槛" value={editing.rechargeThreshold} onChange={(e) => setEditing({ ...editing, rechargeThreshold: e.target.value })} />
              <input className="input" placeholder="消费门槛" value={editing.spendThreshold} onChange={(e) => setEditing({ ...editing, spendThreshold: e.target.value })} />
            </div>
            <div className="mt-3 flex gap-3 text-xs text-ink/55">
              <label><input type="checkbox" checked={editing.defaultLevel} onChange={(e) => setEditing({ ...editing, defaultLevel: e.target.checked })} /> 默认等级</label>
              <label><input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} /> 启用</label>
            </div>
            <button className="btn-primary mt-4 w-full" disabled={busy} onClick={saveLevel}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存等级</button>
            <button className="btn-ghost mt-2 w-full" onClick={() => setEditing({ ...EMPTY })}><Plus size={14} /> 新建等级</button>
          </div>
          <div className="card p-5">
            <p className="section-label">商品级会员价</p>
            <div className="mb-3 grid grid-cols-[1fr_110px] gap-2">
              <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">选择商品</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input className="input" placeholder="会员价" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <button className="btn-primary mb-4 w-full" disabled={!selected} onClick={savePrice}>保存会员价</button>
            <div className="space-y-2">
              {prices.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-2xl bg-ink/[0.04] px-3 py-2 text-xs">
                  <span>{products.find((x) => x.id === p.productId)?.name ?? `商品 #${p.productId}`}</span>
                  <span className="font-bold">{money(p.price)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
