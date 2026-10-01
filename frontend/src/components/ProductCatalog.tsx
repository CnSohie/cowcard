import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Check, Grid2X2, ArrowDownUp, Package, Search, X } from "lucide-react";
import type { Category, ProductCard } from "../lib/api";
import CatalogSelect from "./CatalogSelect";
import ProductImage from "./ProductImage";
import { currencySymbol } from "../lib/currency";
import { useI18n } from "../lib/i18n";

function saleEnded(product: ProductCard, now: number) {
  const end = product.presaleSaleEndAt ?? product.presaleEndAt;
  return product.deliveryMode === "PRESALE_VOUCHER" && !!end && Date.parse(end) <= now;
}
function available(product: ProductCard, now: number) {
  const priceCents = Math.round(Number(product.price) * 100);
  const minimumCents = Math.round(Number(product.minOrderAmount || 0) * 100);
  const minimumQuantity = Math.max(1, product.minBuy || 1, priceCents > 0 ? Math.ceil(minimumCents / priceCents) : 1);
  return !saleEnded(product, now) && minimumQuantity <= product.maxBuy
    && (product.deliveryMode !== "AUTO_CARD" || product.stock >= minimumQuantity);
}
const PAGE_SIZES = [12, 24, 48];

export default function ProductCatalog({ products, categories, loading, error, onRetry }: {
  products: ProductCard[]; categories: Category[]; loading: boolean; error: string; onRetry: () => void;
}) {
  const { lang, copy } = useI18n();
  const zh = lang === "zh";
  const [params, setParams] = useSearchParams();
  const section = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const restoredPosition = useRef(false);
  useEffect(() => {
    if (loading || error || restoredPosition.current) return;
    restoredPosition.current = true;
    if (params.has("page") || window.location.hash === "#products") {
      section.current?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [loading, error, params]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const category = params.get("category") ?? "";
  const query = params.get("q") ?? "";
  const inStock = params.get("available") === "1";
  const sort = ["price-asc", "price-desc", "name"].includes(params.get("sort") ?? "") ? params.get("sort")! : "default";
  const requestedSize = Number(params.get("size"));
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 12;
  const requestedPage = Number(params.get("page"));
  const categoryCounts = useMemo(() => {
    const counts = new Map<number, number>();
    products.forEach((p) => counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1));
    return counts;
  }, [products]);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const result = products.filter((p) => (!category || String(p.categoryId) === category)
      && `${p.name} ${p.brief ?? ""}`.toLocaleLowerCase().includes(term)
      && (!inStock || available(p, now)));
    if (sort === "price-asc") result.sort((a, b) => Number(a.price) - Number(b.price));
    if (sort === "price-desc") result.sort((a, b) => Number(b.price) - Number(a.price));
    if (sort === "name") result.sort((a, b) => a.name.localeCompare(b.name, lang));
    return result;
  }, [products, category, query, inStock, sort, lang, now]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pageCount, Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
  const start = (page - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const categoryName = categories.find((c) => String(c.id) === category)?.name;
  const hasFilters = !!category || !!query || inStock;
  const update = (key: string, value: string) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    next.delete("page");
    if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true });
  const clearFilters = () => setParams((previous) => {
    const next = new URLSearchParams(previous);
    ["category", "q", "available", "page"].forEach((key) => next.delete(key));
    return next;
  }, { replace: true });
  const goToPage = (nextPage: number) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (nextPage === 1) next.delete("page"); else next.set("page", String(nextPage));
      return next;
    });
    heading.current?.focus({ preventScroll: true });
    section.current?.scrollIntoView({ block: "start", behavior: "instant" });
  };
  const pageNumbers = [...new Set([1, pageCount, page - 1, page, page + 1])]
    .filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);

  return (
    <section id="products" ref={section} className="catalog-section" aria-label={zh ? "商品目录" : "Product catalog"}>
      <aside className="catalog-sidebar" aria-label={zh ? "商品分类" : "Product categories"}>
        <p className="mb-3 px-3 text-xs font-semibold text-ink/50">{zh ? "商品分类" : "Categories"}</p>
        <nav className="catalog-category-list">
          <button className={`catalog-category ${!category ? "catalog-category-active" : ""}`} aria-pressed={!category} onClick={() => update("category", "")}>
            <span className="flex items-center gap-2"><Grid2X2 size={15} />{copy.common.all}</span><span className="category-count">{products.length}</span>
          </button>
          {categories.map((c) => <button key={c.id} title={c.name} className={`catalog-category ${category === String(c.id) ? "catalog-category-active" : ""}`}
            aria-pressed={category === String(c.id)} onClick={() => update("category", String(c.id))}>
            <span className="flex min-w-0 items-center gap-2"><span className="category-dot">{category === String(c.id) ? <Check size={11} /> : <span />}</span><span className="line-clamp-2">{c.name}</span></span><span className="category-count">{categoryCounts.get(c.id) ?? 0}</span>
          </button>)}
        </nav>
      </aside>
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 ref={heading} tabIndex={-1} className="break-words text-xl font-bold outline-none">{categoryName || (zh ? "全部商品" : "Browse products")}</h2>
            <p className="mt-1 text-xs text-ink/55" role="status">
              {loading ? copy.common.loading : error ? (zh ? "暂时无法加载" : "Unable to load") : zh
                ? `共 ${filtered.length} 件${filtered.length ? ` · 当前 ${start + 1}–${Math.min(start + pageSize, filtered.length)} 件` : ""}`
                : `${filtered.length} products${filtered.length ? ` · ${start + 1}–${Math.min(start + pageSize, filtered.length)} shown` : ""}`}
            </p>
          </div>
          <div className="catalog-size-control">
            <span>{zh ? "每页" : "Per page"}</span>
            <CatalogSelect label={zh ? "每页商品数量" : "Products per page"} value={String(pageSize)}
              className="catalog-dropdown-size" options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(value) => update("size", value)} />
          </div>
        </div>
        <div className="catalog-toolbar">
          <div className="relative min-w-0" role="search">
            <Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-ink/40" />
            <input type="search" className="input !rounded-xl !py-2.5 !pl-9 !pr-10" aria-label={zh ? "搜索商品" : "Search products"}
              placeholder={zh ? "搜索名称或关键词" : "Search products"} value={query} onChange={(e) => update("q", e.target.value)} />
            {query && <button aria-label={zh ? "清空搜索" : "Clear search"} onClick={() => update("q", "")} className="absolute right-0 top-0 grid h-11 w-10 place-items-center text-ink/50"><X size={15} /></button>}
          </div>
          <CatalogSelect className="lg:hidden" label={zh ? "商品分类" : "Product category"} value={category}
            icon={<Grid2X2 size={16} aria-hidden="true" className="shrink-0" />}
            options={[{ value: "", label: `${zh ? "全部分类" : "All categories"} (${products.length})` },
              ...categories.map((c) => ({ value: String(c.id), label: `${c.name} (${categoryCounts.get(c.id) ?? 0})` }))]}
            onChange={(value) => update("category", value)} />
          <CatalogSelect label={zh ? "商品排序" : "Sort products"} value={sort}
            icon={<ArrowDownUp size={16} aria-hidden="true" className="shrink-0" />}
            options={[{ value: "default", label: zh ? "默认排序" : "Default order" },
              { value: "price-asc", label: zh ? "价格从低到高" : "Price: low to high" },
              { value: "price-desc", label: zh ? "价格从高到低" : "Price: high to low" },
              { value: "name", label: zh ? "名称排序" : "Name" }]}
            onChange={(value) => update("sort", value === "default" ? "" : value)} />
        </div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <label className={`catalog-availability ${inStock ? "is-selected" : ""}`}>
            <input type="checkbox" checked={inStock} onChange={(e) => update("available", e.target.checked ? "1" : "")} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            <span className="catalog-switch" aria-hidden="true"><span /></span>
            {zh ? "仅看可购买" : "Available to buy"}
          </label>
          {hasFilters && <button onClick={clearFilters} className="inline-flex min-h-10 items-center gap-1 text-ink/55 hover:text-primary"><X size={13} />{zh ? "清除筛选" : "Clear filters"}</button>}
        </div>
        {error ? <div className="card p-10 text-center" role="alert"><p className="mb-4 text-sm text-ink/60">{error}</p><button className="btn-ghost" onClick={onRetry}>{zh ? "重新加载" : "Retry"}</button></div>
          : loading ? <div className="catalog-grid" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <div key={i} className="card h-52 animate-pulse bg-ink/[0.03]" />)}</div>
          : !filtered.length ? <div className="card flex flex-col items-center px-5 py-16 text-center text-sm text-ink/55">
            <Package className="mb-3 text-ink/30" size={32} />
            <p>{hasFilters ? (zh ? "没有找到匹配的商品" : "No matching products") : copy.common.emptyProducts}</p>
            {hasFilters && <button className="btn-ghost mt-4" onClick={clearFilters}>{zh ? "查看全部商品" : "Show all products"}</button>}
          </div>
          : <div className="catalog-grid">{visible.map((product) => <CatalogCard key={product.id} product={product} now={now} />)}</div>}
        {!loading && !error && filtered.length > 0 && (
          <nav aria-label={zh ? "商品分页" : "Product pages"} className="catalog-pagination">
            <button className="catalog-page" disabled={page === 1} onClick={() => goToPage(page - 1)} aria-label={zh ? "上一页" : "Previous page"}><ChevronLeft size={16} /></button>
            {pageNumbers.map((n, i) => <span key={n} className="inline-flex items-center gap-1">
              {i > 0 && n - pageNumbers[i - 1] > 1 && <span className="px-1 text-ink/40">…</span>}
              <button className={`catalog-page ${page === n ? "!border-primary !bg-primary !text-primary-contrast" : ""}`} aria-current={page === n ? "page" : undefined}
                aria-label={zh ? `第 ${n} 页` : `Page ${n}`} onClick={() => goToPage(n)}>{n}</button>
            </span>)}
            <button className="catalog-page" disabled={page === pageCount} onClick={() => goToPage(page + 1)} aria-label={zh ? "下一页" : "Next page"}><ChevronRight size={16} /></button>
          </nav>
        )}
      </div>
    </section>
  );
}

