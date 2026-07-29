import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Loader2, Package, Pencil, Plus, TicketCheck, Wrench } from "lucide-react";
import { ApiError, get, post } from "../../lib/api";
import ImageUpload from "../../components/ImageUpload";
import { currencySymbol, money } from "../../lib/currency";

/** 商品管理:列表 + 全页编辑器(与文章编辑器同一设计语言:大标题直接写、右侧设置栏)。 */

interface AdminCategory { id: number; name: string; sortOrder: number; visible: boolean; }
interface AdminProduct {
  id: number | null; categoryId: number | ""; name: string; brief: string; description: string;
  usageNote: string; coverImage: string; price: string; stockCached?: number;
  minBuy: number; maxBuy: number; visible: boolean; sortOrder: number;
  deliveryMode: "AUTO_CARD" | "MANUAL" | "PRESALE_VOUCHER"; manualPrompt: string;
  presaleStartAt: string; presaleEndAt: string; presaleSettlementMode: "SINK" | "REFUND" | "BALANCE";
}

const EMPTY: AdminProduct = {
  id: null, categoryId: "", name: "", brief: "", description: "", usageNote: "",
  coverImage: "", price: "", minBuy: 1, maxBuy: 10, visible: true, sortOrder: 0,
  deliveryMode: "AUTO_CARD", manualPrompt: "", presaleStartAt: "", presaleEndAt: "", presaleSettlementMode: "BALANCE",
};

