import { ExpiryPicker, ScopePicker, type ProductOption } from "../../components/CouponPickers";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BadgePercent, Check, Copy, Hash, Minus, Pencil, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { get, post } from "../../lib/api";
import SensitiveConfirm from "../../components/SensitiveConfirm";
import { money } from "../../lib/currency";

interface Coupon {
  id: number | null; code: string; type: "FIXED" | "PERCENT"; value: string;
  minAmount: string; totalLimit: number; usedCount?: number; expireAt: string | null;
  productId: number | null; productName?: string | null; enabled: boolean;
}

interface BatchForm {
  prefix: string; suffix: string; count: number; randomLength: number; charset: "SAFE" | "ALNUM" | "NUMERIC"; type: "FIXED" | "PERCENT"; value: string;
  minAmount: string; totalLimit: number; expireAt: string | null; productId: number | null; enabled: boolean;
}

type CodeMode = "AUTO" | "MANUAL";
type Charset = BatchForm["charset"];
interface AutoCode { prefix: string; randomLength: number; charset: Charset; }

const EMPTY: Coupon = { id: null, code: "", type: "FIXED", value: "", minAmount: "0", totalLimit: 0, expireAt: null, productId: null, enabled: true };
const EMPTY_BATCH: BatchForm = { prefix: "", suffix: "", count: 20, randomLength: 8, charset: "SAFE", type: "FIXED", value: "", minAmount: "0", totalLimit: 1, expireAt: null, productId: null, enabled: true };
const EMPTY_AUTO: AutoCode = { prefix: "", randomLength: 6, charset: "SAFE" };

const CHARSETS = [
  { value: "SAFE", label: "易读字符", hint: "去掉 0/O/1/I" },
  { value: "ALNUM", label: "字母数字", hint: "A-Z + 0-9" },
  { value: "NUMERIC", label: "纯数字", hint: "0-9" },
] as const;

function Tick({
  checked, mixed, onChange, label, disabled,
}: {
  checked: boolean; mixed?: boolean; onChange: () => void; label: string; disabled?: boolean;
}) {
  const on = checked || !!mixed;
  return (
    <button type="button" role="checkbox" aria-checked={checked ? true : mixed ? "mixed" : false}
      aria-label={label} disabled={disabled}
      className={`grid h-5 w-5 place-items-center rounded-md border transition disabled:opacity-40 ${
        on ? "border-primary bg-primary text-primary-contrast" : "border-ink/20 bg-surface hover:border-ink/40"
      }`}
      onClick={onChange}>
      {checked ? <Check size={13} strokeWidth={3} /> : mixed ? <Minus size={13} strokeWidth={3} /> : null}
    </button>
  );
}

