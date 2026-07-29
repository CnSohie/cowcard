import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookOpen, ChevronLeft, ChevronRight, Eye, Lock, Pin, Search } from "lucide-react";
import { mGet, type ArticleCard, type PageResult } from "../../lib/memberApi";
import { money } from "../../lib/currency";
import { useSeo } from "../../lib/seo";
import { useI18n } from "../../lib/i18n";

/** 文章列表:参考 handsome 主题的卡片流 + 分类筛选 + 搜索。 */

const SIZE = 9;

function fmtDate(s: string | null) {
  if (!s) return "";
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PostsPage() {
  const { copy } = useI18n();
  const t = copy.posts;
  useSeo({
    title: t.title,
    description: t.desc,
    canonical: `${window.location.origin}/posts`,
  });

  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "";
  const kw = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1));

  const [cats, setCats] = useState<string[]>([]);
  const [data, setData] = useState<PageResult<ArticleCard> | null>(null);
  const [input, setInput] = useState(kw);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mGet<string[]>("/posts/categories").then(setCats).catch(() => void 0);
  }, []);

  useEffect(() => {
    setLoading(true);
    mGet<PageResult<ArticleCard>>("/posts", {
      category: category || undefined,
      q: kw || undefined,
      page: page - 1, // 后端 0 基分页
      size: SIZE,
    })
      .then(setData)
      .catch(() => setData({ items: [], total: 0, page: 1, size: SIZE }))
      .finally(() => setLoading(false));
  }, [category, kw, page]);

  function apply(next: { category?: string; q?: string; page?: number }) {
    const p = new URLSearchParams();
    const c = next.category ?? category;
    const q = next.q ?? kw;
    const pg = next.page ?? 1;
    if (c) p.set("category", c);
    if (q) p.set("q", q);
    if (pg > 1) p.set("page", String(pg));
    setParams(p);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / SIZE)) : 1;

  return (
    <div className="animate-fade-up">
      {/* 头部 */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{t.title}</h1>
          <p className="mt-1.5 text-sm text-ink/45">
            {t.desc}{data ? ` · ${t.countPrefix ? `${t.countPrefix} ` : ""}${data.total} ${t.countSuffix}` : ""}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            className="input !rounded-full !pl-11"
            placeholder={t.searchPh}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply({ q: input.trim(), page: 1 })}
          />
        </div>
      </div>

      {/* 分类 */}
      {cats.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button className={category === "" ? "chip-on" : "chip"} onClick={() => apply({ category: "", page: 1 })}>{copy.common.all}</button>
          {cats.map((c) => (
            <button key={c} className={category === c ? "chip-on" : "chip"} onClick={() => apply({ category: c, page: 1 })}>
              {c}
            </button>
          ))}
        </div>
      )}

      {/* 列表 */}
      {loading ? (
        <div className="card grid place-items-center py-24 text-ink/40">{copy.common.loading}</div>
      ) : !data || data.items.length === 0 ? (
        <div className="card grid place-items-center gap-3 py-24 text-ink/40">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft"><BookOpen size={22} className="text-primary" /></span>
          <p className="text-sm">{kw || category ? t.noMatch : t.empty}</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((a) => (
            <Link key={a.id} to={`/posts/${a.slug}`}
              className="card group flex flex-col overflow-hidden !p-0 transition hover:-translate-y-1 hover:shadow-xl">
              {/* 封面 */}
              <div className="relative aspect-video overflow-hidden bg-accent-soft">
                {a.coverImage ? (
                  <img src={a.coverImage} alt="" loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                ) : (
                  <div className="grid h-full w-full place-items-center">
                    <BookOpen size={26} className="text-primary/60" />
                  </div>
                )}
                <div className="absolute left-3 top-3 flex gap-1.5">
                  {a.pinned && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                      <Pin size={10} /> {copy.common.pinned}
                    </span>
                  )}
                  {Number(a.price) > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                      <Lock size={10} /> {copy.common.paid}
                    </span>
                  )}
                </div>
              </div>
              {/* 内容 */}
              <div className="flex flex-1 flex-col p-5">
                {a.category && <span className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary">{a.category}</span>}
                <h2 className="line-clamp-2 font-bold leading-snug text-ink transition group-hover:text-primary">{a.title}</h2>
                {a.summary && <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink/50">{a.summary}</p>}
                <div className="mt-auto flex items-center gap-3 pt-4 text-[11px] text-ink/40">
                  <span>{fmtDate(a.publishedAt)}</span>
                  <span className="inline-flex items-center gap-1"><Eye size={11} /> {a.views}</span>
                  <span className="ml-auto font-bold text-ink">
                    {Number(a.price) > 0 ? money(a.price) : <span className="text-primary">{copy.common.free}</span>}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 分页 */}
      {data && totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <button className="btn-ghost !px-3.5" disabled={page <= 1} onClick={() => apply({ page: page - 1 })}>
            <ChevronLeft size={15} />
          </button>
          <span className="text-sm text-ink/50">{t.page.replace("{page}", String(page)).replace("{total}", String(totalPages))}</span>
          <button className="btn-ghost !px-3.5" disabled={page >= totalPages} onClick={() => apply({ page: page + 1 })}>
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