function norm(p: AdminProduct): AdminProduct {
  return {
    ...EMPTY, ...p,
    brief: p.brief ?? "", description: p.description ?? "", usageNote: p.usageNote ?? "",
    coverImage: p.coverImage ?? "", price: String(p.price ?? ""), manualPrompt: p.manualPrompt ?? "",
    deliveryMode: p.deliveryMode ?? "AUTO_CARD",
    presaleStartAt: p.presaleStartAt ? String(p.presaleStartAt).slice(0, 16) : "",
    presaleEndAt: p.presaleEndAt ? String(p.presaleEndAt).slice(0, 16) : "",
    presaleSettlementMode: p.presaleSettlementMode ?? "BALANCE",
    categoryId: p.categoryId ?? "",
  };
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-ink/15"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export default function ProductsAdmin() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    get<AdminCategory[]>("/admin/catalog/categories").then(setCategories).catch(() => void 0);
    get<AdminProduct[]>("/admin/catalog/products").then(setProducts).catch(() => void 0);
  }
  useEffect(load, []);

  async function saveCategory() {
    if (!newCategory.trim()) return;
    await post("/admin/catalog/categories", { name: newCategory.trim(), sortOrder: 0, visible: true });
    setNewCategory("");
    load();
  }

  async function saveProduct(stay = false) {
    if (!editing) return;
    setError("");
    if (editing.categoryId === "") {
      setError("请选择商品分类");
      return;
    }
    if (editing.minBuy > editing.maxBuy) {
      setError("单次最少购买数量不能大于单次最多");
      return;
    }
    if (editing.deliveryMode === "PRESALE_VOUCHER") {
      if (!editing.presaleEndAt) {
        setError("预售商品必须填写最晚提货截止时间");
        return;
      }
      if (editing.presaleStartAt && new Date(editing.presaleEndAt).getTime() <= new Date(editing.presaleStartAt).getTime()) {
        setError("最晚提货截止时间必须晚于开放提货时间");
        return;
      }
    }
    setSaving(true);
    try {
      const saved = await post<AdminProduct>("/admin/catalog/products", {
        ...editing,
        categoryId: editing.categoryId,
        price: editing.price,
        presaleStartAt: editing.presaleStartAt || null,
        presaleEndAt: editing.presaleEndAt || null,
      });
      load();
      if (stay && saved) setEditing(norm(saved));
      else setEditing(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const catName = (id: number | "") => categories.find((c) => c.id === id)?.name;

  /* ─────────── 全页编辑器 ─────────── */
  if (editing) {
    const canSave = editing.name.trim() !== "" && editing.price.trim() !== "" && editing.categoryId !== ""
      && editing.minBuy <= editing.maxBuy
      && (editing.deliveryMode !== "PRESALE_VOUCHER" || !!editing.presaleEndAt);
    return (
      <div className="animate-fade-up">
        {/* 顶栏 */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button className="btn-ghost !px-3.5" onClick={() => setEditing(null)}>
            <ArrowLeft size={14} /> 返回列表
          </button>
          <div className="flex items-center gap-2.5">
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              editing.visible ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-ink/[0.06] text-ink/45"}`}>
              {editing.visible ? "上架中" : "已下架"}
            </span>
            <button className="btn-primary" disabled={saving || !canSave} onClick={() => saveProduct()}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {editing.id ? "保存修改" : "创建商品"}
            </button>
          </div>
        </div>
        {error && <p className="mb-3 rounded-xl bg-red-500/10 px-4 py-2.5 text-xs text-red-500">{error}</p>}
        {!canSave && <p className="mb-3 text-[11px] text-ink/35">填写商品名称、分类、售价和有效售卖设置后即可保存</p>}

        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          {/* 左:名称 + 图文 */}
          <div className="space-y-5">
            <div className="card !p-0">
              <input
                className="w-full bg-transparent px-6 py-5 text-xl font-extrabold tracking-tight outline-none placeholder:text-ink/25"
                placeholder="商品名称,例:Netflix 高级会员 · 一年"
                autoFocus={!editing.id}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
              <div className="border-t border-ink/[0.06]">
                <input
                  className="w-full bg-transparent px-6 py-3.5 text-sm outline-none placeholder:text-ink/25"
                  placeholder="一句话简介(列表页展示):秒发 · 质保 30 天"
                  value={editing.brief}
                  onChange={(e) => setEditing({ ...editing, brief: e.target.value })}
                />
              </div>
            </div>

            <div className="card !p-0">
              <p className="section-label !mb-0 px-6 pt-5"><span className="h-1 w-4 rounded-full bg-accent" /> 商品详情 · 详情页展示</p>
              <textarea
                className="w-full resize-none bg-transparent px-6 pb-5 pt-3 text-sm leading-relaxed outline-none placeholder:text-ink/25"
                rows={9}
                placeholder={"套餐说明、有效期、适用范围…\n支持换行分段。"}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
              <div className="border-t border-ink/[0.06]">
                <p className="section-label !mb-0 px-6 pt-5"><span className="h-1 w-4 rounded-full bg-accent" /> 使用说明 · 发货后随卡密一并展示</p>
                <textarea
                  className="w-full resize-none bg-transparent px-6 pb-5 pt-3 text-sm leading-relaxed outline-none placeholder:text-ink/25"
                  rows={5}
                  placeholder={"兑换入口、使用步骤、注意事项…"}
                  value={editing.usageNote}
                  onChange={(e) => setEditing({ ...editing, usageNote: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* 右:定价 / 封面 / 售卖设置 */}
          <div className="space-y-5">
            <div className="card p-5">
              <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 定价</p>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-ink/35">{currencySymbol()}</span>
                <input className="input !pl-10 !text-xl !font-extrabold" placeholder="9.90" inputMode="decimal"
                  value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
              </div>
              {editing.id != null && (
                <p className="mt-2 text-[11px] text-ink/40">
                  {editing.deliveryMode === "AUTO_CARD"
                    ? `当前库存 ${editing.stockCached ?? 0} 张(在「卡密管理」补充)`
                    : editing.deliveryMode === "PRESALE_VOUCHER"
                      ? "预售商品不预占库存,付款后签发电子提货码。"
                      : "人工发货商品不占用卡密库存,付款后进入待处理订单。"}
                </p>
              )}
            </div>

            <div className="card p-5">
              <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 商品封面</p>
              <ImageUpload value={editing.coverImage} onChange={(url) => setEditing({ ...editing, coverImage: url })} />
            </div>

            <div className="card p-5">
              <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 售卖设置</p>
              <label className="label">所属分类</label>
              <select className="input mb-4" value={editing.categoryId}
                onChange={(e) => setEditing({ ...editing, categoryId: e.target.value ? Number(e.target.value) : "" })}>
                <option value="" disabled>请选择分类</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label className="label">交付模式</label>
              <div className="mb-4 grid gap-2 sm:grid-cols-3">
                <button type="button"
                  onClick={() => setEditing({ ...editing, deliveryMode: "AUTO_CARD" })}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${
                    editing.deliveryMode === "AUTO_CARD"
                      ? "border-primary bg-accent-soft text-ink"
                      : "border-ink/[0.08] bg-surface text-ink/55 hover:border-ink/20"
                  }`}>
                  <span className="flex items-center gap-1.5 text-sm font-bold"><KeyRound size={14} /> 自动卡密</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-ink/40">支付后自动分配卡密</span>
                </button>
                <button type="button"
                  onClick={() => setEditing({ ...editing, deliveryMode: "MANUAL" })}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${
                    editing.deliveryMode === "MANUAL"
                      ? "border-primary bg-accent-soft text-ink"
                      : "border-ink/[0.08] bg-surface text-ink/55 hover:border-ink/20"
                  }`}>
                  <span className="flex items-center gap-1.5 text-sm font-bold"><Wrench size={14} /> 人工发货</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-ink/40">付款后由后台处理</span>
                </button>
                <button type="button"
                  onClick={() => setEditing({ ...editing, deliveryMode: "PRESALE_VOUCHER" })}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${
                    editing.deliveryMode === "PRESALE_VOUCHER"
                      ? "border-primary bg-accent-soft text-ink"
                      : "border-ink/[0.08] bg-surface text-ink/55 hover:border-ink/20"
                  }`}>
                  <span className="flex items-center gap-1.5 text-sm font-bold"><TicketCheck size={14} /> 预售提货码</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-ink/40">付款后签发可流转凭证</span>
                </button>
              </div>
              {editing.deliveryMode === "MANUAL" && (
                <div className="mb-4 rounded-2xl border border-ink/[0.07] bg-ink/[0.02] p-4">
                  <label className="label">买家信息提示</label>
                  <textarea
                    className="input min-h-[96px] resize-none text-sm leading-relaxed"
                    placeholder="例:请填写账号邮箱、区服、角色 ID 或需要开通的服务说明。"
                    value={editing.manualPrompt}
                    onChange={(e) => setEditing({ ...editing, manualPrompt: e.target.value })}
                  />
                </div>
              )}
              {editing.deliveryMode === "PRESALE_VOUCHER" && (
                <div className="mb-4 rounded-2xl border border-primary/15 bg-accent-soft/55 p-4">
                  <p className="mb-3 text-xs leading-relaxed text-ink/55">
                    买家付款后获得电子预售提货码;平台只保存哈希。持有人在兑换中心核销后凭证销毁,有货即吐卡,无货进入履约队列。
                  </p>
                  <div className="grid gap-3">
                    <div>
                      <label className="label">开放提货时间</label>
                      <input
                        className="input !py-2.5"
                        type="datetime-local"
                        value={editing.presaleStartAt}
                        onChange={(e) => setEditing({ ...editing, presaleStartAt: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label">最晚提货截止时间</label>
                      <input
                        className="input !py-2.5"
                        type="datetime-local"
                        value={editing.presaleEndAt}
                        onChange={(e) => setEditing({ ...editing, presaleEndAt: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label">逾期清算规则</label>
                      <select
                        className="input !py-2.5"
                        value={editing.presaleSettlementMode}
                        onChange={(e) => setEditing({ ...editing, presaleSettlementMode: e.target.value as AdminProduct["presaleSettlementMode"] })}
                      >
                        <option value="BALANCE">转为站内余额</option>
                        <option value="REFUND">原路退款预留</option>
                        <option value="SINK">沉淀清算</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">单次最少</label>
                  <input className="input !py-2.5" type="number" min={1} value={editing.minBuy}
                    onChange={(e) => setEditing({ ...editing, minBuy: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">单次最多</label>
                  <input className="input !py-2.5" type="number" min={1} value={editing.maxBuy}
                    onChange={(e) => setEditing({ ...editing, maxBuy: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">排序</label>
                  <input className="input !py-2.5" type="number" value={editing.sortOrder}
                    onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-2xl border border-ink/[0.07] bg-ink/[0.02] px-4 py-3">
                <div>
                  <p className="text-sm font-medium">上架展示</p>
                  <p className="text-[11px] text-ink/40">关闭后买家不可见,已付订单不受影响</p>
                </div>
                <Switch on={editing.visible} onChange={(v) => setEditing({ ...editing, visible: v })} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─────────── 列表视图 ─────────── */
  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-tight">商品管理</h1>
        <button className="btn-primary" onClick={() => { setError(""); setEditing({ ...EMPTY }); }}>
          <Plus size={15} /> 新建商品
        </button>
      </div>

      <div className="card mb-5 flex flex-wrap items-center gap-2 p-4">
        <span className="text-sm text-ink/50">分类:</span>
        {categories.map((c) => <span key={c.id} className="chip">{c.name}</span>)}
        <input className="input !w-40 !py-1.5 text-xs" placeholder="新分类名" value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveCategory()} />
        <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={saveCategory}>添加</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead><tr>
            <th className="th">商品</th><th className="th">分类</th><th className="th">价格</th>
            <th className="th">交付</th><th className="th">库存</th><th className="th">限购</th><th className="th">状态</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={String(p.id)} className="cursor-pointer transition hover:bg-ink/[0.03]"
                onClick={() => { setError(""); setEditing(norm(p)); }}>
                <td className="td">
                  <div className="flex items-center gap-3">
                    {p.coverImage
                      ? <img src={p.coverImage} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
                      : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft"><Package size={15} className="text-primary" /></span>}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{p.name}</p>
                      {p.brief && <p className="max-w-[220px] truncate text-xs text-ink/40">{p.brief}</p>}
                    </div>
                  </div>
                </td>
                <td className="td text-xs">{catName(p.categoryId) ?? <span className="text-ink/30">未分类</span>}</td>
                <td className="td font-semibold text-ink">{money(p.price)}</td>
                <td className="td text-xs">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${
                    p.deliveryMode === "MANUAL"
                      ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                      : p.deliveryMode === "PRESALE_VOUCHER"
                        ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                      : "bg-accent-soft text-primary"
                  }`}>
                    {p.deliveryMode === "PRESALE_VOUCHER"
                      ? <TicketCheck size={11} />
                      : p.deliveryMode === "MANUAL" ? <Wrench size={11} /> : <KeyRound size={11} />}
                    {p.deliveryMode === "PRESALE_VOUCHER" ? "预售" : p.deliveryMode === "MANUAL" ? "人工发货" : "自动卡密"}
                  </span>
                </td>
                <td className="td">
                  <span className={(p.stockCached ?? 0) <= 5 ? "font-medium text-amber-600 dark:text-amber-400" : ""}>{p.stockCached}</span>
                </td>
                <td className="td text-xs">{p.minBuy}~{p.maxBuy}</td>
                <td className="td">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    p.visible ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-ink/[0.06] text-ink/45"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${p.visible ? "bg-emerald-500" : "bg-ink/30"}`} />
                    {p.visible ? "上架中" : "已下架"}
                  </span>
                </td>
                <td className="td text-right">
                  <span className="inline-grid h-8 w-8 place-items-center rounded-full text-ink/40"><Pencil size={13} /></span>
                </td>
              </tr>
            ))}
            {products.length === 0 && <tr><td className="td py-14 text-center text-ink/45" colSpan={8}>暂无商品,点击右上角「新建商品」开始</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
