import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, CalendarClock, CircleDollarSign, KeyRound, ListOrdered, Loader2, Package, Pencil, Plus, ShieldCheck, TicketCheck, Trash2, Wrench, X } from "lucide-react";
import { ApiError, del, get, post, put } from "../../lib/api";
import ImageUpload from "../../components/ImageUpload";
import ProductImage from "../../components/ProductImage";
import { matchProductBrand } from "../../lib/productBrand";
import { currencySymbol, money } from "../../lib/currency";

/** 商品管理:列表 + 全页编辑器(与文章编辑器同一设计语言:大标题直接写、右侧设置栏)。 */

interface AdminCategory { id: number; name: string; sortOrder: number; visible: boolean; }
interface AdminProduct {
  id: number | null; categoryId: number | ""; name: string; brief: string; description: string;
  usageNote: string; coverImage: string; price: string; stockCached?: number;
  minOrderAmount: string; minBuy: number; maxBuy: number; visible: boolean; sortOrder: number;
  deliveryMode: "AUTO_CARD" | "MANUAL" | "PRESALE_VOUCHER"; manualPrompt: string; manualFormSchema: string;
  presaleSaleEndAt: string; presaleStartAt: string; presaleEndAt: string;
  presaleSettlementMode: "SINK" | "REFUND" | "BALANCE";
}

interface ManualField {
  key: string; label: string; type: "TEXT" | "EMAIL" | "NUMBER" | "SELECT" | "TEXTAREA";
  required: boolean; placeholder: string; options?: string[];
}

const DEFAULT_MANUAL_FIELDS: ManualField[] = [
  { key: "account", label: "接收账号 / 业务账号", type: "TEXT", required: true, placeholder: "填写需要开通服务的账号" },
];

const EMPTY: AdminProduct = {
  id: null, categoryId: "", name: "", brief: "", description: "", usageNote: "",
  coverImage: "", price: "", minOrderAmount: "0.00", minBuy: 1, maxBuy: 10, visible: true, sortOrder: 0,
  deliveryMode: "AUTO_CARD", manualPrompt: "", manualFormSchema: JSON.stringify(DEFAULT_MANUAL_FIELDS), presaleSaleEndAt: "", presaleStartAt: "", presaleEndAt: "", presaleSettlementMode: "BALANCE",
};

