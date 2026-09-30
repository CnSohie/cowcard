import type { Lang } from "./i18n";

export type HeroLayout = "illustration" | "payments" | "steps" | "image-right" | "image-cover";
export type HeroTone = "accent" | "primary" | "soft";

export interface HeroSlide {
  id: string;
  enabled: boolean;
  layout: HeroLayout;
  tone: HeroTone;
  eyebrowZh: string;
  eyebrowEn: string;
  titleZh: string;
  titleEn: string;
  highlightZh: string;
  highlightEn: string;
  descriptionZh: string;
  descriptionEn: string;
  chipsZh: string[];
  chipsEn: string[];
  ctaLabelZh: string;
  ctaLabelEn: string;
  ctaUrl: string;
  imageUrl: string;
}

export const HERO_LAYOUTS: { value: HeroLayout; label: string; note: string }[] = [
  { value: "illustration", label: "商店导览", note: "文案搭配查单与兑换入口" },
  { value: "payments", label: "支付卡片", note: "展示支付宝与数字货币支付卡片" },
  { value: "steps", label: "购买流程", note: "展示下单、支付、交付流程" },
  { value: "image-right", label: "右侧图片", note: "文案在左，上传图片在右" },
  { value: "image-cover", label: "背景大图", note: "图片铺满整屏，文案浮在上方" },
];

export const HERO_TONES: { value: HeroTone; label: string }[] = [
  { value: "accent", label: "活力强调" },
  { value: "primary", label: "品牌主色" },
  { value: "soft", label: "安静柔和" },
];

const DEFAULT_SLIDES: HeroSlide[] = [
  {
    id: "instant-delivery", enabled: true, layout: "illustration", tone: "accent",
    eyebrowZh: "数字商品商店", eyebrowEn: "Digital goods store",
    titleZh: "选好所需，", titleEn: "Find your next",
    highlightZh: "即刻下单。", highlightEn: "digital essential.",
    descriptionZh: "无需注册，填写邮箱即可购买。交付方式与使用说明，请查看商品详情。",
    descriptionEn: "Shop with your email, no account needed. See each product for delivery details and instructions.",
    chipsZh: [], chipsEn: [],
    ctaLabelZh: "开始选购", ctaLabelEn: "Shop now", ctaUrl: "#products", imageUrl: "",
  },
  {
    id: "payment-options", enabled: true, layout: "payments", tone: "primary",
    eyebrowZh: "灵活支付", eyebrowEn: "Flexible payments",
    titleZh: "支付宝与数字货币,", titleEn: "Alipay and crypto,",
    highlightZh: "都能轻松支付", highlightEn: "both supported",
    descriptionZh: "支持支付宝、USDC 和 USDT。",
    descriptionEn: "Pay with Alipay, USDC or USDT.",
    chipsZh: ["支付宝扫码", "USDC", "USDT"], chipsEn: ["Alipay QR", "USDC", "USDT"],
    ctaLabelZh: "", ctaLabelEn: "", ctaUrl: "", imageUrl: "",
  },
  {
    id: "traceable-order", enabled: true, layout: "steps", tone: "soft",
    eyebrowZh: "订单查询", eyebrowEn: "Your orders",
    titleZh: "购买记录，", titleEn: "Your purchases,",
    highlightZh: "随时查看", highlightEn: "in one place",
    descriptionZh: "保存订单号即可查询交付状态,遇到问题还能继续提交售后服务。",
    descriptionEn: "View recent orders, payment status and delivered codes.",
    chipsZh: ["订单状态", "交付记录", "售后服务"], chipsEn: ["Order status", "Delivery record", "Support"],
    ctaLabelZh: "查询订单", ctaLabelEn: "Track order", ctaUrl: "/order", imageUrl: "",
  },
];

export function defaultHeroSlides(): HeroSlide[] {
  return DEFAULT_SLIDES.map((slide) => ({ ...slide, chipsZh: [...slide.chipsZh], chipsEn: [...slide.chipsEn] }));
}

