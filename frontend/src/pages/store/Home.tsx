import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { get, type Category, type ProductCard } from "../../lib/api";
import { loadSite } from "../../lib/site";
import ProductCatalog from "../../components/ProductCatalog";
import { useStorePageLoading } from "../../components/StoreAvailability";
import { useSeo } from "../../lib/seo";
import { useI18n } from "../../lib/i18n";
import { defaultHeroSlides, localizeHeroSlide, parseHeroSlides, type HeroSlide } from "../../lib/hero";

/**
 * 首页:可选横幅 + 商品目录。
 * - 商家启用多屏时保留轮播(带前后按钮与页码)
 * - 只启用一屏时渲染为静态横幅,不出现任何轮播控件
 * - 全部停用时整个横幅区块不渲染,首页直接从分类开始
 */
export default function Home() {
  useSeo();
  const { lang } = useI18n();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>(() => defaultHeroSlides());
  useStorePageLoading(loading);
  const error = failed ? (lang === "zh" ? "商品加载失败,请重试。" : "Could not load products. Please retry.") : "";

  const banners = useMemo(() => heroSlides.filter((slide) => slide.enabled), [heroSlides]);
  const bannerKey = banners.map((slide) => slide.id).join("|");
  const animated = banners.length > 1;
  const banner = banners[Math.min(bannerIndex, Math.max(0, banners.length - 1))];

  useEffect(() => {
    if (!animated) return;
    const count = bannerKey.split("|").length;
    const timer = window.setInterval(() => setBannerIndex((index) => (index + 1) % count), 7_000);
    return () => window.clearInterval(timer);
  }, [animated, bannerKey]);

  useEffect(() => {
    setBannerIndex(0);
  }, [heroSlides, lang]);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setFailed(false);
    Promise.all([get<Category[]>("/store/categories"), get<ProductCard[]>("/store/products")])
      .then(([c, p]) => {
        if (disposed) return;
        setCategories(c);
        setProducts(p);
      })
      .catch(() => { if (!disposed) setFailed(true); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [reload]);

  useEffect(() => {
    loadSite()
      .then((site) => setHeroSlides(parseHeroSlides(site.heroSlides)))
      .catch(() => void 0);
  }, []);

  return (
    <div className="store-home animate-fade-up">
      {banner && (
        <section className={`store-hero hero-tone-${banner.tone}${animated ? " is-carousel" : " is-static"}`}
          aria-label={animated ? (lang === "zh" ? "商店横幅,可切换" : "Store banner carousel") : undefined}
          aria-roledescription={animated ? "carousel" : undefined}
          onKeyDown={animated ? (event) => {
            if (event.key === "ArrowLeft") setBannerIndex((index) => (index - 1 + banners.length) % banners.length);
            if (event.key === "ArrowRight") setBannerIndex((index) => (index + 1) % banners.length);
          } : undefined}>
          <div className="hero-copy-stack">
            {banners.map((slide, index) => {
              const active = index === bannerIndex;
              const copy = localizeHeroSlide(slide, lang);
              return (
                <div key={slide.id} className="hero-slide" aria-hidden={!active}
                  style={{ visibility: active ? "visible" : "hidden" }}>
                  {copy.eyebrow && <p className="hero-eyebrow">{copy.eyebrow}</p>}
                  <h1 className="hero-title">
                    {copy.title}
                    {copy.highlight && <span className="hero-highlight">{copy.highlight}</span>}
                  </h1>
                  <p className="hero-description">{copy.description}</p>
                  {copy.ctaLabel && slide.ctaUrl && <HeroAction url={slide.ctaUrl} label={copy.ctaLabel} />}
                </div>
              );
            })}
          </div>
          <HeroVisual slide={banner} lang={lang} />
          {animated && (
            <div className="hero-controls" role="group" aria-label={lang === "zh" ? "横幅切换" : "Banner navigation"}>
              <div className="hero-pagination">
                {banners.map((slide, index) => (
                  <button key={slide.id} type="button"
                    aria-label={lang === "zh" ? `第 ${index + 1} 屏` : `Slide ${index + 1}`}
                    aria-current={index === bannerIndex ? "true" : undefined}
                    className={`hero-dot${index === bannerIndex ? " is-active" : ""}`}
                    onClick={() => setBannerIndex(index)} />
                ))}
              </div>
              <div className="hero-navigation">
                <span className="hero-progress" aria-hidden="true">{bannerIndex + 1} / {banners.length}</span>
                <button type="button" className="hero-arrow" aria-label={lang === "zh" ? "上一张" : "Previous slide"}
                  onClick={() => setBannerIndex((index) => (index - 1 + banners.length) % banners.length)}><ChevronLeft size={16} /></button>
                <button type="button" className="hero-arrow" aria-label={lang === "zh" ? "下一张" : "Next slide"}
                  onClick={() => setBannerIndex((index) => (index + 1) % banners.length)}><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </section>
      )}

      <ProductCatalog products={products} categories={categories} loading={loading} error={error} onRetry={() => setReload((v) => v + 1)} />
    </div>
  );
}

/** 横幅按钮:站内锚点做平滑滚动,站内路由走 Link,外链新窗口打开。 */
function HeroAction({ url, label }: { url: string; label: string }) {
  const content = <>{label}<ArrowRight size={15} /></>;
  if (url.startsWith("#")) {
    return <button type="button" className="btn-primary hero-cta" onClick={() => document.getElementById(url.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" })}>{content}</button>;
  }
  if (url.startsWith("/")) return <Link className="btn-primary hero-cta" to={url}>{content}</Link>;
  return <a className="btn-primary hero-cta" href={url}
    target={url.startsWith("https://") ? "_blank" : undefined}
    rel={url.startsWith("https://") ? "noreferrer" : undefined}>{content}</a>;
}

/** 横幅配图:自定义图片优先,否则按版式使用内置的主题插画。 */
function HeroVisual({ slide, lang }: { slide: HeroSlide; lang: "zh" | "en" }) {
  if (slide.imageUrl) {
    return <div className={`hero-media hero-media-${slide.layout}`} aria-hidden="true"><img src={slide.imageUrl} alt="" /></div>;
  }
  if (slide.layout === "image-cover" || slide.layout === "image-right") return null;
  if (slide.layout === "payments") {
    return (
      <div className="hero-media hero-payment-visual" aria-hidden="true">
        <span className="hero-payment-card hero-payment-alipay"><b>支</b><i>{lang === "zh" ? "支付宝" : "Alipay"}</i></span>
        <span className="hero-payment-card"><b>$</b><i>USDC</i></span>
        <span className="hero-payment-card"><b>₮</b><i>USDT</i></span>
      </div>
    );
  }
  if (slide.layout === "steps") {
    const steps = lang === "zh" ? ["下单", "支付", "交付"] : ["Order", "Pay", "Receive"];
    return (
      <div className="hero-media hero-step-visual" aria-hidden="true">
        {steps.map((step, index) => <span key={step}><b>{index + 1}</b><i>{step}</i></span>)}
      </div>
    );
  }
  return <div className="hero-media hero-orbit" aria-hidden="true"><span /><span /><span /></div>;
}