function norm(p: AdminProduct): AdminProduct {
  return {
    ...EMPTY, ...p,
    brief: p.brief ?? "", description: p.description ?? "", usageNote: p.usageNote ?? "",
    coverImage: p.coverImage ?? "", price: String(p.price ?? ""), minOrderAmount: String(p.minOrderAmount ?? "0.00"), manualPrompt: p.manualPrompt ?? "",
    manualFormSchema: p.manualFormSchema || JSON.stringify(DEFAULT_MANUAL_FIELDS),
    deliveryMode: p.deliveryMode ?? "AUTO_CARD",
    presaleSaleEndAt: p.presaleSaleEndAt ? String(p.presaleSaleEndAt).slice(0, 16) : "",
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

function planTime(value: string) {
  if (!value) return "未设置";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间无效" : date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function manualFields(schema: string): ManualField[] {
  try { const value = JSON.parse(schema); return Array.isArray(value) ? value : DEFAULT_MANUAL_FIELDS; }
  catch { return DEFAULT_MANUAL_FIELDS; }
}

export default function ProductsAdmin() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [deletingCategory, setDeletingCategory] = useState<AdminCategory | null>(null);
  const [categoryBusy, setCategoryBusy] = useState(false);

  function load() {
    get<AdminCategory[]>("/admin/catalog/categories").then(setCategories).catch(() => void 0);
    get<AdminProduct[]>("/admin/catalog/products").then(setProducts).catch(() => void 0);
  }
  useEffect(load, []);

  async function saveCategory() {
    if (!newCategory.trim()) return;
    setCategoryError("");
    setCategoryBusy(true);
    try {
      await post("/admin/catalog/categories", { name: newCategory.trim(), sortOrder: categories.length, visible: true });
      setNewCategory("");
      load();
    } catch (e) {
      setCategoryError(e instanceof ApiError ? e.message : "分类添加失败");
    } finally {
      setCategoryBusy(false);
    }
  }

  async function moveCategory(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= categories.length || categoryBusy) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next.map((c, i) => ({ ...c, sortOrder: i })));
    setCategoryError("");
    setCategoryBusy(true);
    try {
      await put("/admin/catalog/categories/reorder", { categoryIds: next.map((c) => c.id) });
    } catch (e) {
      setCategoryError(e instanceof ApiError ? e.message : "分类排序保存失败");
      load();
    } finally {
      setCategoryBusy(false);
    }
  }

  async function confirmDeleteCategory() {
    if (!deletingCategory) return;
    setCategoryError("");
    setCategoryBusy(true);
    try {
      await del(`/admin/catalog/categories/${deletingCategory.id}`);
      setDeletingCategory(null);
      load();
    } catch (e) {
      setCategoryError(e instanceof ApiError ? e.message : "分类删除失败");
      setDeletingCategory(null);
    } finally {
      setCategoryBusy(false);
    }
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
    const minOrderAmount = Number(editing.minOrderAmount || 0);
    if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0) {
      setError("最低订购金额不能小于 0");
      return;
    }
    if (minOrderAmount > Number(editing.price) * editing.maxBuy) {
      setError("最低订购金额不能超过商品标价 × 单次最多数量");
      return;
    }
    if (editing.deliveryMode === "PRESALE_VOUCHER") {
      if (!editing.presaleSaleEndAt) {
        setError("预售商品必须填写停止销售时间");
        return;
      }
      if (!editing.presaleEndAt) {
        setError("预售商品必须填写最晚交付保障时间");
        return;
      }
      if (new Date(editing.presaleEndAt).getTime() <= new Date(editing.presaleSaleEndAt).getTime()) {
        setError("最晚交付保障时间必须晚于停止销售时间");
        return;
      }
      if (editing.presaleStartAt && new Date(editing.presaleStartAt).getTime() < new Date(editing.presaleSaleEndAt).getTime()) {
        setError("预计开始交付时间不能早于停止销售时间");
        return;
      }
      if (editing.presaleStartAt && new Date(editing.presaleEndAt).getTime() <= new Date(editing.presaleStartAt).getTime()) {
        setError("最晚交付保障时间必须晚于预计开始交付时间");
        return;
      }
    }
    setSaving(true);
    try {
      const saved = await post<AdminProduct>("/admin/catalog/products", {
        ...editing,
        categoryId: editing.categoryId,
        price: editing.price,
        presaleSaleEndAt: editing.presaleSaleEndAt || null,
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
    const deliveryFields = manualFields(editing.manualFormSchema);
    const setDeliveryFields = (fields: ManualField[]) => setEditing({ ...editing, manualFormSchema: JSON.stringify(fields) });
    const saleAt = editing.presaleSaleEndAt ? new Date(editing.presaleSaleEndAt).getTime() : 0;
    const startAt = editing.presaleStartAt ? new Date(editing.presaleStartAt).getTime() : 0;
    const guaranteeAt = editing.presaleEndAt ? new Date(editing.presaleEndAt).getTime() : 0;
    const presaleTimesValid = editing.deliveryMode !== "PRESALE_VOUCHER" || (
      saleAt > 0 && guaranteeAt > saleAt && (!startAt || (startAt >= saleAt && guaranteeAt > startAt))
    );
    const amountRuleValid = Number(editing.minOrderAmount || 0) >= 0
      && Number(editing.minOrderAmount || 0) <= Number(editing.price || 0) * editing.maxBuy;
    const canSave = editing.name.trim() !== "" && editing.price.trim() !== "" && editing.categoryId !== ""
      && editing.minBuy <= editing.maxBuy && amountRuleValid
      && presaleTimesValid && (editing.deliveryMode !== "MANUAL" || deliveryFields.length > 0);
    return (
      <div className="product-editor animate-fade-up">
        {/* 顶栏 */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button className="btn-ghost !px-3.5" onClick={() => setEditing(null)}>
            <ArrowLeft size={14} /> 返回列表
          </button>
          <div className="flex items-center gap-2.5">
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              editing.visible ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-ink/[0.06] text-ink/75"}`}>
              {editing.visible ? "上架中" : "已下架"}
            </span>
            <button className="btn-primary" disabled={saving || !canSave} onClick={() => saveProduct()}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {editing.id ? "保存修改" : "创建商品"}
            </button>
          </div>
        </div>
        {error && <p className="mb-3 rounded-xl bg-red-500/10 px-4 py-2.5 text-xs text-red-500">{error}</p>}
        {!canSave && <p className="mb-3 text-[11px] text-ink/75">填写商品名称、分类、售价和有效售卖设置后即可保存</p>}

        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          {/* 左:名称 + 图文 */}
          <div className="space-y-5">
            <div className="card !p-0">
              <input
                className="product-editor-field w-full bg-transparent px-6 py-5 text-xl font-extrabold tracking-tight outline-none placeholder:text-ink/75"
                placeholder="商品名称,例:Netflix 高级会员 · 一年"
                autoFocus={!editing.id}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
              <div className="border-t border-ink/[0.06]">
                <input
                  className="product-editor-field w-full bg-transparent px-6 py-3.5 text-sm outline-none placeholder:text-ink/75"
                  placeholder="一句话简介(列表页展示):秒发 · 质保 30 天"
                  value={editing.brief}
                  onChange={(e) => setEditing({ ...editing, brief: e.target.value })}
                />
              </div>
            </div>

            <div className="card !p-0">
              <p className="section-label !mb-0 px-6 pt-5"><span className="h-1 w-4 rounded-full bg-accent" /> 商品详情 · 详情页展示</p>
              <textarea
                className="product-editor-field w-full resize-none bg-transparent px-6 pb-5 pt-3 text-sm leading-relaxed outline-none placeholder:text-ink/75"
                rows={9}
                placeholder={"套餐说明、有效期、适用范围…\n支持换行分段。"}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
              <div className="border-t border-ink/[0.06]">
                <p className="section-label !mb-0 px-6 pt-5"><span className="h-1 w-4 rounded-full bg-accent" /> 使用说明 · 发货后随卡密一并展示</p>
                <textarea
                  className="product-editor-field w-full resize-none bg-transparent px-6 pb-5 pt-3 text-sm leading-relaxed outline-none placeholder:text-ink/75"
                  rows={5}
                  placeholder={"兑换入口、使用步骤、注意事项…"}
                  value={editing.usageNote}
                  onChange={(e) => setEditing({ ...editing, usageNote: e.target.value })}
                />
              </div>
            </div>

            {editing.deliveryMode === "MANUAL" && (
              <div className="card overflow-hidden !p-0">
                <div className="border-b border-ink/[0.07] px-5 py-5 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-base font-extrabold"><Wrench size={18} className="text-primary" /> 人工交付信息表</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink/75">买家必须按字段填写，后端逐项校验后才允许创建订单。</p>
                    </div>
                    <span className="rounded-full bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400">{deliveryFields.length} 个字段</span>
                  </div>
                </div>
                <div className="space-y-5 p-5 sm:p-6">
                  <div>
                    <label className="label">交付说明</label>
                    <textarea className="input min-h-[88px] resize-none text-sm leading-relaxed"
                      placeholder="例：付款后 24 小时内处理；请确保账号可正常登录，处理期间不要修改密码。"
                      value={editing.manualPrompt} onChange={(e) => setEditing({ ...editing, manualPrompt: e.target.value })} />
                    <p className="mt-2 text-[11px] text-ink/75">这里只写处理时效和注意事项，不再让买家把所有资料挤进一段文本。</p>
                  </div>

                  <div className="space-y-3">
                    {deliveryFields.map((field, index) => (
                      <div key={field.key} className="rounded-2xl border border-ink/[0.08] p-4">
                        <div className="grid gap-3 md:grid-cols-[1.2fr_.8fr_auto]">
                          <div>
                            <label className="label">字段名称</label>
                            <input className="input !py-2.5" value={field.label} placeholder="例：游戏角色 ID"
                              onChange={(e) => setDeliveryFields(deliveryFields.map((f, i) => i === index ? { ...f, label: e.target.value } : f))} />
                          </div>
                          <div>
                            <label className="label">输入类型</label>
                            <select className="input !py-2.5" value={field.type}
                              onChange={(e) => setDeliveryFields(deliveryFields.map((f, i) => i === index ? { ...f, type: e.target.value as ManualField["type"] } : f))}>
                              <option value="TEXT">普通文本</option><option value="EMAIL">邮箱</option><option value="NUMBER">账号 / ID</option>
                              <option value="SELECT">下拉选择</option><option value="TEXTAREA">多行说明</option>
                            </select>
                          </div>
                          <div className="flex items-end gap-2 pb-1">
                            <button type="button" className={`chip !py-2.5 ${field.required ? "chip-on" : ""}`}
                              onClick={() => setDeliveryFields(deliveryFields.map((f, i) => i === index ? { ...f, required: !f.required } : f))}>
                              {field.required ? "必填" : "选填"}
                            </button>
                            <button type="button" className="icon-btn text-red-500" title="删除字段"
                              onClick={() => setDeliveryFields(deliveryFields.filter((_, i) => i !== index))}><Trash2 size={14} /></button>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="label">填写提示</label>
                            <input className="input !py-2.5" value={field.placeholder} placeholder="告诉买家应该填什么"
                              onChange={(e) => setDeliveryFields(deliveryFields.map((f, i) => i === index ? { ...f, placeholder: e.target.value } : f))} />
                          </div>
                          {field.type === "SELECT" && <div>
                            <label className="label">下拉选项（每行一个）</label>
                            <textarea className="input min-h-[68px] !py-2.5" value={(field.options ?? []).join("\n")} placeholder={"国服\n国际服"}
                              onChange={(e) => setDeliveryFields(deliveryFields.map((f, i) => i === index ? { ...f, options: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) } : f))} />
                          </div>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button type="button" className="btn-ghost" disabled={deliveryFields.length >= 12}
                    onClick={() => setDeliveryFields([...deliveryFields, { key: `field_${Date.now().toString(36)}`, label: "新字段", type: "TEXT", required: true, placeholder: "" }])}>
                    <Plus size={14} /> 添加信息字段
                  </button>
                  {deliveryFields.length === 0 && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-500">人工交付至少需要一个信息字段。</p>}
                </div>
              </div>
            )}

            {editing.deliveryMode === "PRESALE_VOUCHER" && (
              <div className="card overflow-hidden !p-0">
                <div className="border-b border-ink/[0.07] px-5 py-5 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-base font-extrabold"><TicketCheck size={18} className="text-primary" /> 预售履约计划</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink/75">这里配置的是从售卖、核销、排队到逾期赔付的完整规则。</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${presaleTimesValid ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                      {presaleTimesValid ? "时间计划有效" : "等待完善时间"}
                    </span>
                  </div>
                </div>

                <div className="grid gap-px bg-ink/[0.06] sm:grid-cols-2 xl:grid-cols-4">
                  {([
                    [TicketCheck, "01", "付款签发", "每件商品生成一枚一次性提货码"],
                    [ShieldCheck, "02", "立即核销", "买家绑定会员后进入履约队列"],
                    [ListOrdered, "03", "按序交付", "补充卡密后按核销顺序自动发放"],
                    [CircleDollarSign, "04", "到期清算", "保障时间仍未交付则执行赔付"],
                  ] as const).map(([Icon, no, title, text]) => (
                    <div key={String(no)} className="bg-surface px-5 py-4">
                      <div className="mb-2 flex items-center justify-between">
                        <Icon size={16} className="text-primary" />
                        <span className="text-[10px] font-bold tracking-widest text-ink/75">{String(no)}</span>
                      </div>
                      <p className="text-sm font-bold">{String(title)}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-ink/75">{String(text)}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-6 p-5 sm:p-6">
                  <section>
                    <div className="mb-3 flex items-center gap-2">
                      <CalendarClock size={15} className="text-primary" />
                      <p className="text-sm font-bold">时间计划</p>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-3">
                      <div className="rounded-2xl border border-ink/[0.08] p-4">
                        <label className="label">停止销售时间 <span className="text-red-500">*</span></label>
                        <input className="input !py-2.5" type="datetime-local" value={editing.presaleSaleEndAt}
                          onChange={(e) => setEditing({ ...editing, presaleSaleEndAt: e.target.value })} />
                        <p className="mt-2 text-[11px] leading-relaxed text-ink/75">到点后前台停止接受新订单，已付款订单继续履约。</p>
                      </div>
                      <div className="rounded-2xl border border-ink/[0.08] p-4">
                        <label className="label">预计开始交付 <span className="font-normal text-ink/75">选填</span></label>
                        <input className="input !py-2.5" type="datetime-local" value={editing.presaleStartAt}
                          onChange={(e) => setEditing({ ...editing, presaleStartAt: e.target.value })} />
                        <p className="mt-2 text-[11px] leading-relaxed text-ink/75">买家仍可提前核销；该时间前先排队，不承诺立即发卡。</p>
                      </div>
                      <div className="rounded-2xl border border-ink/[0.08] p-4">
                        <label className="label">最晚交付保障 <span className="text-red-500">*</span></label>
                        <input className="input !py-2.5" type="datetime-local" value={editing.presaleEndAt}
                          onChange={(e) => setEditing({ ...editing, presaleEndAt: e.target.value })} />
                        <p className="mt-2 text-[11px] leading-relaxed text-ink/75">到点仍未拿到卡密的凭证进入赔付或人工处理。</p>
                      </div>
                    </div>
                    {!presaleTimesValid && (
                      <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" /> 请按“停止销售 ≤ 预计开始交付 ＜ 最晚交付保障”设置；预计开始交付可以留空。
                      </p>
                    )}
                  </section>

                  <section className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
                    <div className="rounded-2xl bg-ink/[0.025] p-4">
                      <p className="flex items-center gap-2 text-sm font-bold"><Package size={15} className="text-primary" /> 库存与排队</p>
                      <div className="mt-3 space-y-2 text-xs leading-relaxed text-ink/75">
                        <p>• 预售下单不预占现货库存，付款后只签发提货凭证。</p>
                        <p>• 买家核销后绑定会员；有货立即发卡，无货进入队列。</p>
                        <p>• 在“卡密管理”补货后，系统每分钟按核销顺序尝试交付。</p>
                      </div>
                    </div>
                    <div>
                      <p className="mb-3 flex items-center gap-2 text-sm font-bold"><CircleDollarSign size={15} className="text-primary" /> 保障到期处理</p>
                      <div className="grid gap-2">
                        {([
                          ["BALANCE", "余额赔付", "推荐", "已核销未交付自动退至会员余额；未核销会员也自动入余额，游客转人工。"],
                          ["REFUND", "原路退款处理", "人工", "未核销凭证进入原支付渠道人工退款；已核销未交付仍退会员余额。"],
                          ["SINK", "未核销作废", "高风险", "未核销凭证到期直接失效且不赔付；已核销未交付仍退会员余额。"],
                        ] as const).map(([value, title, badge, text]) => (
                          <button type="button" key={value} onClick={() => setEditing({ ...editing, presaleSettlementMode: value })}
                            className={`rounded-2xl border p-3.5 text-left transition ${editing.presaleSettlementMode === value ? "border-primary bg-accent-soft/60" : "border-ink/[0.08] hover:border-ink/20"}`}>
                            <span className="flex items-center justify-between gap-3">
                              <span className="text-sm font-bold">{title}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${value === "SINK" ? "bg-red-500/10 text-red-500" : "bg-ink/[0.06] text-ink/75"}`}>{badge}</span>
                            </span>
                            <span className="mt-1 block text-[11px] leading-relaxed text-ink/75">{text}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>

                  <div className="rounded-2xl border border-primary/15 bg-accent-soft/45 px-4 py-3.5 text-xs leading-relaxed text-ink/75">
                    <span className="font-bold text-ink">当前规则：</span>
                    销售至 {planTime(editing.presaleSaleEndAt)}；{editing.presaleStartAt ? `预计 ${planTime(editing.presaleStartAt)} 开始交付` : "未承诺具体开始交付时间"}；最晚 {planTime(editing.presaleEndAt)} 完成交付或进入保障处理。
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 右:定价 / 封面 / 售卖设置 */}
          <div className="space-y-5">
            <div className="card p-5">
              <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 定价</p>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-ink/75">{currencySymbol()}</span>
                <input className="input !pl-10 !text-xl !font-extrabold" placeholder="9.90" inputMode="decimal"
                  value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
              </div>
              {editing.id != null && (
                <p className="mt-2 text-[11px] text-ink/75">
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
              <ImageUpload aspect="square" value={editing.coverImage} onChange={(url) => setEditing({ ...editing, coverImage: url })} />
              {!editing.coverImage && <div className="mt-3 flex items-center gap-3 rounded-xl bg-accent-soft p-3">
                <ProductImage name={editing.name} className="h-12 w-12 rounded-xl" />
                <p className="text-xs text-ink/75">{matchProductBrand(editing.name)
                  ? `已根据商品名匹配 ${matchProductBrand(editing.name)!.title} 图标，上传封面可替换。`
                  : "未上传封面时，自动按商品名匹配品牌图标；未匹配则显示通用图标。"}</p>
              </div>}
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
              <div className="mb-4 grid gap-2">
                <button type="button"
                  onClick={() => setEditing({ ...editing, deliveryMode: "AUTO_CARD" })}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${
                    editing.deliveryMode === "AUTO_CARD"
                      ? "border-primary bg-accent-soft text-ink"
                      : "border-ink/[0.08] bg-surface text-ink/75 hover:border-ink/20"
                  }`}>
                  <span className="flex items-center gap-1.5 text-sm font-bold"><KeyRound size={14} /> 自动卡密</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-ink/75">使用现货卡密，付款确认后立即自动发放</span>
                </button>
                <button type="button"
                  onClick={() => setEditing({ ...editing, deliveryMode: "MANUAL" })}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${
                    editing.deliveryMode === "MANUAL"
                      ? "border-primary bg-accent-soft text-ink"
                      : "border-ink/[0.08] bg-surface text-ink/75 hover:border-ink/20"
                  }`}>
                  <span className="flex items-center gap-1.5 text-sm font-bold"><Wrench size={14} /> 人工发货</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-ink/75">收集买家信息，付款后进入后台待处理</span>
                </button>
                <button type="button"
                  onClick={() => setEditing({ ...editing, deliveryMode: "PRESALE_VOUCHER" })}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${
                    editing.deliveryMode === "PRESALE_VOUCHER"
                      ? "border-primary bg-accent-soft text-ink"
                      : "border-ink/[0.08] bg-surface text-ink/75 hover:border-ink/20"
                  }`}>
                  <span className="flex items-center gap-1.5 text-sm font-bold"><TicketCheck size={14} /> 预售提货码</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-ink/75">先售提货凭证，核销后按队列履约</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                  <label className="label">最低订购金额({currencySymbol()})</label>
                  <input className="input !py-2.5" type="number" min={0} step="0.01" value={editing.minOrderAmount}
                    onChange={(e) => setEditing({ ...editing, minOrderAmount: e.target.value })} />
                </div>
                <div>
                  <label className="label">排序</label>
                  <input className="input !py-2.5" type="number" value={editing.sortOrder}
                    onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} />
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink/75">按商品标价 × 数量判断，会员折扣和优惠券不会让已满足的起购资格失效；填 0 表示只限制起购数量。</p>
              <div className="mt-4 flex items-center justify-between rounded-2xl border border-ink/[0.07] bg-ink/[0.02] px-4 py-3">
                <div>
                  <p className="text-sm font-medium">上架展示</p>
                  <p className="text-[11px] text-ink/75">关闭后买家不可见,已付订单不受影响</p>
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

      <div className="card mb-5 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm font-semibold text-ink/65">商品分类</span>
          <input className="input !w-40 !py-1.5 text-xs" placeholder="新分类名" value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void saveCategory()} />
          <button disabled={categoryBusy || !newCategory.trim()} className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => void saveCategory()}>
            <Plus size={13} /> 添加
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((c, index) => (
            <div key={c.id} className="flex min-w-0 items-center gap-1 rounded-2xl border border-ink/[0.08] bg-ink/[0.02] p-2 pl-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
              <button disabled={categoryBusy || index === 0} onClick={() => void moveCategory(index, -1)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink/45 hover:bg-ink/[0.06] disabled:opacity-20" title="上移" aria-label={`上移分类 ${c.name}`}>
                <ArrowUp size={14} />
              </button>
              <button disabled={categoryBusy || index === categories.length - 1} onClick={() => void moveCategory(index, 1)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink/45 hover:bg-ink/[0.06] disabled:opacity-20" title="下移" aria-label={`下移分类 ${c.name}`}>
                <ArrowDown size={14} />
              </button>
              <button disabled={categoryBusy} onClick={() => setDeletingCategory(c)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink/35 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30" title="删除分类" aria-label={`删除分类 ${c.name}`}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {categories.length === 0 && <p className="text-xs text-ink/40">暂无分类,请先添加</p>}
        </div>
        {categoryError && <p className="mt-3 text-xs font-medium text-red-500">{categoryError}</p>}
      </div>

      {deletingCategory && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/40 p-4 backdrop-blur-sm" onClick={() => !categoryBusy && setDeletingCategory(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="delete-category-title" className="card w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-500"><AlertTriangle size={18} /></span>
              <button disabled={categoryBusy} onClick={() => setDeletingCategory(null)} className="grid h-8 w-8 place-items-center rounded-full text-ink/40 hover:bg-ink/[0.06]"><X size={15} /></button>
            </div>
            <h2 id="delete-category-title" className="text-lg font-extrabold">删除“{deletingCategory.name}”?</h2>
            <p className="mt-2 text-sm leading-6 text-ink/55">只有空分类可以删除。分类下仍有商品时,系统会阻止删除并提示先移动商品。</p>
            <div className="mt-6 flex justify-end gap-2">
              <button disabled={categoryBusy} className="btn-ghost !px-4 !py-2" onClick={() => setDeletingCategory(null)}>取消</button>
              <button disabled={categoryBusy} className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={() => void confirmDeleteCategory()}>
                {categoryBusy && <Loader2 size={14} className="animate-spin" />} 确认删除
              </button>
            </div>
          </div>
        </div>
      )}

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
                    <ProductImage name={p.name} coverImage={p.coverImage} className="h-10 w-10 shrink-0 rounded-xl" />
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
                <td className="td text-xs"><p>{p.minBuy}~{p.maxBuy} 件</p>{Number(p.minOrderAmount ?? 0) > 0 && <p className="mt-0.5 text-[10px] text-ink/40">最低 {money(p.minOrderAmount)}</p>}</td>
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
