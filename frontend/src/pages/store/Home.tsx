import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Sparkles, Heart, ChevronLeft, ChevronRight } from "lucide-react";
import { get, type Category, type ProductCard } from "../../lib/api";
import { loadSite } from "../../lib/site";
import ProductCatalog from "../../components/ProductCatalog";
import { useSeo } from "../../lib/seo";
import { useI18n } from "../../lib/i18n";
import { defaultHeroSlides, localizeHeroSlide, parseHeroSlides, type HeroSlide } from "../../lib/hero";

export default function Home() {
  useSeo();
  const { lang } = useI18n();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>(defaultHeroSlides);

  const visibleHeroSlides = useMemo(() => {
    const enabled = heroSlides.filter((slide) => slide.enabled);
    return enabled.length > 0 ? enabled : defaultHeroSlides();
  }, [heroSlides]);
  const activeHero = visibleHeroSlides[Math.min(heroIndex, visibleHeroSlides.length - 1)];


  useEffect(() => {
    setHeroIndex(0);
  }, [heroSlides, lang]);

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([get<Category[]>("/store/categories"), get<ProductCard[]>("/store/products")])
      .then(([c, p]) => {
        setCategories(c);
        setProducts(p);
      })
      .catch(() => setError(lang === "zh" ? "商品加载失败，请重试。" : "Could not load products. Please retry."))
      .finally(() => setLoading(false));
  }, [reload]);

  useEffect(() => {
    loadSite()
      .then((site) => setHeroSlides(parseHeroSlides(site.heroSlides)))
      .catch(() => void 0);
  }, []);

  return (
    <div className="animate-fade-up">
      {/* Hero:大字排版 + 柠檬绿高亮 */}
      <section
        className={`store-hero ${activeHero.layout === "illustration" ? "cow-hero" : ""} hero-shell hero-layout-${activeHero.layout} hero-tone-${activeHero.tone} relative mb-8 overflow-hidden`}
        aria-roledescription="carousel"
      >
        {activeHero.layout === "image-cover" && activeHero.imageUrl && (
          <img className="hero-cover-image" src={activeHero.imageUrl} alt="" />
        )}
        <div className="hero-copy-stack">
        {visibleHeroSlides.map((slide, index) => {
          const heroCopy = localizeHeroSlide(slide, lang);
          return <div key={slide.id} aria-hidden={index !== heroIndex} style={{ visibility: index === heroIndex ? "visible" : "hidden" }} className="cow-hero-copy hero-slide relative z-10">
          {heroCopy.eyebrow && <p className="hero-eyebrow">{heroCopy.eyebrow}</p>}
          <h1 className="max-w-4xl text-2xl font-bold leading-tight sm:text-4xl">
            {heroCopy.title}
            {heroCopy.highlight && <span className="cow-highlight ml-1 rounded-lg bg-accent px-1 text-ink dark:bg-primary dark:text-primary-contrast">{heroCopy.highlight}</span>}
          </h1>
          <p className="mt-3 line-clamp-2 max-w-xl text-sm leading-relaxed text-ink/55 sm:mt-5 sm:line-clamp-none sm:text-[1rem]">
            {heroCopy.description}
          </p>
          {heroCopy.chips.length > 0 && (
            <div className="hero-chips mt-4 hidden gap-2 sm:flex overflow-x-auto pb-1 sm:mt-6 sm:flex-wrap sm:overflow-visible sm:pb-0">
              {heroCopy.chips.map((chip) => (
                <span key={chip} className="chip shrink-0 whitespace-nowrap"><Check size={12} className="text-primary" /> {chip}</span>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3 sm:mt-6">
            {heroCopy.ctaLabel && slide.ctaUrl && <HeroLink url={slide.ctaUrl} label={heroCopy.ctaLabel} />}
          </div>
        </div>;
        })}
        </div>
            <div className="hero-controls" aria-label={`${heroIndex + 1} / ${visibleHeroSlides.length}`}>
            {visibleHeroSlides.length > 1 && <button type="button" aria-label={lang === "zh" ? "上一张" : "Previous slide"}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/60 transition hover:bg-ink/5 focus-visible:outline-primary"
              onClick={() => setHeroIndex((i) => (i - 1 + visibleHeroSlides.length) % visibleHeroSlides.length)}><ChevronLeft size={16} /></button>}
            {visibleHeroSlides.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`${index + 1} / ${visibleHeroSlides.length}`}
                aria-current={index === heroIndex ? "true" : undefined}
                className={`grid h-9 w-9 place-items-center rounded-full text-xs tabular-nums ${index === heroIndex ? "bg-primary text-primary-contrast" : "text-ink/50 hover:bg-ink/5"}`}
                onClick={() => setHeroIndex(index)}
              >{index + 1}</button>
            ))}
            {visibleHeroSlides.length > 1 && <button type="button" aria-label={lang === "zh" ? "下一张" : "Next slide"}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/60 transition hover:bg-ink/5 focus-visible:outline-primary"
              onClick={() => setHeroIndex((i) => (i + 1) % visibleHeroSlides.length)}><ChevronRight size={16} /></button>}
            </div>
        <HeroVisual slide={activeHero} lang={lang} />
      </section>

      <ProductCatalog products={products} categories={categories} loading={loading} error={error} onRetry={() => setReload((v) => v + 1)} />
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
    <div aria-hidden="true">
      <div className="store-mascot">
        <span className="mascot-spark"><Sparkles size={28} /></span>
        <span className="mascot-ticket"><Heart size={20} /><i /><i /></span>
        <span className="mascot-parcel"><span className="mascot-ribbon" /><span className="mascot-eyes" /><span className="mascot-smile" /></span>
        <span className="mascot-shadow" />
      </div>
      <div className="cow-hero-friends">
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
    </div>
  );
}
