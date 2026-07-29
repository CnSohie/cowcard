import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Package, ShieldCheck, Timer, Wallet } from "lucide-react";
import { get, type Category, type ProductCard } from "../../lib/api";
import { currencySymbol } from "../../lib/currency";
import { useSeo } from "../../lib/seo";
import { useI18n } from "../../lib/i18n";

export default function Home() {
  useSeo();
  const { copy } = useI18n();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([get<Category[]>("/store/categories"), get<ProductCard[]>("/store/products")])
      .then(([c, p]) => {
        setCategories(c);
        setProducts(p);
      })
      .catch(() => void 0)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => (active === null ? products : products.filter((p) => p.categoryId === active)),
    [products, active],
  );

  return (
    <div className="animate-fade-up">
      {/* Hero:大字排版 + 柠檬绿高亮 */}
      <section className="cow-hero relative mb-14 overflow-hidden pt-6">
        <div className="cow-hero-copy relative z-10">
          <h1 className="max-w-4xl text-4xl font-extrabold leading-[1.16] md:text-6xl">
            {copy.home.titleA}
            <span className="cow-highlight mx-1 inline rounded-[0.28em] bg-accent px-[0.08em] leading-[1.18] box-decoration-clone">
              {copy.home.titleB}
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink/55">
            {copy.home.subtitle}
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <span className="chip"><Timer size={13} className="text-primary" /> {copy.home.chips[0]}</span>
            <span className="chip"><Wallet size={13} className="text-primary" /> {copy.home.chips[1]}</span>
            <span className="chip"><Wallet size={13} className="text-primary" /> {copy.home.chips[2]}</span>
            <span className="chip"><ShieldCheck size={13} className="text-primary" /> {copy.home.chips[3]}</span>
          </div>
        </div>
        <div className="cow-hero-friends" aria-hidden="true">
          <span className="cow-friend cow-friend-main"><i /><b /></span>
          <span className="cow-friend cow-friend-calf"><i /><b /></span>
          <span className="cow-friend cow-friend-bird"><i /><b /></span>
          <span className="cow-friend cow-friend-sheep"><i /><b /></span>
          <span className="cow-friend cow-friend-butterfly"><i /><b /></span>
          <span className="cow-friend cow-friend-grass cow-friend-grass-a" />
          <span className="cow-friend cow-friend-grass cow-friend-grass-b" />
          <span className="cow-friend cow-friend-flower cow-friend-flower-a" />
          <span className="cow-friend cow-friend-flower cow-friend-flower-b" />
        </div>
      </section>

      {/* 分类(带在售件数,参考大型发卡站的透明化设计) */}
      <div className="mb-7 flex flex-wrap items-center gap-2">
        <button onClick={() => setActive(null)} className={`chip !py-2 ${active === null ? "chip-on" : ""}`}>
          {copy.common.all}{products.length > 0 && <span className="ml-1 text-[10px] opacity-60">{products.length}</span>}
        </button>
        {categories.map((c) => {
          const n = products.filter((p) => p.categoryId === c.id).length;
          return (
            <button key={c.id} onClick={() => setActive(c.id)} className={`chip !py-2 ${active === c.id ? "chip-on" : ""}`}>
              {c.name}{n > 0 && <span className="ml-1 text-[10px] opacity-60">{n}</span>}
            </button>
          );
        })}
      </div>

      {/* 商品 */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-48 animate-pulse bg-ink/[0.03]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card grid place-items-center py-24 text-ink/40">
          <Package className="mb-3 opacity-40" size={40} />
          {copy.common.emptyProducts}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const presaleEnded = p.deliveryMode === "PRESALE_VOUCHER" && p.presaleEndAt != null
              && new Date(p.presaleEndAt).getTime() <= Date.now();
            return (
            <Link
              key={p.id}
              to={`/product/${p.id}`}
              className="card cow-product-card group flex flex-col p-6 transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(16,30,23,0.08)]"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold leading-snug tracking-tight">{p.name}</h3>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-primary transition group-hover:bg-accent group-hover:text-ink">
                  <ArrowUpRight size={15} />
                </span>
              </div>
              {p.brief && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink/50">{p.brief}</p>}
              <div className="mt-auto flex items-end justify-between pt-6">
                <div>
                  <span className="text-xs text-ink/40">{currencySymbol()}</span>
                  <span className="ml-0.5 text-3xl font-extrabold tracking-tight">{p.price}</span>
                </div>
                <span className={`text-xs font-medium ${presaleEnded ? "text-ink/40" : p.deliveryMode === "MANUAL" || p.deliveryMode === "PRESALE_VOUCHER" || p.stock > 0 ? "text-primary" : "text-red-500"}`}>
                  {presaleEnded
                    ? copy.common.presaleEnded
                    : p.deliveryMode === "PRESALE_VOUCHER"
                    ? copy.common.presale
                    : p.deliveryMode === "MANUAL" ? copy.common.manualDelivery : p.stock > 0 ? `${copy.common.stock} ${p.stock}` : copy.common.soldOut}
                </span>
              </div>
            </Link>
          );})}
        </div>
      )}
    </div>
  );
}
