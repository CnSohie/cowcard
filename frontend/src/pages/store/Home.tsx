import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Check, Clock3, ImageIcon, KeyRound, Package, Wrench } from "lucide-react";
import { get, type Category, type ProductCard } from "../../lib/api";
import { currencySymbol } from "../../lib/currency";
import { useSeo } from "../../lib/seo";
import { useI18n } from "../../lib/i18n";
import { defaultHeroSlides, localizeHeroSlide, parseHeroSlides, type HeroSlide } from "../../lib/hero";

export default function Home() {
  useSeo();
  const { copy, lang } = useI18n();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>(defaultHeroSlides);

  const visibleHeroSlides = useMemo(() => {
    const enabled = heroSlides.filter((slide) => slide.enabled);
    return enabled.length > 0 ? enabled : defaultHeroSlides();
  }, [heroSlides]);
  const activeHero = visibleHeroSlides[Math.min(heroIndex, visibleHeroSlides.length - 1)];
  const heroCopy = localizeHeroSlide(activeHero, lang);

  useEffect(() => {
    setHeroIndex(0);
  }, [heroSlides, lang]);

  useEffect(() => {
    if (heroPaused || visibleHeroSlides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % visibleHeroSlides.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [heroPaused, visibleHeroSlides.length]);

  useEffect(() => {
    Promise.all([get<Category[]>("/store/categories"), get<ProductCard[]>("/store/products")])
      .then(([c, p]) => {
        setCategories(c);
        setProducts(p);
      })
      .catch(() => void 0)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    get<{ heroSlides?: string }>("/store/site")
      .then((site) => setHeroSlides(parseHeroSlides(site.heroSlides)))
      .catch(() => void 0);
  }, []);

  const filtered = useMemo(
    () => (active === null ? products : products.filter((p) => p.categoryId === active)),
    [products, active],
  );

  return (
    <div className="animate-fade-up">
      {/* Hero:大字排版 + 柠檬绿高亮 */}
      <section
        className={`cow-hero hero-shell hero-layout-${activeHero.layout} hero-tone-${activeHero.tone} relative mb-8 overflow-hidden sm:mb-14`}
        aria-roledescription="carousel"
        onMouseEnter={() => setHeroPaused(true)}
        onMouseLeave={() => setHeroPaused(false)}
        onFocusCapture={() => setHeroPaused(true)}
        onBlurCapture={() => setHeroPaused(false)}
      >
        {activeHero.layout === "image-cover" && activeHero.imageUrl && (
          <img className="hero-cover-image" src={activeHero.imageUrl} alt="" />
        )}
        <div key={heroIndex} className="cow-hero-copy hero-slide relative z-10">
          {heroCopy.eyebrow && <p className="hero-eyebrow">{heroCopy.eyebrow}</p>}
          <h1 className="max-w-4xl text-[1.75rem] font-extrabold leading-[1.1] sm:text-4xl sm:leading-[1.16] md:text-6xl">
            {heroCopy.title}
            {heroCopy.highlight && <span className="cow-highlight mx-1 inline rounded-[0.28em] bg-accent px-[0.08em] leading-[1.18] box-decoration-clone">{heroCopy.highlight}</span>}
          </h1>
          <p className="mt-3 line-clamp-2 max-w-xl text-sm leading-relaxed text-ink/55 sm:mt-5 sm:line-clamp-none sm:text-base">
            {heroCopy.description}
          </p>
          {heroCopy.chips.length > 0 && (
            <div className="hero-chips mt-4 flex gap-2 overflow-x-auto pb-1 sm:mt-6 sm:flex-wrap sm:overflow-visible sm:pb-0">
              {heroCopy.chips.map((chip) => (
                <span key={chip} className="chip shrink-0 whitespace-nowrap"><Check size={12} className="text-primary" /> {chip}</span>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3 sm:mt-6">
            {heroCopy.ctaLabel && activeHero.ctaUrl && <HeroLink url={activeHero.ctaUrl} label={heroCopy.ctaLabel} />}
            <div className="flex items-center gap-2" aria-label={`${heroIndex + 1} / ${visibleHeroSlides.length}`}>
            {visibleHeroSlides.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`${index + 1} / ${visibleHeroSlides.length}`}
                aria-current={index === heroIndex ? "true" : undefined}
                className={`h-2 rounded-full transition-all ${index === heroIndex ? "w-7 bg-primary" : "w-2 bg-ink/20 hover:bg-ink/35"}`}
                onClick={() => setHeroIndex(index)}
              />
            ))}
            </div>
          </div>
        </div>
        <HeroVisual slide={activeHero} lang={lang} />
      </section>

      {/* 分类(带在售件数,参考大型发卡站的透明化设计) */}
      <div id="products" className="mb-7 flex scroll-mt-24 flex-wrap items-center gap-2">
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
            const saleEndAt = p.presaleSaleEndAt ?? p.presaleEndAt;
            const presaleEnded = p.deliveryMode === "PRESALE_VOUCHER" && saleEndAt != null
              && new Date(saleEndAt).getTime() <= Date.now();
            const DeliveryIcon = p.deliveryMode === "PRESALE_VOUCHER" ? Clock3 : p.deliveryMode === "MANUAL" ? Wrench : KeyRound;
            const deliveryLabel = p.deliveryMode === "PRESALE_VOUCHER"
              ? copy.common.presale
              : p.deliveryMode === "MANUAL"
                ? copy.common.manualDelivery
                : copy.common.autoDelivery;
            const stockLabel = presaleEnded
              ? copy.common.presaleEnded
              : p.deliveryMode === "PRESALE_VOUCHER"
                ? copy.common.presale
                : p.deliveryMode === "MANUAL"
                  ? copy.common.manualDelivery
                  : p.stock > 0 ? `${copy.common.stock} ${p.stock}` : copy.common.soldOut;
            return (
            <Link
              key={p.id}
              to={`/product/${p.id}`}
              className="card cow-product-card group flex min-h-[22rem] flex-col overflow-hidden p-0 transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(16,30,23,0.08)]"
              aria-label={`${p.name} ${stockLabel}`}
            >
              <div className="relative aspect-[16/9] overflow-hidden bg-accent-soft/65">
                {p.coverImage ? (
                  <img
                    src={p.coverImage}
                    alt={p.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-accent-soft/80">
                    <div className="grid h-16 w-16 place-items-center rounded-[1.5rem] border border-ink/10 bg-surface/80 text-primary shadow-sm">
                      <ImageIcon size={26} />
                    </div>
                  </div>
                )}
                <span className="absolute left-4 top-4 inline-flex max-w-[calc(100%-2rem)] items-center gap-1.5 rounded-full border border-surface/70 bg-surface/90 px-3 py-1 text-[11px] font-bold text-ink shadow-sm backdrop-blur">
                  <DeliveryIcon size={12} className="text-primary" />
                  <span className="truncate">{deliveryLabel}</span>
                </span>
                <span className={`absolute bottom-4 right-4 rounded-full px-3 py-1 text-[11px] font-bold shadow-sm backdrop-blur ${
                  presaleEnded
                    ? "bg-ink/10 text-ink/45"
                    : p.deliveryMode === "MANUAL" || p.deliveryMode === "PRESALE_VOUCHER" || p.stock > 0
                      ? "bg-primary text-primary-contrast"
                      : "bg-red-50 text-red-500 dark:bg-red-500/10"
                }`}>
                  {stockLabel}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="line-clamp-2 text-lg font-bold leading-snug tracking-tight">{p.name}</h3>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-primary transition group-hover:bg-accent group-hover:text-ink">
                    <ArrowUpRight size={15} />
                  </span>
                </div>
                {p.brief && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink/50">{p.brief}</p>}
                <div className="mt-auto flex items-end justify-between gap-4 pt-6">
                <div>
                  <span className="text-xs text-ink/40">{currencySymbol()}</span>
                  <span className="ml-0.5 text-3xl font-extrabold tracking-tight">{p.price}</span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-ink/[0.04] px-3 py-1.5 text-xs font-bold text-ink/60 transition group-hover:bg-accent-soft group-hover:text-primary">
                  {copy.common.viewDetails}
                  <ArrowRight size={12} />
                </span>
                </div>
              </div>
            </Link>
          );})}
        </div>
      )}
    </div>
  );
}

function HeroLink({ url, label }: { url: string; label: string }) {
  const content = <>{label}<ArrowRight size={14} /></>;
  if (url.startsWith("/")) return <Link className="btn-primary !px-5 !py-2.5" to={url}>{content}</Link>;
  return <a className="btn-primary !px-5 !py-2.5" href={url}
    target={url.startsWith("https://") ? "_blank" : undefined}
    rel={url.startsWith("https://") ? "noreferrer" : undefined}>{content}</a>;
}

function HeroVisual({ slide, lang }: { slide: HeroSlide; lang: "zh" | "en" }) {
  if (slide.layout === "image-cover") return null;
  if (slide.layout === "image-right") {
    return <div className="hero-image-right" aria-hidden="true"><img src={slide.imageUrl} alt="" /></div>;
  }
  if (slide.layout === "payments") {
    return (
      <div className="hero-template-visual hero-payment-visual" aria-hidden="true">
        <span className="hero-payment-card hero-payment-alipay"><b>支</b><i>{lang === "zh" ? "支付宝" : "Alipay"}</i></span>
        <span className="hero-payment-card"><b>$</b><i>USDC</i></span>
        <span className="hero-payment-card"><b>₮</b><i>USDT</i></span>
      </div>
    );
  }
  if (slide.layout === "steps") {
    const steps = lang === "zh" ? ["下单", "支付", "交付"] : ["Order", "Pay", "Receive"];
    return (
      <div className="hero-template-visual hero-step-visual" aria-hidden="true">
        {steps.map((step, index) => <span key={step}><b>{index + 1}</b><i>{step}</i></span>)}
      </div>
    );
  }
  return (
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
  );
}