export function newHeroSlide(): HeroSlide {
  return {
    ...defaultHeroSlides()[0],
    id: `hero-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    eyebrowZh: "新内容", eyebrowEn: "New",
    titleZh: "填写这一屏的主题", titleEn: "Your new headline",
    highlightZh: "突出重点", highlightEn: "Highlight",
    descriptionZh: "用一两句话说明活动、商品或服务。", descriptionEn: "Describe this campaign, product or service.",
    chipsZh: [], chipsEn: [], ctaLabelZh: "", ctaLabelEn: "", ctaUrl: "", imageUrl: "",
  };
}

export function parseHeroSlides(raw?: string | null): HeroSlide[] {
  if (!raw?.trim()) return defaultHeroSlides();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultHeroSlides();
    return parsed.map((item, index) => normalizeSlide(item, index)).slice(0, 6);
  } catch {
    return defaultHeroSlides();
  }
}

export function serializeHeroSlides(slides: HeroSlide[]): string {
  return JSON.stringify(slides);
}

function normalizeSlide(value: unknown, index: number): HeroSlide {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const fallback = defaultHeroSlides()[index % DEFAULT_SLIDES.length];
  const str = (key: keyof HeroSlide) => typeof item[key] === "string" ? item[key] as string : fallback[key] as string;
  const list = (key: "chipsZh" | "chipsEn") => Array.isArray(item[key])
    ? (item[key] as unknown[]).filter((v): v is string => typeof v === "string").slice(0, 4)
    : [...fallback[key]];
  const layout = HERO_LAYOUTS.some((o) => o.value === item.layout) ? item.layout as HeroLayout : fallback.layout;
  const tone = HERO_TONES.some((o) => o.value === item.tone) ? item.tone as HeroTone : fallback.tone;
  return {
    id: str("id") || `hero-${index}`,
    enabled: typeof item.enabled === "boolean" ? item.enabled : true,
    layout, tone,
    eyebrowZh: str("eyebrowZh"), eyebrowEn: str("eyebrowEn"),
    titleZh: str("titleZh"), titleEn: str("titleEn"),
    highlightZh: str("highlightZh"), highlightEn: str("highlightEn"),
    descriptionZh: str("descriptionZh"), descriptionEn: str("descriptionEn"),
    chipsZh: list("chipsZh"), chipsEn: list("chipsEn"),
    ctaLabelZh: str("ctaLabelZh"), ctaLabelEn: str("ctaLabelEn"),
    ctaUrl: safeUrl(str("ctaUrl"), false), imageUrl: safeUrl(str("imageUrl"), true),
  };
}

function safeUrl(value: string, image: boolean): string {
  const url = value.trim();
  if (!url) return "";
  if (!image && /^#[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return !image || url.startsWith("/files/") ? url : "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? url : "";
  } catch {
    return "";
  }
}

export function localizeHeroSlide(slide: HeroSlide, lang: Lang) {
  const en = lang === "en";
  return {
    eyebrow: (en ? slide.eyebrowEn : slide.eyebrowZh) || slide.eyebrowZh || slide.eyebrowEn,
    title: (en ? slide.titleEn : slide.titleZh) || slide.titleZh || slide.titleEn,
    highlight: (en ? slide.highlightEn : slide.highlightZh) || slide.highlightZh || slide.highlightEn,
    description: (en ? slide.descriptionEn : slide.descriptionZh) || slide.descriptionZh || slide.descriptionEn,
    chips: (en ? slide.chipsEn : slide.chipsZh).length > 0 ? (en ? slide.chipsEn : slide.chipsZh) : slide.chipsZh,
    ctaLabel: (en ? slide.ctaLabelEn : slide.ctaLabelZh) || slide.ctaLabelZh || slide.ctaLabelEn,
  };
}
