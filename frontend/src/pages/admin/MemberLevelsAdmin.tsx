import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { BadgePercent, Crown, Loader2, Plus, Save, ShieldCheck, Tag, Trash2, Users } from "lucide-react";
import SensitiveConfirm from "../../components/SensitiveConfirm";
import { get, post } from "../../lib/api";
import { money } from "../../lib/currency";

interface Level {
  id: number | null;
  name: string;
  slug: string;
  icon: string | null;
  discountRate: string;
  rechargeThreshold: string;
  spendThreshold: string;
  sortWeight: number;
  defaultLevel: boolean;
  enabled: boolean;
}
interface Product { id: number; name: string; price: string; }
interface LevelPrice { id: number; levelId: number; productId: number; price: string; }

type PendingAction =
  | { kind: "saveLevel" }
  | { kind: "deleteLevel"; level: Level }
  | { kind: "backfill" }
  | { kind: "savePrice" }
  | { kind: "deletePrice"; item: LevelPrice };

const EMPTY: Level = {
  id: null,
  name: "",
  slug: "",
  icon: "",
  discountRate: "100.00",
  rechargeThreshold: "0.00",
  spendThreshold: "0.00",
  sortWeight: 0,
  defaultLevel: false,
  enabled: true,
};

function Toggle({
  checked, label, onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${
        checked ? "border-primary/25 bg-accent-soft text-primary" : "border-ink/[0.08] bg-surface text-ink/45"
      }`}>
      <span className={`h-2.5 w-2.5 rounded-full ${checked ? "bg-primary" : "bg-ink/20"}`} />
      {label}
    </button>
  );
}

function field(label: string, node: ReactNode, hint?: string) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-ink/55">{label}</span>
      {node}
      {hint && <span className="mt-1.5 block text-[11px] leading-relaxed text-ink/35">{hint}</span>}
    </label>
  );
}

export default function MemberLevelsAdmin() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Level>({ ...EMPTY });
  const [selected, setSelected] = useState<number | null>(null);
  const [prices, setPrices] = useState<LevelPrice[]>([]);
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedLevel = useMemo(() => levels.find((x) => x.id === selected) ?? null, [levels, selected]);
  const selectedProduct = useMemo(() => products.find((x) => String(x.id) === productId) ?? null, [products, productId]);

  function load() {
    get<Level[]>("/admin/member-levels").then((r) => {
      setLevels(r);
      if (!selected && r[0]?.id) {
        setSelected(r[0].id);
        setEditing(r[0]);
      }
    });
    get<Product[]>("/admin/catalog/products").then(setProducts).catch(() => void 0);
  }

  function loadPrices(levelId = selected) {
    if (levelId) get<LevelPrice[]>(`/admin/member-levels/${levelId}/prices`).then(setPrices).catch(() => void 0);
  }

  useEffect(load, []);
  useEffect(() => loadPrices(selected), [selected]);

  function requestSaveLevel() {
    setError("");
    if (!editing.name.trim() || !editing.slug.trim()) {
      setError("请先填写等级名称和唯一标识。");
      return;
    }
    setPending({ kind: "saveLevel" });
  }

  function requestSavePrice() {
    setError("");
    if (!selected || !productId || !price) {
      setError("请先选择等级、商品并填写会员价。");
      return;
    }
    setPending({ kind: "savePrice" });
  }

  async function execSensitive(auth: { password: string; totpCode: string }) {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "saveLevel") {
        const saved = await post<Level>("/admin/member-levels", { ...editing, ...auth });
        setSelected(saved.id);
        setEditing(saved);
        load();
      }
      if (pending.kind === "deleteLevel" && pending.level.id) {
        await post(`/admin/member-levels/${pending.level.id}/delete`, auth);
        setEditing({ ...EMPTY });
        setSelected(null);
        load();
      }
      if (pending.kind === "backfill") {
        await post("/admin/member-levels/backfill-default", auth);
        load();
      }
      if (pending.kind === "savePrice" && selected) {
        await post(`/admin/member-levels/${selected}/prices`, { productId: Number(productId), price, ...auth });
        setProductId("");
        setPrice("");
        loadPrices(selected);
      }
      if (pending.kind === "deletePrice" && selected) {
        await post(`/admin/member-levels/${selected}/prices/${pending.item.productId}/delete`, auth);
        loadPrices(selected);
      }
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  function actionMeta(action: PendingAction) {
    if (action.kind === "saveLevel") {
      return {
        title: editing.id ? "保存会员等级" : "新建会员等级",
        confirmText: "确认保存",
        summary: <span>{editing.name || "未命名等级"} · 折扣率 {editing.discountRate}% · 权重 {editing.sortWeight}</span>,
      };
    }
    if (action.kind === "deleteLevel") {
      return {
        title: "删除会员等级",
        confirmText: "确认删除",
        danger: true,
        summary: <span>{action.level.name} · {action.level.slug}</span>,
      };
    }
    if (action.kind === "backfill") {
      return {
        title: "回填默认等级",
        confirmText: "确认回填",
        summary: <span>为尚未分配等级的会员补齐当前默认等级。</span>,
      };
    }
    if (action.kind === "savePrice") {
      return {
        title: "保存会员专享价",
        confirmText: "确认保存价格",
        summary: <span>{selectedLevel?.name ?? "当前等级"} · {selectedProduct?.name ?? "商品"} · {money(price)}</span>,
      };
    }
    return {
      title: "删除会员专享价",
      confirmText: "确认删除价格",
      danger: true,
      summary: <span>{products.find((x) => x.id === action.item.productId)?.name ?? `商品 #${action.item.productId}`} · {money(action.item.price)}</span>,
    };
  }

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">会员等级</h1>
          <p className="mt-1 text-sm text-ink/45">管理会员折扣、升级门槛和商品级专享价。影响价格的写操作需要 2FA。</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setPending({ kind: "backfill" })}>
            <Users size={15} /> 回填默认等级
          </button>
          <button className="btn-primary" onClick={() => { setEditing({ ...EMPTY }); setSelected(null); }}>
            <Plus size={15} /> 新建等级
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {levels.map((level) => (
              <button key={level.id ?? level.slug} type="button"
                onClick={() => { setEditing(level); setSelected(level.id); setError(""); }}
                className={`rounded-[2rem] border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-soft ${
                  selected === level.id ? "border-primary/30 bg-accent-soft" : "border-ink/[0.07] bg-surface"
                }`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-lg font-black text-primary-contrast">
                    {(level.icon || level.name || "V").slice(0, 1).toUpperCase()}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    level.defaultLevel ? "bg-primary text-primary-contrast" : level.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-ink/[0.06] text-ink/40"
                  }`}>
                    {level.defaultLevel ? "默认" : level.enabled ? "启用" : "停用"}
                  </span>
                </div>
                <div className="mt-4">
                  <p className="text-lg font-extrabold">{level.name}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink/35">{level.slug}</p>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-2xl bg-surface/70 px-3 py-2">
                    <p className="text-ink/35">折扣</p>
                    <p className="mt-1 font-black">{level.discountRate}%</p>
                  </div>
                  <div className="rounded-2xl bg-surface/70 px-3 py-2">
                    <p className="text-ink/35">充值</p>
                    <p className="mt-1 font-black">{money(level.rechargeThreshold)}</p>
                  </div>
                  <div className="rounded-2xl bg-surface/70 px-3 py-2">
                    <p className="text-ink/35">消费</p>
                    <p className="mt-1 font-black">{money(level.spendThreshold)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-ink/[0.06] px-5 py-4">
              <p className="section-label"><Tag size={13} /> 商品级会员价</p>
              <p className="mt-1 text-xs text-ink/40">商品级价格优先于等级折扣，仅当会员价低于原价时生效。</p>
            </div>
            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-ink/55">选择商品</span>
                  {selectedProduct && <span className="text-[11px] text-ink/35">原价 {money(selectedProduct.price)}</span>}
                </div>
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {products.map((p) => (
                    <button key={p.id} type="button"
                      onClick={() => setProductId(String(p.id))}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                        productId === String(p.id) ? "border-primary/35 bg-accent-soft" : "border-ink/[0.07] bg-surface hover:bg-ink/[0.03]"
                      }`}>
                      <span className="min-w-0 truncate font-bold">{p.name}</span>
                      <span className="shrink-0 text-xs font-semibold text-ink/45">{money(p.price)}</span>
                    </button>
                  ))}
                  {products.length === 0 && <div className="rounded-2xl bg-ink/[0.03] px-4 py-8 text-center text-sm text-ink/35">暂无商品</div>}
                </div>
              </div>
              <div className="space-y-3 rounded-3xl bg-ink/[0.03] p-4">
                {field("会员价", <input className="input" inputMode="decimal" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />, "保存后会立即影响前台下单价格。")}
                <button className="btn-primary w-full" disabled={!selected || busy} onClick={requestSavePrice}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存会员价
                </button>
              </div>
            </div>
            <div className="border-t border-ink/[0.06] p-5">
              <div className="grid gap-2 md:grid-cols-2">
                {prices.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl bg-ink/[0.04] px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{products.find((x) => x.id === p.productId)?.name ?? `商品 #${p.productId}`}</p>
                      <p className="mt-0.5 text-[11px] text-ink/35">专享价 {money(p.price)}</p>
                    </div>
                    <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-red-500 hover:bg-red-500/10"
                      onClick={() => setPending({ kind: "deletePrice", item: p })}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                {prices.length === 0 && <div className="rounded-2xl bg-ink/[0.03] px-4 py-8 text-center text-sm text-ink/35 md:col-span-2">当前等级暂无商品级会员价</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-5 flex items-center justify-between">
            <p className="section-label"><BadgePercent size={13} /> 等级配置</p>
            <span className="rounded-full bg-ink/[0.04] px-3 py-1 text-[11px] font-semibold text-ink/40">
              {editing.id ? `ID #${editing.id}` : "新等级"}
            </span>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-[72px_1fr] gap-3">
              {field("图标", <input className="input text-center font-black" maxLength={8} placeholder="G" value={editing.icon ?? ""} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} />)}
              {field("等级名称", <input className="input" placeholder="黄金会员" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />)}
            </div>
            {field("唯一标识", <input className="input font-mono text-sm" placeholder="gold" value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />, "建议使用英文小写。创建后继续修改会影响后台识别。")}
            <div className="grid grid-cols-2 gap-3">
              {field("折扣率", <input className="input" inputMode="decimal" placeholder="90.00" value={editing.discountRate} onChange={(e) => setEditing({ ...editing, discountRate: e.target.value })} />, "100 为无折扣,90 为九折。")}
              {field("排序权重", <input className="input" type="number" value={editing.sortWeight} onChange={(e) => setEditing({ ...editing, sortWeight: Number(e.target.value) })} />, "数值越大等级越高。")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field("充值门槛", <input className="input" inputMode="decimal" value={editing.rechargeThreshold} onChange={(e) => setEditing({ ...editing, rechargeThreshold: e.target.value })} />)}
              {field("消费门槛", <input className="input" inputMode="decimal" value={editing.spendThreshold} onChange={(e) => setEditing({ ...editing, spendThreshold: e.target.value })} />)}
            </div>
            <div className="flex flex-wrap gap-2">
              <Toggle checked={editing.defaultLevel} label="默认等级" onChange={(defaultLevel) => setEditing({ ...editing, defaultLevel })} />
              <Toggle checked={editing.enabled} label="启用等级" onChange={(enabled) => setEditing({ ...editing, enabled })} />
            </div>
            <div className="rounded-3xl border border-primary/15 bg-accent-soft px-4 py-3 text-xs leading-relaxed text-ink/55">
              <div className="mb-1 flex items-center gap-2 font-bold text-ink">
                <ShieldCheck size={14} /> 安全提示
              </div>
              保存、删除、价格调整和默认等级回填都会要求 2FA,并写入审计日志。
            </div>
            <button className="btn-primary w-full" disabled={busy} onClick={requestSaveLevel}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存等级
            </button>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-ghost w-full" onClick={() => { setEditing({ ...EMPTY }); setSelected(null); setError(""); }}>
                <Plus size={14} /> 清空新建
              </button>
              <button className="btn-ghost w-full !text-red-500" disabled={!editing.id || editing.defaultLevel}
                onClick={() => setPending({ kind: "deleteLevel", level: editing })}>
                <Trash2 size={14} /> 删除等级
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-3xl bg-surface p-5 shadow-soft">
          <Crown size={18} className="text-primary" />
          <p className="mt-3 text-sm font-extrabold">默认等级不可删除</p>
          <p className="mt-1 text-xs leading-relaxed text-ink/40">新会员和未回填会员会使用默认等级。</p>
        </div>
        <div className="rounded-3xl bg-surface p-5 shadow-soft">
          <BadgePercent size={18} className="text-primary" />
          <p className="mt-3 text-sm font-extrabold">会员价优先</p>
          <p className="mt-1 text-xs leading-relaxed text-ink/40">商品级会员价优先于全局折扣率。</p>
        </div>
        <div className="rounded-3xl bg-surface p-5 shadow-soft">
          <ShieldCheck size={18} className="text-primary" />
          <p className="mt-3 text-sm font-extrabold">变更留痕</p>
          <p className="mt-1 text-xs leading-relaxed text-ink/40">价格和权益变更需要 2FA 且会写入审计。</p>
        </div>
      </div>

      {pending && (
        <SensitiveConfirm action={actionMeta(pending)} onClose={() => setPending(null)} onConfirm={execSensitive}>
          <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.08] px-4 py-3 text-xs leading-relaxed text-ink/65">
            会员等级会直接影响用户实付价格和权益,确认前请核对折扣、门槛和商品价格。
          </div>
        </SensitiveConfirm>
      )}
    </div>
  );
}