function CatalogCard({ product: p, now }: { product: ProductCard; now: number }) {
  const { copy, lang } = useI18n();
  const ended = saleEnded(p, now);
  const canBuy = available(p, now);
  const delivery = p.deliveryMode === "PRESALE_VOUCHER" ? copy.common.presale
    : p.deliveryMode === "MANUAL" ? copy.common.manualDelivery : copy.common.autoDelivery;
  const stock = ended ? copy.common.presaleEnded : p.deliveryMode === "AUTO_CARD"
    ? p.stock > 0 ? `${copy.common.stock} ${p.stock}` : copy.common.soldOut : delivery;
  return (
    <Link to={`/product/${p.id}`} className="card cow-product-card catalog-product group" aria-label={`${p.name} ${stock}`}>
      <div className="catalog-product-heading">
        <ProductImage name={p.name} coverImage={p.coverImage} className="catalog-thumbnail" />
        <h3 className="catalog-product-title" title={p.name}>{p.name}</h3>
      </div>
      <p className="catalog-product-description">{p.brief || "\u00a0"}</p>
      <div className="flex min-h-5 min-w-0 items-center gap-2 text-[11px]">
        <span className={canBuy ? "text-primary" : "text-ink/45"}>{stock}</span>
        {p.deliveryMode === "AUTO_CARD" && <><span className="text-ink/20">·</span><span className="text-ink/55">{delivery}</span></>}
      </div>
      {p.soldQuantity != null && <p className="mt-2 text-xs text-ink/55">{lang === "zh" ? `已售 ${p.soldQuantity.toLocaleString()} 件` : `${p.soldQuantity.toLocaleString()} sold`}</p>}
      <div className="catalog-product-footer">
        <span className="min-w-0 break-all font-semibold tabular-nums tracking-tight text-ink"><span className="mr-0.5 text-xs font-normal text-ink/50">{currencySymbol()}</span><span className="text-xl">{p.price}</span></span>
        <span className="catalog-card-action">{copy.common.viewDetails}<ArrowRight size={13} /></span>
      </div>
    </Link>
  );
}