function ModePicker({ value, onChange }: { value: CodeMode; onChange: (v: CodeMode) => void }) {
  return (
    <div className="grid grid-cols-2 rounded-full border border-ink/10 bg-ink/[0.03] p-1">
      {([
        ["AUTO", "自动生成"],
        ["MANUAL", "手动填写"],
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

function DeleteConfirm({ rows, onClose, onConfirm }: {
  rows: Coupon[]; onClose: () => void; onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const used = rows.filter((c) => (c.usedCount ?? 0) > 0).length;
  const preview = rows.slice(0, 8);

  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener("keydown", onKey);
    };
  }, [busy, onClose]);

  async function go() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
      setBusy(false);
    }
  }

  return createPortal((
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-ink/45 px-4 py-[max(16px,8dvh)] backdrop-blur-sm"
      onClick={() => !busy && onClose()}>
      <div className="card my-auto w-full max-w-md !bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">删除优惠券</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink/45">删除后券码立即失效。历史订单仍保留当时的券码记录。</p>
          </div>
          <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/35 transition hover:bg-ink/[0.06] hover:text-ink"
            onClick={onClose} disabled={busy}><X size={17} /></button>
        </div>
        <div className="mt-4 rounded-2xl bg-ink/[0.03] px-4 py-3 text-sm">
          <p>将删除已勾选的 <span className="font-bold">{rows.length}</span> 张优惠券{used > 0 ? `，其中 ${used} 张已有核销记录` : ""}。</p>
          {preview.length > 0 && (
            <p className="mt-2 break-all font-mono text-xs font-semibold text-ink/70">
              {preview.map((c) => c.code).join(" / ")}{rows.length > preview.length ? " …" : ""}
            </p>
          )}
        </div>
        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button className="btn-ghost" disabled={busy} onClick={onClose}>取消</button>
          <button className="btn-primary !bg-red-600 !text-white hover:!bg-red-700" disabled={busy || rows.length === 0} onClick={go}>
            {busy ? "删除中…" : "确认删除"}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

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
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [codeMode, setCodeMode] = useState<CodeMode>("MANUAL");
  const [autoCode, setAutoCode] = useState<AutoCode>(EMPTY_AUTO);
  const [randomPart, setRandomPart] = useState("");
  const [generating, setGenerating] = useState(false);
  const genSeq = useRef(0);
  const codeModeRef = useRef<CodeMode>("MANUAL");
  const autoRef = useRef<AutoCode>(EMPTY_AUTO);
  codeModeRef.current = codeMode;
  autoRef.current = autoCode;

  function load() {
    get<Coupon[]>("/admin/coupons").then((rows) => {
      setCoupons(rows);
      setSelected((cur) => cur.filter((id) => rows.some((c) => c.id === id)));
    }).catch(() => void 0);
  }
  useEffect(load, []);

  async function fillGenerated(form: AutoCode) {
    const prefix = form.prefix.trim().toUpperCase();
    if (form.randomLength < 4 || form.randomLength > 10) {
      setError("加密位数需在 4 到 10 位之间");
      return;
    }
    if (prefix.length + form.randomLength > 32) {
      setError("格式头 + 加密位数不能超过 32 位");
      return;
    }
    const seq = ++genSeq.current;
    setGenerating(true);
    setError("");
    try {
      const r = await post<{ code: string }>("/admin/coupons/generate", {
        prefix: prefix || undefined,
        randomLength: form.randomLength,
        charset: form.charset,
      });
      if (seq !== genSeq.current || codeModeRef.current !== "AUTO") return;
      const latest = autoRef.current;
      if (latest.randomLength !== form.randomLength || latest.charset !== form.charset) return;
      const latestPrefix = latest.prefix.trim().toUpperCase();
      const random = r.code.startsWith(prefix) ? r.code.slice(prefix.length) : r.code;
      if (latestPrefix.length + random.length > 32) {
        setError("格式头 + 加密位数不能超过 32 位");
        return;
      }
      setRandomPart(random);
      setEditing((cur) => (cur && cur.id == null ? { ...cur, code: latestPrefix + random } : cur));
    } catch (e) {
      if (seq !== genSeq.current) return;
      setError(e instanceof Error ? e.message : "券码生成失败");
    } finally {
      if (seq === genSeq.current) setGenerating(false);
    }
  }

  function openCreate() {
    const next = { ...EMPTY_AUTO };
    setError("");
    setMsg("");
    setCodeMode("AUTO");
    codeModeRef.current = "AUTO";
    autoRef.current = next;
    setAutoCode(next);
    setRandomPart("");
    setEditing({ ...EMPTY });
    void fillGenerated(next);
  }

  function chooseMode(mode: CodeMode) {
    if (mode === codeModeRef.current) return;
    setCodeMode(mode);
    codeModeRef.current = mode;
    setError("");
    if (mode === "AUTO") void fillGenerated(autoRef.current);
  }

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

  const selectedRows = coupons.filter((c): c is Coupon & { id: number } => c.id != null && selected.includes(c.id));
  const allChecked = coupons.length > 0 && selectedRows.length === coupons.length;

  function toggleAll() {
    setSelected(allChecked ? [] : coupons.flatMap((c) => (c.id == null ? [] : [c.id])));
  }

  function toggleOne(id: number) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function removeSelected() {
    const ids = selectedRows.map((c) => c.id);
    if (ids.length === 0) throw new Error("请选择要删除的优惠券");
    const r = await post<{ deleted: number }>("/admin/coupons/delete", { ids });
    setMsg(`已删除 ${r.deleted} 张优惠券`);
    setConfirmDelete(false);
    setSelected([]);
    setEditing((cur) => (cur && cur.id != null && ids.includes(cur.id) ? null : cur));
    load();
  }

  const autoActive = !!editing && editing.id == null && codeMode === "AUTO";
  const autoReady = !autoActive || (
    !generating
    && autoCode.randomLength >= 4
    && autoCode.randomLength <= 10
    && randomPart.length === autoCode.randomLength
    && !!editing
    && editing.code.length >= 4
    && editing.code.length <= 32
  );

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-extrabold tracking-tight">优惠券</h1>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => { setError(""); setMsg(""); setBatch({ ...EMPTY_BATCH }); }}>
            <Copy size={15} /> 批量创建
          </button>
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={15} /> 新建
          </button>
        </div>
      </div>
      {msg && <p className="mb-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm font-medium text-primary">{msg}</p>}
      {selectedRows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <span className="text-sm font-medium text-red-600 dark:text-red-400">已勾选 {selectedRows.length} 张</span>
          <button className="btn-ghost !border-red-500/30 !px-4 !py-2 !text-red-600 dark:!text-red-400"
            onClick={() => { setError(""); setConfirmDelete(true); }}>
            <Trash2 size={14} /> 删除所选
          </button>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[680px]">
          <thead><tr>
            <th className="th w-12">
              <Tick checked={allChecked} mixed={!allChecked && selectedRows.length > 0} disabled={coupons.length === 0}
                onChange={toggleAll} label="全选优惠券" />
            </th>
            <th className="th">券码</th><th className="th">类型</th><th className="th">面额/折扣</th>
            <th className="th">适用范围</th><th className="th">门槛</th><th className="th">用量</th><th className="th">有效期至</th>
            <th className="th">状态</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={String(c.id)} className={c.id != null && selected.includes(c.id) ? "bg-accent-soft/70" : "hover:bg-ink/[0.02]"}>
                <td className="td w-12">
                  {c.id != null && (
                    <Tick checked={selected.includes(c.id)} onChange={() => toggleOne(c.id!)} label={`选择 ${c.code}`} />
                  )}
                </td>
                <td className="td font-mono font-bold">{c.code}</td>
                <td className="td">{c.type === "FIXED" ? "立减" : "折扣"}</td>
                <td className="td">{c.type === "FIXED" ? money(c.value) : `减 ${c.value}%`}</td>
                <td className="td">
                  {c.productId == null ? (
                    <span className="text-ink/55">全店通用</span>
                  ) : (
                    <span className="font-semibold">{c.productName || products.find(p => p.id === c.productId)?.name || `商品 #${c.productId}`}</span>
                  )}
                </td>
                <td className="td">{Number(c.minAmount) > 0 ? `满 ${money(c.minAmount)}` : "无"}</td>
                <td className="td">{c.usedCount ?? 0}{c.totalLimit > 0 ? ` / ${c.totalLimit}` : " / ∞"}</td>
                <td className="td text-xs">{c.expireAt ? c.expireAt.replace("T", " ") + " 北京时间" : "长期"}</td>
                <td className="td">
                  <span className={`text-xs font-medium ${c.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-ink/40"}`}>
                    {c.enabled ? "启用" : "停用"}
                  </span>
                </td>
                <td className="td text-right">
                  <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => { setCodeMode("MANUAL"); setEditing({ ...c }); }}><Pencil size={13} /></button>
                </td>
              </tr>
            ))}
            {coupons.length === 0 && <tr><td className="td text-center text-ink/40" colSpan={10}>暂无优惠券</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <Drawer
          title={editing.id ? "编辑优惠券" : "新建优惠券"}
          desc={editing.id
            ? "可以修改券码、面额、范围和启用状态。"
            : "适合临时补发或小范围活动。可手写券码,或指定格式头后自动生成不超过 10 位的加密段。"}
          icon={<BadgePercent size={19} />}
          onClose={() => setEditing(null)}
          footer={(
            <>
              {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
              <button className="btn-primary w-full" disabled={!autoReady || !editing.code || !editing.value || editing.productId === 0} onClick={save}>保存优惠券</button>
            </>
          )}
        >
            <div className="space-y-5">
              {editing.id == null && (
                <FieldShell label="券码方式">
                  <ModePicker value={codeMode} onChange={chooseMode} />
                </FieldShell>
              )}
              {autoActive ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FieldShell label="格式头" hint="可留空。仅字母、数字和横线,例如 VIP。">
                      <input className="input font-mono uppercase" value={autoCode.prefix} maxLength={16}
                        onChange={(e) => {
                          const prefix = e.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 16);
                          const next = { ...autoCode, prefix };
                          autoRef.current = next;
                          setAutoCode(next);
                          setEditing({ ...editing, code: prefix.trim().toUpperCase() + randomPart });
                        }} />
                    </FieldShell>
                    <FieldShell label="加密位数" hint="安全随机生成,4 到 10 位。">
                      <input className="input" inputMode="numeric" value={String(autoCode.randomLength)}
                        onChange={(e) => {
                          const randomLength = Number(e.target.value.replace(/\D/g, "") || 0);
                          const next = { ...autoCode, randomLength };
                          autoRef.current = next;
                          setAutoCode(next);
                        }}
                        onBlur={() => {
                          if (autoCode.randomLength >= 4 && autoCode.randomLength <= 10 && autoCode.randomLength !== randomPart.length) {
                            void fillGenerated(autoRef.current);
                          }
                        }} />
                    </FieldShell>
                  </div>
                  <div>
                    <p className="label">加密字符集</p>
                    <div className="flex flex-wrap gap-2">
                      {CHARSETS.map((c) => (
                        <button key={c.value} type="button"
                          className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                            autoCode.charset === c.value ? "border-primary/20 bg-accent-soft text-primary" : "border-ink/10 text-ink/60 hover:border-primary/40"
                          }`}
                          onClick={() => {
                            const next = { ...autoCode, charset: c.value };
                            autoRef.current = next;
                            setAutoCode(next);
                            void fillGenerated(next);
                          }}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-ink/10 bg-surface px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-medium text-ink/45">券码预览</p>
                      <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" disabled={generating || autoCode.randomLength < 4 || autoCode.randomLength > 10}
                        onClick={() => void fillGenerated(autoRef.current)}>
                        <RefreshCw size={13} className={generating ? "animate-spin" : ""} /> {generating ? "生成中" : "重新生成"}
                      </button>
                    </div>
                    <p className="mt-1 break-all font-mono text-lg font-extrabold tracking-wide">
                      {editing.code || (generating ? "生成中…" : "待生成")}
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-ink/40">
                      {randomPart ? `加密段 ${randomPart.length} 位 · 整码 ${editing.code.length} 位` : "正在生成加密段"}
                      {editing.code.length > 10 ? " · 整码超过 10 位，买家输入会更长" : ""}
                      {(autoCode.randomLength < 4 || autoCode.randomLength > 10) ? " · 加密位数需在 4 到 10 位之间" : ""}
                      {autoCode.randomLength >= 4 && autoCode.randomLength <= 10 && randomPart.length !== autoCode.randomLength && !generating ? " · 位数已改，请重新生成" : ""}
                    </p>
                  </div>
                </>
              ) : (
                <FieldShell label="券码" hint="支持字母、数字和横线,保存时自动转为大写。">
                  <input className="input font-mono uppercase" value={editing.code}
                    onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
                </FieldShell>
              )}
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

      {confirmDelete && (
        <DeleteConfirm rows={selectedRows} onClose={() => setConfirmDelete(false)} onConfirm={removeSelected} />
      )}
    </div>
  );
}
