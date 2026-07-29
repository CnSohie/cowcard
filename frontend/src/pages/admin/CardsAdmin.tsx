import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, EyeOff, FileText, KeyRound,
  PackageCheck, Pencil, Search, ShieldCheck, Trash2, Upload, X,
} from "lucide-react";
import { ApiError, del, get, post, put } from "../../lib/api";
import SensitiveConfirm from "../../components/SensitiveConfirm";

interface AdminProduct { id: number; name: string; stockCached: number; }
interface PageResult<T> { items: T[]; total: number; page: number; size: number; }
interface CardRow {
  id: number; productId: number; status: "AVAILABLE" | "SOLD" | "DISABLED";
  orderId: number | null; createdAt: string; soldAt: string | null;
}
interface CardContent { id: number; content: string; editable: boolean; }

const SIZE = 20;
const STATUS = [
  ["", "全部"],
  ["AVAILABLE", "可售"],
  ["SOLD", "已售"],
  ["DISABLED", "停用"],
] as const;

const STATUS_META: Record<CardRow["status"], string> = {
  AVAILABLE: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  SOLD: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  DISABLED: "bg-ink/[0.06] text-ink/45",
};

function fmt(s: string | null) {
  return s ? new Date(s).toLocaleString() : "-";
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

function looksLikeHeader(row: string[]) {
  const text = row.join(" ").toLowerCase();
  return ["card", "secret", "code", "password", "卡密", "卡号", "账号", "密码", "内容"].some((k) => text.includes(k));
}

function parseCardFileText(name: string, text: string) {
  const isCsv = /\.csv$/i.test(name);
  if (!isCsv) {
    return text.replace(/^\uFEFF/, "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  let rows = parseCsvRows(text)
    .map((row) => row.map((cell) => cell.trim()).filter(Boolean))
    .filter((row) => row.length > 0);
  if (rows.length > 1 && looksLikeHeader(rows[0])) rows = rows.slice(1);
  return rows.map((row) => row.join("----")).filter(Boolean);
}

export default function CardsAdmin() {
  const [unlocked, setUnlocked] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [productId, setProductId] = useState<number | "">("");
  const [lines, setLines] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [productKw, setProductKw] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PageResult<CardRow> | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState<CardRow | null>(null);
  const [cardContent, setCardContent] = useState<CardContent | null>(null);
  const [contentText, setContentText] = useState("");
  const [contentBusy, setContentBusy] = useState(false);
  const [contentErr, setContentErr] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    get<AdminProduct[]>("/admin/catalog/products").then((p) => {
      setProducts(p);
      if (p.length) setProductId((old) => old || p[0].id);
    }).catch(() => void 0);
  }, []);

  useEffect(() => {
    if (!unlocked || !productId) return;
    loadCards();
  }, [unlocked, productId, status, page]);

  async function unlock(auth: { password: string; totpCode: string }) {
    await post("/admin/cards/unlock", auth);
    setUnlocked(true);
  }

  async function loadProducts() {
    get<AdminProduct[]>("/admin/catalog/products").then(setProducts).catch(() => void 0);
  }

  async function loadCards() {
    if (!productId) return;
    setLoading(true);
    setMsg("");
    try {
      const [rows, s] = await Promise.all([
        get<PageResult<CardRow>>("/admin/cards", {
          productId, status: status || undefined, page: page - 1, size: SIZE,
        }),
        get<Record<string, number>>("/admin/cards/stats", { productId }),
      ]);
      setData(rows);
      setStats(s);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "卡密加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function doImport() {
    if (!productId) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await post<{ imported: number; duplicated: number }>("/admin/cards/import", {
        productId, lines: lines.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      setMsg(`导入成功 ${r.imported} 条,重复跳过 ${r.duplicated} 条`);
      setLines("");
      await Promise.all([loadProducts(), loadCards()]);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function readCardFile(file?: File | null) {
    if (!file) return;
    setMsg("");
    const ok = /\.(txt|csv)$/i.test(file.name) || ["text/plain", "text/csv", "application/vnd.ms-excel"].includes(file.type);
    if (!ok) {
      setMsg("仅支持 TXT 或 CSV 文件");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMsg("文件不能超过 2MB,请拆分后导入");
      return;
    }
    try {
      const parsed = parseCardFileText(file.name, await file.text());
      if (parsed.length === 0) {
        setMsg("文件里没有可导入的卡密");
        return;
      }
      if (parsed.length > 10000) {
        setMsg("单次最多导入 10000 条,请拆分文件");
        return;
      }
      if (parsed.some((s) => s.length > 4000)) {
        setMsg("文件里存在超过 4000 字符的单条卡密");
        return;
      }
      setFileName(file.name);
      setLines(parsed.join("\n"));
      setMsg(`已读取 ${file.name},解析出 ${parsed.length} 条,确认无误后点击导入`);
    } catch {
      setMsg("文件读取失败,请确认文件编码为 UTF-8");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function setCardStatus(row: CardRow, next: "AVAILABLE" | "DISABLED") {
    setMsg("");
    try {
      await post(`/admin/cards/${row.id}/status`, { status: next });
      await Promise.all([loadProducts(), loadCards()]);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "状态更新失败");
    }
  }

  async function deleteCard(row: CardRow) {
    setMsg("");
    try {
      await del(`/admin/cards/${row.id}`);
      await Promise.all([loadProducts(), loadCards()]);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "删除失败");
    }
  }

  async function openContent(row: CardRow) {
    setViewing(row);
    setCardContent(null);
    setContentText("");
    setContentErr("");
    setContentBusy(true);
    try {
      const r = await get<CardContent>(`/admin/cards/${row.id}/content`);
      setCardContent(r);
      setContentText(r.content);
    } catch (e) {
      setContentErr(e instanceof ApiError ? e.message : "卡密查看失败");
    } finally {
      setContentBusy(false);
    }
  }

  async function saveContent() {
    if (!viewing) return;
    setContentBusy(true);
    setContentErr("");
    try {
      const r = await put<CardContent>(`/admin/cards/${viewing.id}/content`, { content: contentText });
      setCardContent(r);
      setContentText(r.content);
      setMsg("卡密内容已更新");
    } catch (e) {
      setContentErr(e instanceof ApiError ? e.message : "卡密保存失败");
    } finally {
      setContentBusy(false);
    }
  }

  const count = lines.split("\n").filter((s) => s.trim()).length;
  const selected = products.find((p) => p.id === productId) ?? null;
  const filtered = products.filter((p) => p.name.toLowerCase().includes(productKw.trim().toLowerCase()));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / SIZE)) : 1;

  return (
    <div className="animate-fade-up">
      {!unlocked && (
        <SensitiveConfirm
          action={{
            title: "进入卡密管理",
            confirmText: "进入卡密管理",
            summary: (
              <div className="space-y-1 text-xs leading-relaxed text-ink/60">
                <p>卡密属于高敏数据。进入后可查看库存状态、停用未售卡密和删除未售卡密。</p>
                <p>已售卡密只允许追踪订单,不允许改删。</p>
              </div>
            ),
          }}
          onConfirm={unlock}
          onClose={() => history.back()}
        />
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
            <KeyRound size={19} /> 卡密管理
          </h1>
          <p className="mt-1 text-xs text-ink/45">按商品管理卡密库存、状态、导入时间和已售订单。</p>
        </div>
        <button className="btn-ghost !py-2 text-xs" onClick={() => setUnlocked(false)}>
          <ShieldCheck size={13} /> 重新验证
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <section className="card h-fit p-6">
          <label className="label">目标商品</label>
          <div className="relative mb-4">
            <button type="button" className="input flex items-center justify-between gap-3 text-left"
              onClick={() => setPickerOpen((v) => !v)}>
              {selected ? (
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-accent-soft">
                    <PackageCheck size={15} className="text-primary" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{selected.name}</span>
                    <span className="block text-xs text-ink/40">当前可售 {selected.stockCached} 张</span>
                  </span>
                </span>
              ) : (
                <span className="text-ink/35">选择商品</span>
              )}
              <ChevronDown size={16} className={`shrink-0 text-ink/35 transition ${pickerOpen ? "rotate-180" : ""}`} />
            </button>
            {pickerOpen && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-3xl border border-ink/10 bg-surface shadow-2xl">
                <div className="relative border-b border-ink/[0.06] p-3">
                  <Search size={14} className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-ink/30" />
                  <input className="input !py-2 !pl-9 text-xs" autoFocus placeholder="搜索商品"
                    value={productKw} onChange={(e) => setProductKw(e.target.value)} />
                </div>
                <div className="max-h-72 overflow-y-auto p-2">
                  {filtered.map((p) => (
                    <button key={p.id} type="button"
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-ink/[0.04] ${
                        p.id === productId ? "bg-accent-soft" : ""
                      }`}
                      onClick={() => { setProductId(p.id); setStatus(""); setPage(1); setPickerOpen(false); setProductKw(""); }}>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{p.name}</span>
                        <span className="block text-xs text-ink/40">可售 {p.stockCached} 张</span>
                      </span>
                      {p.id === productId && <Check size={15} className="shrink-0 text-primary" />}
                    </button>
                  ))}
                  {filtered.length === 0 && <p className="px-3 py-8 text-center text-sm text-ink/40">没有匹配的商品</p>}
                </div>
              </div>
            )}
          </div>

          <div className="mb-5 grid grid-cols-3 gap-2">
            {([
              ["可售", stats.AVAILABLE ?? 0],
              ["已售", stats.SOLD ?? 0],
              ["停用", stats.DISABLED ?? 0],
            ] as const).map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-ink/[0.07] px-3 py-3 text-center">
                <p className="text-lg font-extrabold">{value}</p>
                <p className="mt-0.5 text-[11px] text-ink/40">{label}</p>
              </div>
            ))}
          </div>

          <label className="label">导入卡密</label>
          <input ref={fileRef} type="file" accept=".txt,.csv,text/plain,text/csv" className="hidden"
            onChange={(e) => readCardFile(e.target.files?.[0])} />
          <button type="button"
            className={`mb-3 flex w-full items-center justify-between gap-3 rounded-3xl border border-dashed px-4 py-4 text-left transition ${
              dragOver ? "border-primary bg-accent-soft" : "border-ink/15 bg-ink/[0.02] hover:border-primary/35 hover:bg-accent-soft/50"
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              readCardFile(e.dataTransfer.files?.[0]);
            }}>
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-primary">
                <FileText size={17} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-ink">{fileName || "选择 TXT / CSV 文件"}</span>
                <span className="block text-xs leading-relaxed text-ink/45">TXT 每行一条; CSV 每行非空列会用 ---- 合并成一条卡密。</span>
              </span>
            </span>
            <Upload size={16} className="shrink-0 text-ink/35" />
          </button>
          <label className="label">卡密内容(每行一条,可手动修改后再导入)</label>
          <textarea className="input min-h-56 font-mono text-xs" placeholder={"CARD-XXXX-YYYY----PWD123\nCARD-AAAA-BBBB----PWD456"}
            value={lines} onChange={(e) => setLines(e.target.value)} />
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-ink/45">共 {count} 行</span>
            <button className="btn-primary" disabled={busy || !productId || count === 0} onClick={doImport}>
              <Upload size={15} /> {busy ? "导入中…" : "导入"}
            </button>
          </div>
          {msg && <p className={`mt-3 text-sm ${msg.includes("失败") || msg.includes("不允许") ? "text-red-500" : "text-primary"}`}>{msg}</p>}
        </section>

        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/[0.06] p-4">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-ink/[0.04] p-1">
              {STATUS.map(([v, label]) => (
                <button key={v} className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  status === v ? "bg-surface text-ink shadow-sm" : "text-ink/45 hover:text-ink"
                }`}
                  onClick={() => { setStatus(v); setPage(1); }}>
                  {label}
                </button>
              ))}
            </div>
            <button className="btn-ghost !py-2 text-xs" disabled={!productId || loading} onClick={loadCards}>
              刷新
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead><tr>
                <th className="th">卡密 ID</th><th className="th">状态</th><th className="th">导入时间</th>
                <th className="th">售出订单</th><th className="th">售出时间</th><th className="th">内容</th><th className="th"></th>
              </tr></thead>
              <tbody>
                {loading ? (
                  <tr><td className="td py-16 text-center text-ink/40" colSpan={7}>加载中...</td></tr>
                ) : (data?.items ?? []).map((row) => (
                  <tr key={row.id} className="hover:bg-ink/[0.02]">
                    <td className="td font-mono font-semibold">#{row.id}</td>
                    <td className="td">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_META[row.status]}`}>
                        {row.status === "AVAILABLE" ? "可售" : row.status === "SOLD" ? "已售" : "停用"}
                      </span>
                    </td>
                    <td className="td text-xs text-ink/45">{fmt(row.createdAt)}</td>
                    <td className="td font-mono text-xs">{row.orderId ? `#${row.orderId}` : "-"}</td>
                    <td className="td text-xs text-ink/45">{fmt(row.soldAt)}</td>
                    <td className="td">
                      <button className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-accent-soft/80"
                        onClick={() => openContent(row)}>
                        <KeyRound size={13} /> 查看
                      </button>
                    </td>
                    <td className="td text-right">
                      {row.status === "SOLD" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-ink/35"><EyeOff size={13} /> 已售锁定</span>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button className="btn-ghost !px-3 !py-1.5 text-xs"
                            onClick={() => setCardStatus(row, row.status === "AVAILABLE" ? "DISABLED" : "AVAILABLE")}>
                            {row.status === "AVAILABLE" ? "停用" : "启用"}
                          </button>
                          <button className="btn-ghost !px-3 !py-1.5 text-xs !text-red-500" onClick={() => deleteCard(row)}>
                            <Trash2 size={13} /> 删除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {data && data.items.length === 0 && (
                  <tr><td className="td py-16 text-center text-ink/40" colSpan={7}>该筛选下暂无卡密</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {data && totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 border-t border-ink/[0.06] p-4">
              <button className="btn-ghost !px-3 !py-1.5" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button>
              <span className="text-xs text-ink/45">{page} / {totalPages} 页 · 共 {data.total} 条</span>
              <button className="btn-ghost !px-3 !py-1.5" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button>
            </div>
          )}
        </section>
      </div>

      {viewing && createPortal((
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="drawer-mask !z-0" onClick={() => setViewing(null)} />
          <div className="card relative z-10 w-full max-w-xl animate-fade-up overflow-hidden">
            <div className="flex items-start justify-between border-b border-ink/[0.06] p-5">
              <div>
                <p className="text-lg font-extrabold">卡密 #{viewing.id}</p>
                <p className="mt-1 text-xs text-ink/45">
                  {viewing.status === "SOLD" ? "已售卡密只允许查看,不允许编辑。" : "未售卡密可编辑,保存后仍会加密落库。"}
                </p>
              </div>
              <button className="grid h-9 w-9 place-items-center rounded-full text-ink/40 hover:bg-ink/[0.06] hover:text-ink"
                onClick={() => setViewing(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              {contentBusy && !cardContent ? (
                <div className="py-12 text-center text-sm text-ink/40">正在解密读取...</div>
              ) : (
                <>
                  <label className="label">卡密内容</label>
                  <textarea className="input min-h-40 font-mono text-sm leading-relaxed"
                    readOnly={!cardContent?.editable}
                    value={contentText}
                    onChange={(e) => setContentText(e.target.value)} />
                  {contentErr && <p className="mt-3 text-xs text-red-500">{contentErr}</p>}
                  <div className="mt-5 flex justify-end gap-3">
                    <button className="btn-ghost" onClick={() => setViewing(null)}>关闭</button>
                    {cardContent?.editable && (
                      <button className="btn-primary" disabled={contentBusy || !contentText.trim()} onClick={saveContent}>
                        <Pencil size={14} /> {contentBusy ? "保存中..." : "保存修改"}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
