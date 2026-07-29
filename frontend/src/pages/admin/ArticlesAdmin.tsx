import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Eye, EyeOff, Loader2,
  Pencil, Pin, Plus, Scissors, Search, ShoppingBag, Trash2,
} from "lucide-react";
import { ApiError, del, get, post } from "../../lib/api";
import ImageUpload from "../../components/ImageUpload";
import { renderMarkdown } from "../../lib/markdown";
import { currencyCode, currencySymbol, money } from "../../lib/currency";

/** 媒体文章管理:列表 + 全页 Markdown 编辑器(付费分割线 / 封面 / 实时预览)。 */

const PAYWALL = "<!--paywall-->";

interface AdminArticle {
  id: number | null; slug: string; title: string; category: string; tags: string;
  coverImage: string; summary: string; contentMd: string; price: string;
  status: "DRAFT" | "PUBLISHED"; pinned: boolean; views: number; purchaseCount: number;
  publishedAt: string | null; updatedAt: string | null;
}
interface PageResult<T> { items: T[]; total: number; page: number; size: number; }

const EMPTY: AdminArticle = {
  id: null, slug: "", title: "", category: "", tags: "", coverImage: "", summary: "",
  contentMd: "", price: "0", status: "DRAFT", pinned: false, views: 0, purchaseCount: 0,
  publishedAt: null, updatedAt: null,
};

const ARTICLE_STATUS = [
  { value: "", label: "全部" },
  { value: "PUBLISHED", label: "已发布" },
  { value: "DRAFT", label: "草稿" },
] as const;

function norm(a: Partial<AdminArticle>): AdminArticle {
  return {
    ...EMPTY, ...a,
    slug: a.slug ?? "", category: a.category ?? "", tags: a.tags ?? "",
    coverImage: a.coverImage ?? "", summary: a.summary ?? "", contentMd: a.contentMd ?? "",
    price: String(a.price ?? "0"),
  };
}

