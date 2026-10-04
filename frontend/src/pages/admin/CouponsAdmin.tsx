import { ExpiryPicker, ScopePicker, type ProductOption } from "../../components/CouponPickers";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BadgePercent, Copy, Hash, Pencil, Plus, Sparkles, X } from "lucide-react";
import { get, post } from "../../lib/api";
import SensitiveConfirm from "../../components/SensitiveConfirm";
import { money } from "../../lib/currency";

interface Coupon {
  id: number | null; code: string; type: "FIXED" | "PERCENT"; value: string;
  minAmount: string; totalLimit: number; usedCount?: number; expireAt: string | null; productId: number | null; enabled: boolean;
}

interface BatchForm {
  prefix: string; suffix: string; count: number; randomLength: number; charset: "SAFE" | "ALNUM" | "NUMERIC"; type: "FIXED" | "PERCENT"; value: string;
  minAmount: string; totalLimit: number; expireAt: string | null; productId: number | null; enabled: boolean;
}

const EMPTY: Coupon = { id: null, code: "", type: "FIXED", value: "", minAmount: "0", totalLimit: 0, expireAt: null, productId: null, enabled: true };
const EMPTY_BATCH: BatchForm = { prefix: "", suffix: "", count: 20, randomLength: 8, charset: "SAFE", type: "FIXED", value: "", minAmount: "0", totalLimit: 1, expireAt: null, productId: null, enabled: true };

const CHARSETS = [
  { value: "SAFE", label: "易读字符", hint: "去掉 0/O/1/I" },
  { value: "ALNUM", label: "字母数字", hint: "A-Z + 0-9" },
  { value: "NUMERIC", label: "纯数字", hint: "0-9" },
] as const;