function fmtTime(s: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-ink/15"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export default function ArticlesAdmin() {
  const [data, setData] = useState<PageResult<AdminArticle> | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [kw, setKw] = useState("");
  const [page, setPage] = useState(1);

  const [form, setForm] = useState<AdminArticle | null>(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function load() {
    get<PageResult<AdminArticle>>("/admin/articles", {
      status: status || undefined, q: kw || undefined, page: page - 1, size: 15,
    }).then(setData).catch(() => void 0);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [status, kw, page]);

  async function openEdit(id: number) {
    const a = await get<AdminArticle>(`/admin/articles/${id}`);
    setForm(norm(a));
    setPreview(false);
    setError("");
  }

  async function save(publish?: boolean) {
    if (!form) return;
    setError("");
    setSaving(true);
    try {
      const saved = await post<AdminArticle>("/admin/articles", {
        id: form.id, slug: form.slug.trim() || undefined, title: form.title.trim(),
        category: form.category.trim() || undefined, tags: form.tags.trim() || undefined,
        coverImage: form.coverImage || undefined, summary: form.summary.trim() || undefined,
        contentMd: form.contentMd, price: form.price || "0", pinned: form.pinned,
        status: publish === undefined ? form.status : publish ? "PUBLISHED" : "DRAFT",
      });
      setForm(norm(saved));
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: number) {
    await post(`/admin/articles/${id}/toggle`);
    load();
  }

  async function togglePin(id: number) {
    await post(`/admin/articles/${id}/pin`);
    load();
  }

  async function remove(id: number) {
    if (confirmDel !== id) {
      setConfirmDel(id);
      setTimeout(() => setConfirmDel((c) => (c === id ? null : c)), 2500);
      return;
    }
    setConfirmDel(null);
    await del(`/admin/articles/${id}`);
    load();
  }

  function insertPaywall() {
    if (!form) return;
    const ta = taRef.current;
    const md = form.contentMd;
    if (md.includes(PAYWALL)) {
      setError("正文中已存在付费分割线(全文仅需一条)");
      setTimeout(() => setError(""), 2500);
      return;
    }
    const pos = ta ? ta.selectionStart : md.length;
    const next = `${md.slice(0, pos)}\n\n${PAYWALL}\n\n${md.slice(pos)}`;
    setForm({ ...form, contentMd: next });
    requestAnimationFrame(() => {
      if (ta) {
        ta.focus();
        const at = pos + PAYWALL.length + 4;
        ta.setSelectionRange(at, at);
      }
    });
  }

  const previewHtml = useMemo(() => {
    if (!form || !preview) return "";
    const md = form.contentMd.replace(
      PAYWALL,
      "\n\n---\n\n> 🔒 **付费分割线** — 以上为免费试读,以下内容需购买(" + money(form.price || "0") + ")后可见\n\n---\n\n",
    );
    return renderMarkdown(md);
  }, [form, preview]);

  /* ─────────── 编辑视图 ─────────── */
  if (form) {
    const paid = Number(form.price) > 0;
    return (
      <div className="animate-fade-up">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button className="btn-ghost !px-3.5" onClick={() => setForm(null)}>
            <ArrowLeft size={14} /> 返回列表
          </button>
          <div className="flex items-center gap-2.5">
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              form.status === "PUBLISHED" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
              {form.status === "PUBLISHED" ? "已发布" : "草稿"}
            </span>
            <button className="btn-ghost" disabled={saving} onClick={() => save()}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null} 保存
            </button>
            <button className="btn-primary" disabled={saving || !form.title.trim()}
              onClick={() => save(form.status !== "PUBLISHED")}>
              {form.status === "PUBLISHED" ? "转为草稿" : "保存并发布"}
            </button>
          </div>
        </div>
        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          {/* 左:标题 + 正文编辑器 */}
          <div className="card flex min-h-[70vh] flex-col !p-0">
            <input
              className="border-b border-ink/[0.06] bg-transparent px-6 py-5 text-xl font-extrabold tracking-tight outline-none placeholder:text-ink/25"
              placeholder="文章标题…"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            {/* 工具栏 */}
            <div className="flex flex-wrap items-center gap-2 border-b border-ink/[0.06] px-4 py-2.5">
              <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={insertPaywall} title="光标处插入付费分割线,线以上免费试读">
                <Scissors size={13} /> 插入付费分割线
              </button>
              <span className="text-[11px] text-ink/35">支持 Markdown · 分割线以上为免费试读</span>
              <button className={`ml-auto !px-3 !py-1.5 text-xs ${preview ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setPreview(!preview)}>
                {preview ? <EyeOff size={13} /> : <Eye size={13} />} {preview ? "继续编辑" : "预览"}
              </button>
            </div>
            {preview ? (
              <div className="prose-ka flex-1 overflow-y-auto px-6 py-5" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            ) : (
              <textarea
                ref={taRef}
                className="flex-1 resize-none bg-transparent px-6 py-5 font-mono text-[13px] leading-relaxed outline-none placeholder:text-ink/25"
                placeholder={"# 开始写作…\n\n支持 Markdown 语法:标题、列表、图片、代码块。\n付费文章:把「插入付费分割线」放到试读结束的位置。"}
                value={form.contentMd}
                onChange={(e) => setForm({ ...form, contentMd: e.target.value })}
              />
            )}
          </div>

          {/* 右:发布设置 */}
          <div className="space-y-5">
            <div className="card p-5">
              <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 付费设置</p>
              <label className="label">阅读价格({currencyCode()},0 = 免费)</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink/35">{currencySymbol()}</span>
                <input className="input !pl-9" inputMode="decimal" value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink/40">
                {paid
                  ? form.contentMd.includes(PAYWALL)
                    ? "✓ 已设置试读分割线,线以上免费可见"
                    : "⚠ 未插入付费分割线,未购买者将只能看到摘要"
                  : "当前为免费文章,全文公开"}
              </p>
              <div className="mt-4 flex items-center justify-between rounded-2xl border border-ink/[0.07] bg-ink/[0.02] px-4 py-3">
                <div>
                  <p className="text-sm font-medium">置顶推荐</p>
                  <p className="text-[11px] text-ink/40">列表页排在最前</p>
                </div>
                <Switch on={form.pinned} onChange={(v) => setForm({ ...form, pinned: v })} />
              </div>
            </div>

            <div className="card p-5">
              <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 封面</p>
              <ImageUpload value={form.coverImage} onChange={(url) => setForm({ ...form, coverImage: url })} />
            </div>

            <div className="card p-5">
              <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 展示信息</p>
              <div className="space-y-3.5">
                <div>
                  <label className="label">摘要(列表卡片展示)</label>
                  <textarea className="input min-h-16 text-sm" placeholder="一两句话介绍这篇文章…"
                    value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
                </div>
                <div>
                  <label className="label">分类</label>
                  <input className="input" placeholder="教程 / 公告 / 专栏…"
                    value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </div>
                <div>
                  <label className="label">标签(逗号分隔)</label>
                  <input className="input" placeholder="新手, 支付, USDT"
                    value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
                </div>
                <div>
                  <label className="label">Slug(URL 别名,留空按标题生成)</label>
                  <input className="input font-mono text-xs" placeholder="netflix-礼品卡购买教程"
                    value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
                  <p className="mt-1.5 text-[11px] text-ink/35">建议包含文章关键词;支持中文、英文字母、数字和短横线。</p>
                </div>
              </div>
            </div>

            {form.id && (
              <p className="px-1 text-[11px] text-ink/35">
                阅读 {form.views} · 购买 {form.purchaseCount} · 更新于 {fmtTime(form.updatedAt)}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ─────────── 列表视图 ─────────── */
  const totalPages = data ? Math.max(1, Math.ceil(data.total / 15)) : 1;
  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">媒体文章</h1>
          <p className="mt-1 text-xs text-ink/45">撰写公告、教程和付费内容,支持 Markdown 与试读分割线。</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm({ ...EMPTY }); setPreview(false); setError(""); }}>
          <Plus size={15} /> 撰写文章
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-ink/10 bg-surface p-1 shadow-sm">
          {ARTICLE_STATUS.map((s) => (
            <button key={s.value}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                status === s.value ? "bg-primary text-primary-contrast shadow-sm" : "text-ink/50 hover:text-ink"
              }`}
              onClick={() => { setStatus(s.value); setPage(1); }}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-56">
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
          <input className="input !py-2 !pl-10 text-xs" placeholder="搜索标题…" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setKw(q.trim()), setPage(1))} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead><tr>
            <th className="th">文章</th><th className="th">分类</th><th className="th">价格</th>
            <th className="th">数据</th><th className="th">状态</th><th className="th">更新时间</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {(data?.items ?? []).map((a) => (
              <tr key={String(a.id)} className="hover:bg-ink/[0.02]">
                <td className="td">
                  <div className="flex items-center gap-3">
                    {a.coverImage
                      ? <img src={a.coverImage} alt="" className="h-10 w-14 shrink-0 rounded-lg object-cover" />
                      : <span className="grid h-10 w-14 shrink-0 place-items-center rounded-lg bg-accent-soft"><BookOpen size={15} className="text-primary" /></span>}
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-medium text-ink">
                        {a.pinned && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-primary">
                            <Pin size={10} /> 置顶
                          </span>
                        )}
                        <span className="truncate">{a.title}</span>
                      </p>
                      <p className="truncate font-mono text-[11px] text-ink/35">/{a.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="td text-xs">{a.category || <span className="text-ink/30">-</span>}</td>
                <td className="td font-semibold">{Number(a.price) > 0 ? money(a.price) : <span className="text-ink/40">免费</span>}</td>
                <td className="td text-xs text-ink/50">
                  <span className="inline-flex items-center gap-1"><Eye size={11} /> {a.views}</span>
                  <span className="ml-2 inline-flex items-center gap-1"><ShoppingBag size={11} /> {a.purchaseCount}</span>
                </td>
                <td className="td">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    a.status === "PUBLISHED" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                    {a.status === "PUBLISHED" ? "已发布" : "草稿"}
                  </span>
                </td>
                <td className="td text-xs text-ink/45">{fmtTime(a.updatedAt)}</td>
                <td className="td">
                  <div className="flex justify-end gap-1">
                    <button className="btn-ghost !px-2.5 !py-1.5" title="编辑" onClick={() => a.id && openEdit(a.id)}><Pencil size={13} /></button>
                    <button className={`btn-ghost !px-2.5 !py-1.5 ${a.pinned ? "!border-primary/30 !bg-accent-soft !text-primary" : ""}`}
                      title={a.pinned ? "取消置顶" : "置顶文章"} onClick={() => a.id && togglePin(a.id)}>
                      <Pin size={13} />
                    </button>
                    <button className="btn-ghost !px-2.5 !py-1.5" title={a.status === "PUBLISHED" ? "转草稿" : "发布"}
                      onClick={() => a.id && toggle(a.id)}>
                      {a.status === "PUBLISHED" ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button className={`btn-ghost !px-2.5 !py-1.5 ${confirmDel === a.id ? "!bg-red-500/10 !text-red-500" : ""}`}
                      title={confirmDel === a.id ? "再次点击确认删除" : "删除"} onClick={() => a.id && remove(a.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr><td className="td text-center text-ink/45" colSpan={7}>暂无文章,点击右上角「撰写文章」开始创作</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <button className="btn-ghost !px-3" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button>
          <span className="text-xs text-ink/45">{page} / {totalPages}</span>
          <button className="btn-ghost !px-3" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}