function TypePicker({ value, onChange }: { value: Coupon["type"]; onChange: (v: Coupon["type"]) => void }) {
  return (
    <div className="grid grid-cols-2 rounded-full border border-ink/10 bg-ink/[0.03] p-1">
      {([
        ["FIXED", "立减"],
        ["PERCENT", "折扣"],
      ] as const).map(([v, label]) => (
        <button key={v} type="button"
          className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
            value === v ? "bg-primary text-primary-contrast shadow-sm" : "text-ink/50 hover:text-ink"
          }`}
          onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" className="flex w-full items-center justify-between rounded-2xl border border-ink/[0.07] bg-ink/[0.02] px-4 py-3 text-left"
      onClick={() => onChange(!checked)}>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-ink/40">{checked ? "创建后立即可用" : "先保存为停用状态"}</span>
      </span>
      <span className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-primary" : "bg-ink/15"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function Drawer({
  title, desc, icon, onClose, children, footer,
}: {
  title: string; desc: string; icon: ReactNode; onClose: () => void;
  children: ReactNode; footer: ReactNode;
}) {
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);

  return createPortal((
    <>
      <div className="fixed inset-0 z-[65] bg-ink/45 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed bottom-0 right-0 top-0 z-[70] flex h-dvh min-h-dvh w-full max-w-2xl flex-col overflow-hidden bg-surface shadow-2xl">
        <header className="shrink-0 border-b border-ink/[0.06] px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-primary">{icon}</span>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink/45">{desc}</p>
            </div>
          </div>
          <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/35 transition hover:bg-ink/[0.06] hover:text-ink"
            onClick={onClose}><X size={17} /></button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        <footer className="shrink-0 border-t border-ink/[0.06] bg-surface px-5 py-4 shadow-[0_-12px_28px_rgb(var(--c-bg)/0.6)] sm:px-6">{footer}</footer>
      </aside>
    </>
  ), document.body);
}

function FieldShell({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-ink/35">{hint}</p>}
    </div>
  );
}

function expiryPayload(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) || Number.isNaN(Date.parse(`${value}+08:00`))) throw new Error("请通过日期时间选择器填写完整有效期");
  return value.length === 16 ? `${value}:00` : value;
}

export default function CouponsAdmin() {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productError, setProductError] = useState("");
  useEffect(() => { get<ProductOption[]>("/admin/coupons/products").then(setProducts).catch(() => setProductError("商品列表加载失败，请刷新页面重试")); }, []);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [batch, setBatch] = useState<BatchForm | null>(null);
  const [pendingBatch, setPendingBatch] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  function load() {
    get<Coupon[]>("/admin/coupons").then(setCoupons).catch(() => void 0);
  }
  useEffect(load, []);

  async function save() {
    if (!editing) return;
    setError("");
    try {
      await post("/admin/coupons", { ...editing, expireAt: expiryPayload(editing.expireAt) });
      setMsg(editing.id ? "优惠券已更新" : "优惠券已创建");
      setEditing(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function createBatch(auth: { password: string; totpCode: string }) {
    if (!batch) return;
    setError("");
    const r = await post<{ created: number; codes: string[] }>("/admin/coupons/batch", {
      ...batch,
      prefix: batch.prefix.trim() || undefined,
      expireAt: expiryPayload(batch.expireAt),
      ...auth,
    });
    setMsg(`已批量创建 ${r.created} 张: ${r.codes.slice(0, 5).join(" / ")}${r.codes.length > 5 ? " …" : ""}`);
    setPendingBatch(false);
    setBatch(null);
    load();
  }

  function confirmBatch() {
    if (!batch) return;
    setError("");
    setMsg("");
    try { expiryPayload(batch.expireAt); } catch (e) { setError((e as Error).message); return; }
    setPendingBatch(true);
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-extrabold tracking-tight">优惠券</h1>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => { setError(""); setMsg(""); setBatch({ ...EMPTY_BATCH }); }}>
            <Copy size={15} /> 批量创建
          </button>
          <button className="btn-primary" onClick={() => { setError(""); setMsg(""); setEditing({ ...EMPTY }); }}>
            <Plus size={15} /> 新建
          </button>
        </div>
      </div>
      {msg && <p className="mb-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm font-medium text-primary">{msg}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead><tr>
            <th className="th">券码</th><th className="th">类型</th><th className="th">面额/折扣</th>
            <th className="th">适用范围</th><th className="th">门槛</th><th className="th">用量</th><th className="th">有效期至</th>
            <th className="th">状态</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={String(c.id)} className="hover:bg-ink/[0.02]">
                <td className="td font-mono font-bold">{c.code}</td>
                <td className="td">{c.type === "FIXED" ? "立减" : "折扣"}</td>
                <td className="td">{c.type === "FIXED" ? money(c.value) : `减 ${c.value}%`}</td>
                <td className="td text-xs">{c.productId == null ? "全商品通用" : products.find(p => p.id === c.productId)?.name ?? `商品 #${c.productId}`}</td>
                <td className="td">{Number(c.minAmount) > 0 ? `满 ${money(c.minAmount)}` : "无"}</td>
                <td className="td">{c.usedCount ?? 0}{c.totalLimit > 0 ? ` / ${c.totalLimit}` : " / ∞"}</td>
                <td className="td text-xs">{c.expireAt ? c.expireAt.replace("T", " ") + " 北京时间" : "长期"}</td>
                <td className="td">
                  <span className={`text-xs font-medium ${c.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-ink/40"}`}>
                    {c.enabled ? "启用" : "停用"}
                  </span>
                </td>
                <td className="td text-right">
                  <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => setEditing({ ...c })}><Pencil size={13} /></button>
                </td>
              </tr>
            ))}
            {coupons.length === 0 && <tr><td className="td text-center text-ink/40" colSpan={9}>暂无优惠券</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <Drawer
          title={editing.id ? "编辑优惠券" : "新建优惠券"}
          desc="单张券码适合临时补发、客服补偿或小范围活动。"
          icon={<BadgePercent size={19} />}
          onClose={() => setEditing(null)}
          footer={(
            <>
              {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
              <button className="btn-primary w-full" disabled={!editing.code || !editing.value || editing.productId === 0} onClick={save}>保存优惠券</button>
            </>
          )}
        >
            <div className="space-y-5">
              <FieldShell label="券码" hint="支持字母、数字和横线,保存时自动转为大写。">
                <input className="input font-mono uppercase" value={editing.code}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
              </FieldShell>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldShell label="优惠类型">
                  <TypePicker value={editing.type} onChange={(type) => setEditing({ ...editing, type })} />
                </FieldShell>
                <FieldShell label={editing.type === "FIXED" ? "立减金额" : "减免百分比"}>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-ink/35">
                      {editing.type === "FIXED" ? "金额" : "%"}
                    </span>
                    <input className="input !pl-12" inputMode="decimal" value={editing.value}
                    onChange={(e) => setEditing({ ...editing, value: e.target.value })} /></div>
                </FieldShell>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldShell label="最低消费" hint="填 0 表示无门槛。">
                  <input className="input" inputMode="decimal" value={editing.minAmount}
                    onChange={(e) => setEditing({ ...editing, minAmount: e.target.value })} />
                </FieldShell>
                <FieldShell label="总可用次数" hint="填 0 表示不限次数。">
                  <input className="input" inputMode="numeric" value={String(editing.totalLimit)}
                    onChange={(e) => setEditing({ ...editing, totalLimit: Number(e.target.value.replace(/\D/g, "") || 0) })} />
                </FieldShell>
              </div>
              <ScopePicker value={editing.productId ?? null} onChange={(productId) => setEditing({ ...editing, productId })} products={products} error={productError} />
              <ExpiryPicker value={editing.expireAt} onChange={(expireAt) => setEditing({ ...editing, expireAt })} />
              <Toggle checked={editing.enabled} onChange={(enabled) => setEditing({ ...editing, enabled })} label="启用优惠券" />
            </div>
        </Drawer>
      )}

      {batch && (
        <Drawer
          title="批量创建优惠券"
          desc="批量生成唯一券码。券码结构、随机字符集和优惠属性都可自定义,提交时需要 2FA。"
          icon={<Sparkles size={19} />}
          onClose={() => setBatch(null)}
          footer={(
            <>
              {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
              <button className="btn-primary w-full"
                disabled={batch.productId === 0 || !batch.value || batch.count < 1 || batch.count > 500 || batch.randomLength < 4}
                onClick={confirmBatch}>
                下一步:双因子确认
              </button>
            </>
          )}
        >
            <div className="space-y-6">
              <section className="rounded-3xl border border-ink/[0.07] p-4">
                <p className="section-label"><Hash size={13} /> 券码结构</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <FieldShell label="开头字母 / 前缀" hint="例如 VIP-, SUMMER-, 空白也可以。">
                  <input className="input font-mono uppercase" value={batch.prefix}
                    onChange={(e) => setBatch({ ...batch, prefix: e.target.value })} />
                  </FieldShell>
                  <FieldShell label="随机位数" hint="4 到 24 位。">
                  <input className="input" inputMode="numeric" value={String(batch.randomLength)}
                    onChange={(e) => setBatch({ ...batch, randomLength: Number(e.target.value.replace(/\D/g, "") || 0) })} />
                  </FieldShell>
                  <FieldShell label="结尾后缀" hint="可选,例如 -A。">
                  <input className="input font-mono uppercase" value={batch.suffix}
                    onChange={(e) => setBatch({ ...batch, suffix: e.target.value })} />
                  </FieldShell>
                </div>

                <div className="mt-4">
                  <label className="label">随机字符集</label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {CHARSETS.map((c) => (
                      <button key={c.value} type="button"
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          batch.charset === c.value ? "border-primary bg-primary text-primary-contrast" : "border-ink/10 bg-surface hover:border-ink/30"
                        }`}
                        onClick={() => setBatch({ ...batch, charset: c.value })}>
                        <span className="block text-sm font-bold">{c.label}</span>
                        <span className={`mt-0.5 block text-[11px] ${batch.charset === c.value ? "text-primary-contrast/70" : "text-ink/40"}`}>{c.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-3xl bg-accent-soft px-5 py-4">
                  <p className="text-xs font-semibold text-primary/70">券码预览</p>
                  <p className="mt-2 break-all font-mono text-xl font-extrabold tracking-wide text-primary">
                    {(batch.prefix || "").toUpperCase()}{Array.from({ length: Math.max(0, Math.min(batch.randomLength, 16)) }).map(() => batch.charset === "NUMERIC" ? "0" : "X").join("")}{(batch.suffix || "").toUpperCase()}
                  </p>
                </div>
              </section>

              <section className="rounded-3xl border border-ink/[0.07] p-4">
                <p className="section-label"><BadgePercent size={13} /> 优惠属性</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <FieldShell label="创建数量" hint="最多一次 500 张。">
                  <input className="input" inputMode="numeric" value={String(batch.count)}
                    onChange={(e) => setBatch({ ...batch, count: Number(e.target.value.replace(/\D/g, "") || 0) })} />
                  </FieldShell>
                  <FieldShell label="优惠类型">
                  <TypePicker value={batch.type} onChange={(type) => setBatch({ ...batch, type })} />
                  </FieldShell>
                  <FieldShell label={batch.type === "FIXED" ? "立减金额" : "减免百分比"}>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-ink/35">
                      {batch.type === "FIXED" ? "金额" : "%"}
                    </span>
                    <input className="input !pl-12" inputMode="decimal" value={batch.value}
                      onChange={(e) => setBatch({ ...batch, value: e.target.value })} />
                  </div>
                  </FieldShell>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <FieldShell label="最低消费" hint="填 0 表示无门槛。">
                  <input className="input" inputMode="decimal" value={batch.minAmount}
                    onChange={(e) => setBatch({ ...batch, minAmount: e.target.value })} />
                  </FieldShell>
                  <FieldShell label="每张可用次数" hint="填 0 表示不限次数,默认每张 1 次。">
                  <input className="input" inputMode="numeric" value={String(batch.totalLimit)}
                    onChange={(e) => setBatch({ ...batch, totalLimit: Number(e.target.value.replace(/\D/g, "") || 0) })} />
                  </FieldShell>
                </div>
              </section>

              <section className="rounded-3xl border border-ink/[0.07] p-4">
                <p className="section-label"><Sparkles size={13} /> 生效方式</p>
                <ScopePicker value={batch.productId ?? null} onChange={(productId) => setBatch({ ...batch, productId })} products={products} error={productError} />
              <ExpiryPicker value={batch.expireAt} onChange={(expireAt) => setBatch({ ...batch, expireAt })} />
                <div className="mt-4">
              <Toggle checked={batch.enabled} onChange={(enabled) => setBatch({ ...batch, enabled })} label="创建后启用" />
                </div>
              </section>
            </div>
        </Drawer>
      )}

      {pendingBatch && batch && (
        <SensitiveConfirm
          action={{
            title: "批量创建优惠券",
            confirmText: "确认批量创建",
            summary: (
              <div className="space-y-1">
                <div className="flex justify-between gap-3"><span className="text-ink/45">生成数量</span><span className="font-semibold">{batch.count} 张</span></div>
                <div className="flex justify-between gap-3"><span className="text-ink/45">券码格式</span><span className="font-mono">{(batch.prefix || "").toUpperCase()} + {batch.randomLength} 位随机 + {(batch.suffix || "").toUpperCase() || "无后缀"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-ink/45">每张用量</span><span>{batch.totalLimit > 0 ? batch.totalLimit : "不限"}</span></div>
              </div>
            ),
          }}
          onConfirm={createBatch}
          onClose={() => setPendingBatch(false)}
        />
      )}
    </div>
  );
}
