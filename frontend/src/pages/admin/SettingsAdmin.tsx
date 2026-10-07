import AvailabilityPanel from "../../components/AvailabilityPanel";
import { applySiteIcon, refreshSite } from "../../lib/site";
import { useEffect, useState } from "react";
import {
  ArrowDown, ArrowUp, Eye, EyeOff, Globe2, HandCoins, LayoutTemplate, Mail, Moon, Palette,
  Plus, Save, Send, ShieldCheck, Sun, SunMoon, Timer, Trash2, Unlock,
} from "lucide-react";
import { ApiError, get, post } from "../../lib/api";
import { applySiteTheme, THEMES, type ThemeName } from "../../lib/theme";
import { setCurrency } from "../../lib/currency";
import SensitiveConfirm from "../../components/SensitiveConfirm";
import ImageUpload from "../../components/ImageUpload";
import SiteIconField from "../../components/SiteIconField";
import {
  HERO_LAYOUTS, HERO_TONES, defaultHeroSlides, newHeroSlide, parseHeroSlides, serializeHeroSlides,
  type HeroSlide,
} from "../../lib/hero";
import { CaptchaBox, refreshCaptchaConfig } from "../../lib/captcha";

const MODES = [
  { value: "auto", label: "跟随系统", icon: SunMoon },
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
] as const;

const CURRENCIES = [
  { code: "CNY", label: "人民币", symbol: "¥" },
  { code: "USD", label: "美元", symbol: "$" },
  { code: "EUR", label: "欧元", symbol: "€" },
  { code: "GBP", label: "英镑", symbol: "£" },
  { code: "JPY", label: "日元", symbol: "¥" },
  { code: "CHF", label: "瑞郎", symbol: "CHF" },
  { code: "HKD", label: "港币", symbol: "HK$" },
  { code: "TWD", label: "新台币", symbol: "NT$" },
  { code: "SGD", label: "新币", symbol: "S$" },
] as const;

const WITHDRAW_METHODS = [
  { code: "ALIPAY", label: "支付宝", note: "手机号/邮箱 + 实名校验" },
  { code: "BANK", label: "银行卡", note: "卡号 Luhn 校验 + 持卡人 + 开户行" },
  { code: "USDT_TRC20", label: "USDT · TRC20", note: "仅接受 T 开头 TRON 地址" },
  { code: "USDT_BEP20", label: "USDT · BEP20", note: "仅接受 0x 开头 BSC 地址" },
] as const;

const CAPTCHA_SCOPES = [
  { code: "admin_login", label: "后台登录" },
  { code: "member_login", label: "会员登录" },
  { code: "member_register", label: "会员注册" },
  { code: "order_create", label: "创建订单" },
  { code: "order_query", label: "游客查单" },
  { code: "payment", label: "创建支付 / TXID" },
  { code: "presale_redeem", label: "预售提货" },
  { code: "wallet_recharge", label: "余额充值" },
  { code: "wallet_withdraw", label: "申请提现" },
  { code: "gift_card_redeem", label: "礼品卡兑换" },
  { code: "article_purchase", label: "购买文章" },
  { code: "support_ticket", label: "提交工单" },
] as const;

const THEME_NOTES: Record<ThemeName, { tone: string; note: string }> = {
  mint: { tone: "安静、清爽、适合默认发卡站", note: "奶油底色 + 松绿色控件" },
  ocean: { tone: "冷静、可信、适合支付感更强的站点", note: "浅灰蓝底 + 深海蓝主色" },
  violet: { tone: "精致、内容感强、适合文章和会员站", note: "紫罗兰主色 + 柔和浅底" },
  cow: { tone: "活泼、圆润、有奶牛牧场和小动物氛围", note: "蓝天 + 草地绿 + 奶牛斑点" },
};

const GOODS_SUBJECT = "【{{siteName}}】订单 {{orderNo}} 已发货";
const GOODS_BODY = `你好,你的订单已完成发货。

订单号: {{orderNo}}
商品: {{productName}}
数量: {{quantity}}
实付金额: {{currencySymbol}}{{amount}} {{currencyCode}}
支付渠道: {{paidChannel}}
发货时间: {{deliveredAt}}

卡密内容:
{{cards}}

你也可以前往 {{queryUrl}} 使用订单号和邮箱查询。
如需售后,请联系: {{supportContact}}

{{siteName}}`;

const RECHARGE_SUBJECT = "【{{siteName}}】充值订单 {{orderNo}} 已入账";
const RECHARGE_BODY = `你好,你的余额充值已入账。

订单号: {{orderNo}}
入账金额: {{currencySymbol}}{{balanceAmount}} {{currencyCode}}
支付渠道: {{paidChannel}}
入账时间: {{deliveredAt}}

你可以登录会员中心查看余额和流水。
如需帮助,请联系: {{supportContact}}

{{siteName}}`;

const PRESALE_SUBJECT = "【{{siteName}}】预售订单 {{orderNo}} 已确认";
const PRESALE_BODY = `你好,你的预售订单付款已确认。

订单号: {{orderNo}}
商品: {{productName}}
数量: {{quantity}}
实付金额: {{currencySymbol}}{{amount}} {{currencyCode}}
支付渠道: {{paidChannel}}
确认时间: {{deliveredAt}}

电子预售提货码不会通过邮件发送。请使用下单浏览器前往 {{queryUrl}} 查询订单,领取并妥善保存一次性明文提货码。
平台仅保存不可逆哈希,提货码丢失后无法找回。核销需登录会员账号,核销后可在会员中心跟进履约状态。

如需售后,请联系: {{supportContact}}

{{siteName}}`;

export default function SettingsAdmin() {
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [availabilityPreview, setAvailabilityPreview] = useState<"MAINTENANCE" | "OFF_HOURS">("MAINTENANCE");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [sensitive, setSensitive] = useState<"save" | "resetRateLimit" | null>(null);
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>(defaultHeroSlides);
  const [captchaTestToken, setCaptchaTestToken] = useState("");
  const [captchaTestReset, setCaptchaTestReset] = useState(0);
  const [captchaTesting, setCaptchaTesting] = useState(false);

  useEffect(() => {
    get<Record<string, string>>("/admin/config").then((loaded) => {
      setCfg(loaded);
      setHeroSlides(parseHeroSlides(loaded["site.hero_slides"]));
    }).catch(() => void 0);
  }, []);

  function set(key: string, value: string) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  function toggleWithdrawMethod(code: string) {
    const current = new Set((cfg["wallet.withdraw_methods"] ?? "ALIPAY,BANK").split(",").filter(Boolean));
    if (current.has(code)) current.delete(code); else current.add(code);
    set("wallet.withdraw_methods", WITHDRAW_METHODS.filter((m) => current.has(m.code)).map((m) => m.code).join(","));
  }

  function toggleCaptchaScope(code: string) {
    const fallback = CAPTCHA_SCOPES.map((item) => item.code).join(",");
    const current = new Set((cfg["security.captcha.scopes"] ?? fallback).split(",").filter(Boolean));
    if (current.has(code)) current.delete(code); else current.add(code);
    set("security.captcha.scopes", CAPTCHA_SCOPES.filter((item) => current.has(item.code)).map((item) => item.code).join(","));
  }

  function updateHero(index: number, patch: Partial<HeroSlide>) {
    setHeroSlides((current) => current.map((slide, i) => i === index ? { ...slide, ...patch } : slide));
    setMsg("");
  }

  function moveHero(index: number, direction: -1 | 1) {
    setHeroSlides((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeHero(index: number) {
    setHeroSlides((current) => current.length <= 1 ? current : current.filter((_, i) => i !== index));
  }

  async function save(auth: { password: string; totpCode: string }) {
    setBusy(true);
    setMsg("");
    try {
      await post("/admin/config", {
        configs: { ...cfg, "site.hero_slides": serializeHeroSlides(heroSlides) },
        ...auth,
      });
      const refreshed = await refreshSite().catch(() => undefined);
      if (refreshed) applySiteIcon(refreshed.icon);
      refreshCaptchaConfig();
      const loaded = await get<Record<string, string>>("/admin/config");
      setCfg(loaded);
      setHeroSlides(parseHeroSlides(loaded["site.hero_slides"]));
      applySiteTheme(loaded["site.theme"], loaded["site.mode"]);
      setCurrency(loaded["site.currency"]);
      setCaptchaTestToken("");
      setCaptchaTestReset((x) => x + 1);
      setMsg("已保存,商城前台即刻生效");
      setSensitive(null);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "保存失败");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function resetRateLimit(auth: { password: string; totpCode: string }) {
    try {
      await post("/admin/config/rate-limit/reset", auth);
      setMsg("已解除全部临时封禁并重置限流计数");
      setSensitive(null);
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "操作失败");
      throw e;
    }
  }

  async function testCaptcha() {
    if (!captchaTestToken) return;
    setCaptchaTesting(true);
    setMsg("");
    try {
      await post("/admin/config/captcha/test", { token: captchaTestToken });
      setMsg("人机验证测试通过：前端组件、服务端密钥和验证链路均可用");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "人机验证测试失败");
    } finally {
      setCaptchaTesting(false);
      setCaptchaTestToken("");
      setCaptchaTestReset((x) => x + 1);
    }
  }

  async function testMail() {
    setTesting(true);
    setMsg("");
    try {
      await post("/admin/config/mail/test", { to: testTo.trim() });
      setMsg("测试邮件已发送,请检查收件箱或垃圾邮件");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "测试邮件发送失败");
    } finally {
      setTesting(false);
    }
  }

  const theme = cfg["site.theme"] ?? "mint";
  const mode = cfg["site.mode"] ?? "auto";

  return (
    <div className="max-w-5xl animate-fade-up">
      <h1 className="mb-6 text-xl font-extrabold tracking-tight">站点设置</h1>

      <div className="card mb-5 p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div><p className="mb-2 text-[10px] font-bold tracking-[0.2em] text-primary">STORE AVAILABILITY</p><h2 className="flex items-center gap-2 text-lg font-bold"><Timer size={18} /> 维护与下班时段</h2></div>
          <span className="rounded-full bg-accent-soft px-4 py-2 text-xs font-bold text-primary">{cfg["site.maintenance.enabled"] === "1" ? "待保存配置：维护开启" : cfg["site.off_hours.enabled"] === "1" ? "待保存配置：定时营业" : "待保存配置：全天营业"}</span>
        </div>
        <p className="mb-5 text-xs leading-6 text-ink/50">维护模式优先于下班时段。暂停新订单、余额充值与文章购买；已有订单付款、查单、自动发货及后台管理保持可用。保存后生效。</p>
        <label className="mb-3 flex items-center gap-3 text-sm font-bold">
          <input type="checkbox" checked={cfg["site.maintenance.enabled"] === "1"} onChange={(e) => set("site.maintenance.enabled", e.target.checked ? "1" : "0")} />开启维护模式
        </label>
        <label className="label" htmlFor="maintenance-message">维护提示</label>
        <textarea id="maintenance-message" className="input mb-5" maxLength={500} value={cfg["site.maintenance.message"] ?? ""} placeholder="网站维护中，请稍后再来。" onChange={(e) => set("site.maintenance.message", e.target.value)} />
        <label className="mb-3 flex items-center gap-3 text-sm font-bold">
          <input type="checkbox" checked={cfg["site.off_hours.enabled"] === "1"} onChange={(e) => set("site.off_hours.enabled", e.target.checked ? "1" : "0")} />每天自动进入下班状态
        </label>
        <div className="mb-3 grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="off-start">下班时间（北京时间）</label><input id="off-start" className="input" type="time" value={cfg["site.off_hours.start"] ?? "22:00"} onChange={(e) => set("site.off_hours.start", e.target.value)} /></div>
          <div><label className="label" htmlFor="off-end">恢复营业时间（北京时间）</label><input id="off-end" className="input" type="time" value={cfg["site.off_hours.end"] ?? "09:00"} onChange={(e) => set("site.off_hours.end", e.target.value)} /></div>
        </div>
        <p className="mb-4 text-xs text-ink/45">支持跨午夜，例如 22:00 至次日 09:00；开始与结束时间不能相同。关闭维护后仍按每日时段判断营业状态。</p>
        <label className="label" htmlFor="off-message">下班提示</label>
        <textarea id="off-message" className="input" maxLength={500} value={cfg["site.off_hours.message"] ?? ""} placeholder="已经下班啦，营业后欢迎再来。" onChange={(e) => set("site.off_hours.message", e.target.value)} />
        <div className="mb-5 mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-5">
          <div><h3 className="text-sm font-bold">买家页面预览</h3><p className="mt-1 text-xs text-ink/45">与商城共用设计，修改文案即可预览，保存后才会生效。</p></div>
          <div className="flex gap-2">{(["MAINTENANCE", "OFF_HOURS"] as const).map((state) => <button key={state} type="button" className={`chip ${availabilityPreview === state ? "chip-on" : ""}`} aria-pressed={availabilityPreview === state} onClick={() => setAvailabilityPreview(state)}>{state === "MAINTENANCE" ? "维护页面" : "下班页面"}</button>)}</div>
        </div>
        <AvailabilityPanel preview status={{ state: availabilityPreview, message: cfg[availabilityPreview === "MAINTENANCE" ? "site.maintenance.message" : "site.off_hours.message"] ?? "", timezone: "Asia/Shanghai", offStart: cfg["site.off_hours.start"] || "22:00", offEnd: cfg["site.off_hours.end"] || "09:00", resumesAt: null }} />
        <button type="button" className="btn-primary" disabled={busy} onClick={() => setSensitive("save")}><Save size={15} />保存站点设置</button>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-4 font-bold">基本信息</h2>
        <label className="label">站点名称</label>
        <input className="input mb-3" value={cfg["site.name"] ?? ""} placeholder="Ka 发卡"
          onChange={(e) => set("site.name", e.target.value)} />
        <SiteIconField value={cfg["site.icon"] ?? ""} onChange={(url) => set("site.icon", url)} />
        <label className="mb-3 flex items-center gap-3 text-sm text-ink">
          <input type="checkbox" checked={cfg["site.show_sales"] === "1"}
            onChange={(e) => set("site.show_sales", e.target.checked ? "1" : "0")} />
          显示商品销量
        </label>
        <p className="mb-4 text-xs text-ink/45">开启后商城列表和详情显示已付款商品的购买件数，包含历史订单，不含已退款订单。销量最多延迟 10 分钟更新，买家刷新页面后查看。</p>
        <label className="label">公告(留空不展示)</label>
        <input className="input mb-3" value={cfg["site.announcement"] ?? ""} placeholder="全场自动发货…"
          onChange={(e) => set("site.announcement", e.target.value)} />
        <label className="label">联系方式(展示给买家)</label>
        <input className="input" value={cfg["site.contact"] ?? ""} placeholder="Telegram: @xxx"
          onChange={(e) => set("site.contact", e.target.value)} />
        <label className="label mt-3">站点网址(邮件查单链接使用)</label>
        <input className="input font-mono text-xs" value={cfg["site.url"] ?? ""} placeholder="https://ka.example.com"
          onChange={(e) => set("site.url", e.target.value)} />
      </div>

      <div className="card mb-5 p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="mb-1 flex items-center gap-2 font-bold"><LayoutTemplate size={16} /> 首页横幅（可选）</h2>
            <p className="max-w-2xl text-xs leading-relaxed text-ink/45">
              首页横幅是可选区块：启用 1 屏时按静态大标题展示；启用 2 屏以上才出现轮播与页码；全部停用时首页隐藏整个横幅，直接从商品分类开始。每屏可单独设置内容与视觉版式，最多 6 屏。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-ghost !px-4 !py-2.5 text-xs"
              onClick={() => setHeroSlides((current) => {
                const allOff = current.every((slide) => !slide.enabled);
                return current.map((slide) => ({ ...slide, enabled: allOff }));
              })}>
              {heroSlides.some((slide) => slide.enabled) ? <><EyeOff size={14} /> 隐藏整个横幅</> : <><Eye size={14} /> 启用横幅</>}
            </button>
            <button className="btn-ghost !px-4 !py-2.5 text-xs" disabled={heroSlides.length >= 6}
              onClick={() => setHeroSlides((current) => [...current, newHeroSlide()])}>
              <Plus size={14} /> 添加一屏
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {heroSlides.map((slide, index) => (
            <div key={slide.id} className={`overflow-hidden rounded-3xl border ${slide.enabled ? "border-ink/[0.09]" : "border-ink/[0.05] opacity-65"}`}>
              <div className="flex flex-wrap items-center gap-2 border-b border-ink/[0.06] bg-ink/[0.025] px-4 py-3">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-contrast">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{slide.titleZh || slide.titleEn || "未命名轮播"}</span>
                <button className="icon-btn" title={slide.enabled ? "停用这一屏" : "启用这一屏"}
                  onClick={() => updateHero(index, { enabled: !slide.enabled })}>
                  {slide.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button className="icon-btn" title="上移" disabled={index === 0} onClick={() => moveHero(index, -1)}><ArrowUp size={14} /></button>
                <button className="icon-btn" title="下移" disabled={index === heroSlides.length - 1} onClick={() => moveHero(index, 1)}><ArrowDown size={14} /></button>
                <button className="icon-btn text-red-500" title="删除" disabled={heroSlides.length <= 1} onClick={() => removeHero(index)}><Trash2 size={14} /></button>
              </div>

              <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
                <div className="min-w-0">
                  <div className="mb-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">视觉版式</label>
                      <select className="input !py-2.5" value={slide.layout}
                        onChange={(e) => updateHero(index, { layout: e.target.value as HeroSlide["layout"] })}>
                        {HERO_LAYOUTS.map((item) => <option key={item.value} value={item.value}>{item.label} · {item.note}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">配色氛围</label>
                      <select className="input !py-2.5" value={slide.tone}
                        onChange={(e) => updateHero(index, { tone: e.target.value as HeroSlide["tone"] })}>
                        {HERO_TONES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">中文眉题</label>
                      <input className="input" maxLength={40} value={slide.eyebrowZh}
                        onChange={(e) => updateHero(index, { eyebrowZh: e.target.value })} placeholder="例如：限时活动" />
                    </div>
                    <div>
                      <label className="label">中文标题</label>
                      <input className="input" maxLength={60} value={slide.titleZh}
                        onChange={(e) => updateHero(index, { titleZh: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">中文高亮词</label>
                      <input className="input" maxLength={30} value={slide.highlightZh}
                        onChange={(e) => updateHero(index, { highlightZh: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">中文标签（逗号分隔，最多4个）</label>
                      <input className="input" value={slide.chipsZh.join(", ")}
                        onChange={(e) => updateHero(index, { chipsZh: e.target.value.split(/[,，]/).map((v) => v.trim()).filter(Boolean).slice(0, 4) })} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">中文说明</label>
                      <textarea className="input min-h-20" maxLength={220} value={slide.descriptionZh}
                        onChange={(e) => updateHero(index, { descriptionZh: e.target.value })} />
                    </div>
                  </div>

                  <details className="mt-4 rounded-2xl border border-ink/[0.07] p-4">
                    <summary className="cursor-pointer text-xs font-bold text-ink/60">英文文案（可选，留空时回落中文）</summary>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <input className="input" maxLength={80} value={slide.eyebrowEn} placeholder="Eyebrow"
                        onChange={(e) => updateHero(index, { eyebrowEn: e.target.value })} />
                      <input className="input" maxLength={100} value={slide.titleEn} placeholder="Headline"
                        onChange={(e) => updateHero(index, { titleEn: e.target.value })} />
                      <input className="input" maxLength={60} value={slide.highlightEn} placeholder="Highlight"
                        onChange={(e) => updateHero(index, { highlightEn: e.target.value })} />
                      <input className="input" value={slide.chipsEn.join(", ")} placeholder="Tags, comma separated"
                        onChange={(e) => updateHero(index, { chipsEn: e.target.value.split(",").map((v) => v.trim()).filter(Boolean).slice(0, 4) })} />
                      <textarea className="input min-h-20 sm:col-span-2" maxLength={320} value={slide.descriptionEn} placeholder="Description"
                        onChange={(e) => updateHero(index, { descriptionEn: e.target.value })} />
                    </div>
                  </details>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="label">按钮文字</label>
                      <input className="input" maxLength={20} value={slide.ctaLabelZh} placeholder="留空不显示"
                        onChange={(e) => updateHero(index, { ctaLabelZh: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">英文按钮</label>
                      <input className="input" maxLength={40} value={slide.ctaLabelEn}
                        onChange={(e) => updateHero(index, { ctaLabelEn: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">按钮链接</label>
                      <input className="input font-mono text-xs" value={slide.ctaUrl} placeholder="/product/1 或 https://…"
                        onChange={(e) => updateHero(index, { ctaUrl: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div>
                  <div className={`hero-admin-preview hero-tone-${slide.tone}`}>
                    {slide.imageUrl && <img src={slide.imageUrl} alt="" />}
                    <div>
                      <span>{slide.eyebrowZh || "轮播预览"}</span>
                      <strong>{slide.titleZh}<em>{slide.highlightZh}</em></strong>
                      <small>{HERO_LAYOUTS.find((item) => item.value === slide.layout)?.label}</small>
                    </div>
                  </div>
                  {(slide.layout === "image-right" || slide.layout === "image-cover") && (
                    <div className="mt-3">
                      <label className="label">轮播图片</label>
                      <ImageUpload value={slide.imageUrl} onChange={(imageUrl) => updateHero(index, { imageUrl })}
                        hint="建议 1600×900 WebP / JPG · ≤5MB" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-ink/40">
          保存后前台立即读取新横幅。想要更简洁的首页，把不需要的屏逐一点「停用」即可；全部停用后首页只保留商品目录。
        </p>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><Globe2 size={16} /> SEO 设置</h2>
        <p className="mb-4 text-xs leading-relaxed text-ink/45">
          用于首页、文章、商品页面的 title/meta/canonical/OG 标签。文章详情会自动用文章标题、摘要、封面覆盖全站默认值。
        </p>
        <label className="label">SEO 标题</label>
        <input className="input mb-3" value={cfg["seo.title"] ?? ""} placeholder="Ka 发卡 · 数字商品秒级到账"
          onChange={(e) => set("seo.title", e.target.value)} />
        <label className="label">SEO 描述</label>
        <textarea className="input mb-3 min-h-20 text-sm leading-relaxed" maxLength={180}
          value={cfg["seo.description"] ?? ""} placeholder="自动发卡平台,支持支付宝、USDT、USDC 和信用卡支付,卡密秒级交付。"
          onChange={(e) => set("seo.description", e.target.value)} />
        <label className="label">关键词(英文逗号分隔)</label>
        <input className="input mb-3" value={cfg["seo.keywords"] ?? ""} placeholder="自动发卡,卡密,数字商品,USDT支付"
          onChange={(e) => set("seo.keywords", e.target.value)} />
        <label className="label">OG 分享图 URL</label>
        <input className="input mb-4 font-mono text-xs" value={cfg["seo.og_image"] ?? ""} placeholder="https://ka.example.com/files/og.png"
          onChange={(e) => set("seo.og_image", e.target.value)} />
        <label className="label">搜索引擎收录</label>
        <div className="flex flex-wrap gap-2.5">
          {([["1", "允许收录"], ["0", "禁止收录"]] as const).map(([v, label]) => (
            <button key={v} className={`chip !py-2.5 ${(cfg["seo.index"] ?? "1") === v ? "chip-on" : ""}`}
              onClick={() => set("seo.index", v)}>
              {label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink/40">
          sitemap: <span className="font-mono">/sitemap.xml</span> · robots: <span className="font-mono">/robots.txt</span>
        </p>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><HandCoins size={16} /> 货币与换汇</h2>
        <p className="mb-4 text-xs text-ink/45">
          商品价格、优惠券、余额和提现按站点计价币种解释;加密支付自动换算为 USD 稳定币,支付宝/易支付自动换算为 CNY。
        </p>
        <label className="label">站点计价币种</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {CURRENCIES.map((c) => {
            const on = (cfg["site.currency"] ?? "CNY") === c.code;
            return (
              <button key={c.code}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                  on ? "border-primary bg-primary text-primary-contrast" : "border-ink/10 bg-surface hover:border-ink/25"
                }`}
                onClick={() => set("site.currency", c.code)}>
                <span>
                  <span className="block text-sm font-bold">{c.code}</span>
                  <span className={`block text-xs ${on ? "text-primary-contrast/70" : "text-ink/40"}`}>{c.label}</span>
                </span>
                <span className={`text-sm font-extrabold ${on ? "text-primary-contrast" : "text-primary"}`}>{c.symbol}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink/40">
          切换币种后,请同步核对商品价格、文章价格、优惠券面额、钱包最低提现金额等数值;系统不会自动改写已有价格数字。
        </p>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><Palette size={16} /> 全站主题</h2>
        <p className="mb-4 text-xs leading-relaxed text-ink/45">
          买家商城与管理后台共用;买家仍可自行切换明暗。选择后需要点击保存才会生效,避免误触预览导致前台主题变化。CoW 奶牛牧场会启用小动物、草坡和奶牛斑点装饰。
        </p>
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          {THEMES.map((t) => (
            <button key={t.value}
              onClick={() => set("site.theme", t.value)}
              className={`group overflow-hidden rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft ${
                theme === t.value ? "border-primary/40 bg-accent-soft" : "border-ink/[0.08] bg-surface hover:border-primary/25"
              }`}>
              <div className="mb-4 flex h-16 items-end overflow-hidden rounded-2xl border border-ink/[0.06] bg-base px-3 pb-2">
                <span className="mr-2 h-8 w-8 rounded-full shadow-sm" style={{ background: t.swatch }} />
                <span className="h-5 w-14 rounded-full bg-accent-soft" />
                <span className="ml-auto h-9 w-9 rounded-full bg-surface shadow-sm" />
                {t.value === "cow" && (
                  <span className="relative ml-2 h-9 w-14 rounded-[45%] border-2 border-ink bg-surface shadow-sm">
                    <span className="absolute left-2 top-2 h-2.5 w-3 rounded-full bg-ink" />
                    <span className="absolute bottom-2 right-3 h-2 w-2.5 rounded-full bg-ink" />
                    <span className="absolute -right-3 top-1.5 h-5 w-4 rounded-r-full border-2 border-l-0 border-ink bg-surface" />
                  </span>
                )}
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold">{t.label}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink/45">{THEME_NOTES[t.value].tone}</p>
                </div>
                <span className={`mt-0.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  theme === t.value ? "bg-primary text-primary-contrast" : "bg-ink/[0.05] text-ink/35"
                }`}>
                  {theme === t.value ? "待保存" : "选择"}
                </span>
              </div>
              <p className="mt-3 rounded-2xl bg-surface/70 px-3 py-2 text-[11px] text-ink/45">
                {THEME_NOTES[t.value].note}
              </p>
            </button>
          ))}
        </div>
        <label className="label">默认明暗模式</label>
        <div className="flex flex-wrap gap-2.5">
          {MODES.map((m) => (
            <button key={m.value} onClick={() => set("site.mode", m.value)}
              className={`chip !py-2.5 ${mode === m.value ? "chip-on" : ""}`}>
              <m.icon size={13} /> {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><Timer size={16} /> 交易设置</h2>
        <p className="mb-4 text-xs text-ink/45">
          到时未支付的订单每分钟自动扫描关闭并<b>释放预占库存</b>;同邮箱/同 IP 未支付订单数超限时拒绝新下单,防止恶意批量下单锁库存。
        </p>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
          <div>
            <label className="label">订单支付超时(分钟)</label>
            <input className="input !py-2.5" type="number" min={1} max={1440}
              value={cfg["order.expire_minutes"] ?? ""} placeholder="15(默认)"
              onChange={(e) => set("order.expire_minutes", e.target.value)} />
          </div>
          <div>
            <label className="label">同邮箱未支付上限(笔)</label>
            <input className="input !py-2.5" type="number" min={1} max={100}
              value={cfg["order.max_pending_per_contact"] ?? ""} placeholder="3(默认)"
              onChange={(e) => set("order.max_pending_per_contact", e.target.value)} />
          </div>
          <div>
            <label className="label">同 IP 未支付上限(笔)</label>
            <input className="input !py-2.5" type="number" min={1} max={200}
              value={cfg["order.max_pending_per_ip"] ?? ""} placeholder="5(默认)"
              onChange={(e) => set("order.max_pending_per_ip", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><ShieldCheck size={16} /> CC 防护(接口限流)</h2>
        <p className="mb-4 text-xs text-ink/45">
          按 IP 分档限流,连续超限自动临时封禁。全部留空使用内置默认;保存后<b>即刻生效</b>。误封自己时点下方「解除全部封禁」。
        </p>
        <label className="label">防护开关</label>
        <div className="mb-4 flex gap-2.5">
          {[["", "开启(默认)"], ["0", "关闭"]].map(([v, l]) => (
            <button key={v}
              className={`chip !py-2.5 ${(cfg["security.rl.enabled"] === "0" ? "0" : "") === v ? "chip-on" : ""}`}
              onClick={() => set("security.rl.enabled", v)}>{l}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {([
            ["security.rl.global_per_minute", "买家接口 / 分钟", "480"],
            ["security.rl.admin_per_minute", "后台接口 / 分钟", "600"],
            ["security.rl.login_per_minute", "登录注册 / 分钟", "10"],
            ["security.rl.order_per_minute", "下单 / 分钟", "20"],
            ["security.rl.pay_per_minute", "支付轮询 / 分钟", "90"],
            ["security.rl.ban_threshold", "触发封禁阈值(次/2分钟)", "5"],
            ["security.rl.ban_minutes", "首次封禁时长(分钟)", "10"],
          ] as const).map(([key, label, ph]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input className="input !py-2.5" type="number" min={1} value={cfg[key] ?? ""} placeholder={ph}
                onChange={(e) => set(key, e.target.value)} />
            </div>
          ))}
        </div>
        <button className="btn-ghost mt-4 !py-2.5 text-xs"
          onClick={() => setSensitive("resetRateLimit")}>
          <Unlock size={13} /> 解除全部封禁(立即)
        </button>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><ShieldCheck size={16} /> 人机验证(Captcha)</h2>
        <p className="mb-4 text-xs leading-relaxed text-ink/45">
          可按表单场景启用验证。支持无需第三方账号的站内图形验证，以及 Cloudflare Turnstile、Google reCAPTCHA 与 hCaptcha。
        </p>
        <label className="label">验证开关</label>
        <div className="mb-4 flex flex-wrap gap-2.5">
          {([["0", "关闭"], ["1", "开启"]] as const).map(([v, label]) => (
            <button key={v} className={`chip !py-2.5 ${(cfg["security.captcha.enabled"] ?? "0") === v ? "chip-on" : ""}`}
              onClick={() => set("security.captcha.enabled", v)}>
              {label}
            </button>
          ))}
        </div>
        <label className="label">服务商</label>
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ["builtin", "站内图形验证"],
            ["turnstile", "Cloudflare Turnstile"],
            ["recaptcha", "Google reCAPTCHA"],
            ["hcaptcha", "hCaptcha"],
          ] as const).map(([v, label]) => (
            <button key={v} className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${
              (cfg["security.captcha.provider"] ?? "turnstile") === v
                ? "border-primary bg-primary text-primary-contrast"
                : "border-ink/10 bg-surface text-ink/60 hover:border-primary/25 hover:text-ink"
            }`} onClick={() => set("security.captcha.provider", v)}>
              {label}
            </button>
          ))}
        </div>
        {(cfg["security.captcha.provider"] ?? "turnstile") === "builtin" ? (
          <div className="mb-4 rounded-2xl border border-primary/15 bg-accent-soft/50 p-4">
            <label className="label">验证码字符数</label>
            <div className="flex gap-2">
              {["4", "5", "6"].map((length) => (
                <button type="button" key={length} className={`chip !py-2 ${(cfg["security.captcha.builtin_length"] ?? "5") === length ? "chip-on" : ""}`}
                  onClick={() => set("security.captcha.builtin_length", length)}>{length} 位</button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink/40">无需外部服务；答案、短时凭证均保存在本机内存，绑定 IP 和表单场景且只能使用一次。推荐 5 位。</p>
          </div>
        ) : (
          <>
            <label className="label">Site Key（公开）</label>
            <input className="input mb-3 font-mono text-xs" value={cfg["security.captcha.site_key"] ?? ""}
              placeholder="0x4AAAA... / 6Lc..." onChange={(e) => set("security.captcha.site_key", e.target.value)} />
            <label className="label">Secret Key（仅写入，不回显）</label>
            <input className="input mb-3 font-mono text-xs" type="password" value={cfg["security.captcha.secret_key"] ?? ""}
              autoComplete="new-password"
              placeholder={cfg["security.captcha.secret_configured"] === "1" ? "已安全配置；留空不会覆盖" : "请输入服务端 Secret Key"}
              onChange={(e) => set("security.captcha.secret_key", e.target.value)} />
            <label className="label">允许的验证域名（推荐）</label>
            <input className="input mb-4 font-mono text-xs" value={cfg["security.captcha.allowed_hostnames"] ?? ""}
              placeholder="example.com,www.example.com；留空读取站点网址"
              onChange={(e) => set("security.captcha.allowed_hostnames", e.target.value)} />
          </>
        )}

        <label className="label">需要验证的表单</label>
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {CAPTCHA_SCOPES.map((scope) => {
            const fallback = CAPTCHA_SCOPES.map((item) => item.code).join(",");
            const selected = (cfg["security.captcha.scopes"] ?? fallback).split(",").includes(scope.code);
            return <button type="button" key={scope.code} className={`chip justify-center !px-3 !py-2.5 text-xs ${selected ? "chip-on" : ""}`}
              onClick={() => toggleCaptchaScope(scope.code)}>{scope.label}</button>;
          })}
        </div>

        <div className={`rounded-2xl border p-4 ${cfg["security.captcha.configured"] === "1" ? "border-emerald-500/20 bg-emerald-500/[0.06]" : "border-amber-500/20 bg-amber-500/[0.06]"}`}>
          <p className="text-xs font-bold">{cfg["security.captcha.status"] ?? "保存后检查配置状态"}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink/45">修改配置后请先保存，再在这里完成一次真实验证。第三方模式会同时检查浏览器组件、Secret、action 和域名白名单。</p>
          {cfg["security.captcha.enabled"] === "1" && cfg["security.captcha.configured"] === "1" && (
            <div className="mt-3">
              <CaptchaBox action="admin_captcha_test" force resetKey={captchaTestReset}
                onToken={setCaptchaTestToken} />
              <button type="button" className="btn-ghost !py-2.5 text-xs" disabled={!captchaTestToken || captchaTesting}
                onClick={() => void testCaptcha()}>{captchaTesting ? "测试中…" : "测试服务端验证"}</button>
            </div>
          )}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink/40">
          第三方验证建议优先使用 Cloudflare Turnstile；国内网络不稳定时可使用站内图形验证，避免外部脚本加载失败阻断下单。
        </p>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><ShieldCheck size={16} /> 敏感操作验证</h2>
        <p className="mb-4 text-xs leading-relaxed text-ink/45">
          卡密管理、补单、关单、提现审核、冻结余额等敏感操作首次需要管理员密码 + 2FA。验证通过后的有效期内,弹层仍会提示风险,但会明确显示无需再次输入 2FA。
        </p>
        <label className="label">2FA 免重复验证时间(分钟)</label>
        <input className="input max-w-xs" type="number" min={0} max={60}
          value={cfg["security.sensitive_grace_minutes"] ?? "5"} placeholder="5"
          onChange={(e) => set("security.sensitive_grace_minutes", e.target.value)} />
        <p className="mt-2 text-[11px] text-ink/40">填 0 表示每次敏感操作都重新验证;最大 60 分钟。保存后按上次验证时间计算有效期,期间操作不会延长有效期。</p>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><HandCoins size={16} /> 钱包与推广</h2>
        <p className="mb-4 text-xs text-ink/45">会员余额钱包在平台内统一流转:可购买付费文章、接收推广佣金;提现需人工审核。</p>
        <label className="label">推广佣金比例(%,0~100;0 = 关闭返佣)</label>
        <input className="input mb-1" type="number" min={0} max={100} step="0.1"
          value={cfg["commission.rate"] ?? ""} placeholder="0"
          onChange={(e) => set("commission.rate", e.target.value)} />
        <p className="mb-3 text-[11px] text-ink/40">被邀请会员每笔实付消费(商品订单 / 付费文章)按比例计入邀请人余额;充值不计佣。</p>
        <label className="label">最低提现金额(元)</label>
        <input className="input mb-4" type="number" min={0.01} step="0.01"
          value={cfg["wallet.min_withdraw"] ?? ""} placeholder="10"
          onChange={(e) => set("wallet.min_withdraw", e.target.value)} />
        <label className="label">允许会员使用的提现方式</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {WITHDRAW_METHODS.map((method) => {
            const enabled = (cfg["wallet.withdraw_methods"] ?? "ALIPAY,BANK").split(",").includes(method.code);
            return <button type="button" key={method.code} onClick={() => toggleWithdrawMethod(method.code)}
              className={`rounded-2xl border p-3.5 text-left transition ${enabled ? "border-primary bg-accent-soft/60" : "border-ink/10 bg-surface text-ink/45"}`}>
              <span className="flex items-center justify-between gap-2 text-sm font-bold">
                {method.label}<span className={`rounded-full px-2 py-0.5 text-[10px] ${enabled ? "bg-primary text-primary-contrast" : "bg-ink/[0.06]"}`}>{enabled ? "已开放" : "已关闭"}</span>
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-ink/45">{method.note}</span>
            </button>;
          })}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink/40">全部关闭后会员端不能提现；服务端会拒绝已停用渠道，即使有人绕过页面提交也无效。</p>
        <div className="mt-4 space-y-3">
          <p className="label !mb-0">各提现方式手续费</p>
          {WITHDRAW_METHODS.filter((method) => (cfg["wallet.withdraw_methods"] ?? "ALIPAY,BANK").split(",").includes(method.code)).map((method) => (
            <div key={method.code} className="grid gap-3 rounded-2xl border border-ink/[0.08] p-4 sm:grid-cols-[1fr_140px_140px] sm:items-end">
              <div><p className="text-sm font-bold">{method.label}</p><p className="mt-1 text-[11px] text-ink/40">手续费从申请金额中扣除，剩余金额为实际到账。</p></div>
              <div>
                <label className="label">比例手续费(%)</label>
                <input className="input !py-2.5" type="number" min={0} max={100} step="0.01" placeholder="0"
                  value={cfg[`wallet.withdraw_fee_rate.${method.code}`] ?? ""}
                  onChange={(e) => set(`wallet.withdraw_fee_rate.${method.code}`, e.target.value)} />
              </div>
              <div>
                <label className="label">固定手续费</label>
                <input className="input !py-2.5" type="number" min={0} step="0.01" placeholder="0"
                  value={cfg[`wallet.withdraw_fee_fixed.${method.code}`] ?? ""}
                  onChange={(e) => set(`wallet.withdraw_fee_fixed.${method.code}`, e.target.value)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 font-bold">Telegram 成交通知</h2>
        <p className="mb-4 text-xs text-ink/45">向 @BotFather 创建机器人获取 Token,向机器人发一条消息后从 getUpdates 拿 chat_id。两项都填才生效。</p>
        <label className="label">Bot Token</label>
        <input className="input mb-3 font-mono text-xs" value={cfg["tg.bot_token"] ?? ""} placeholder="123456:ABC-DEF…"
          onChange={(e) => set("tg.bot_token", e.target.value)} />
        <label className="label">Chat ID</label>
        <input className="input font-mono text-xs" value={cfg["tg.chat_id"] ?? ""} placeholder="-100123456789"
          onChange={(e) => set("tg.chat_id", e.target.value)} />
      </div>

      <div className="card mb-5 p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="mb-1 flex items-center gap-2 font-bold"><Mail size={16} /> 邮件通知</h2>
            <p className="text-xs text-ink/45">开启后,商品发货和余额充值入账会自动给买家邮箱发送通知。</p>
          </div>
          <button className={`chip !py-2.5 ${(cfg["mail.enabled"] === "1" || cfg["mail.enabled"] === "true") ? "chip-on" : ""}`}
            onClick={() => set("mail.enabled", (cfg["mail.enabled"] === "1" || cfg["mail.enabled"] === "true") ? "0" : "1")}>
            {(cfg["mail.enabled"] === "1" || cfg["mail.enabled"] === "true") ? "已启用" : "未启用"}
          </button>
        </div>

        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label">SMTP Host</label>
            <input className="input font-mono text-xs" value={cfg["mail.host"] ?? ""} placeholder="smtp.example.com"
              onChange={(e) => set("mail.host", e.target.value)} />
          </div>
          <div>
            <label className="label">端口</label>
            <input className="input" type="number" value={cfg["mail.port"] ?? "587"}
              onChange={(e) => set("mail.port", e.target.value)} />
          </div>
          <div>
            <label className="label">SMTP 用户名</label>
            <input className="input font-mono text-xs" value={cfg["mail.username"] ?? ""} placeholder="notice@example.com"
              onChange={(e) => set("mail.username", e.target.value)} />
          </div>
          <div>
            <label className="label">SMTP 密码 / 授权码</label>
            <input className="input font-mono text-xs" type="password" value={cfg["mail.password"] ?? ""}
              onChange={(e) => set("mail.password", e.target.value)} />
          </div>
          <div>
            <label className="label">发件邮箱</label>
            <input className="input font-mono text-xs" value={cfg["mail.from"] ?? ""} placeholder="notice@example.com"
              onChange={(e) => set("mail.from", e.target.value)} />
          </div>
          <div>
            <label className="label">发件名称</label>
            <input className="input" value={cfg["mail.from_name"] ?? ""} placeholder={cfg["site.name"] || "Ka 发卡"}
              onChange={(e) => set("mail.from_name", e.target.value)} />
          </div>
          <div>
            <label className="label">STARTTLS</label>
            <button className={`chip w-full justify-center !py-3 ${(cfg["mail.starttls"] ?? "1") !== "0" ? "chip-on" : ""}`}
              onClick={() => set("mail.starttls", (cfg["mail.starttls"] ?? "1") !== "0" ? "0" : "1")}>
              {(cfg["mail.starttls"] ?? "1") !== "0" ? "开启" : "关闭"}
            </button>
          </div>
          <div>
            <label className="label">SSL</label>
            <button className={`chip w-full justify-center !py-3 ${cfg["mail.ssl"] === "1" ? "chip-on" : ""}`}
              onClick={() => set("mail.ssl", cfg["mail.ssl"] === "1" ? "0" : "1")}>
              {cfg["mail.ssl"] === "1" ? "开启" : "关闭"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input className="input" value={testTo} placeholder="测试收件邮箱"
            onChange={(e) => setTestTo(e.target.value)} />
          <button className="btn-ghost" disabled={testing || !testTo.trim()} onClick={testMail}>
            <Send size={14} /> {testing ? "发送中…" : "发送测试邮件"}
          </button>
        </div>

        <div className="mt-5 rounded-3xl border border-ink/[0.07] p-4">
          <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 商品发货模板</p>
          <label className="label">邮件标题</label>
          <input className="input mb-3" value={cfg["mail.template.order_paid_subject"] ?? GOODS_SUBJECT}
            onChange={(e) => set("mail.template.order_paid_subject", e.target.value)} />
          <label className="label">邮件正文</label>
          <textarea className="input min-h-52 font-mono text-xs" value={cfg["mail.template.order_paid_body"] ?? GOODS_BODY}
            onChange={(e) => set("mail.template.order_paid_body", e.target.value)} />
        </div>

        <div className="mt-4 rounded-3xl border border-ink/[0.07] p-4">
          <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 余额充值模板</p>
          <label className="label">邮件标题</label>
          <input className="input mb-3" value={cfg["mail.template.recharge_subject"] ?? RECHARGE_SUBJECT}
            onChange={(e) => set("mail.template.recharge_subject", e.target.value)} />
          <label className="label">邮件正文</label>
          <textarea className="input min-h-44 font-mono text-xs" value={cfg["mail.template.recharge_body"] ?? RECHARGE_BODY}
            onChange={(e) => set("mail.template.recharge_body", e.target.value)} />
        </div>

        <div className="mt-4 rounded-3xl border border-ink/[0.07] p-4">
          <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 预售确认模板</p>
          <label className="label">邮件标题</label>
          <input className="input mb-3" value={cfg["mail.template.presale_subject"] ?? PRESALE_SUBJECT}
            onChange={(e) => set("mail.template.presale_subject", e.target.value)} />
          <label className="label">邮件正文</label>
          <textarea className="input min-h-52 font-mono text-xs" value={cfg["mail.template.presale_body"] ?? PRESALE_BODY}
            onChange={(e) => set("mail.template.presale_body", e.target.value)} />
          <p className="mt-3 text-[11px] leading-relaxed text-ink/40">
            可用变量: {"{{siteName}} {{orderNo}} {{productName}} {{amount}} {{quantity}} {{paidChannel}} {{paidAt}} {{deliveredAt}} {{cards}} {{balanceAmount}} {{currencySymbol}} {{currencyCode}} {{queryUrl}} {{supportContact}}"}
          </p>
        </div>
      </div>

      {msg && <p className="mb-3 text-sm text-primary">{msg}</p>}
      <button className="btn-primary" disabled={busy} onClick={() => setSensitive("save")}><Save size={15} /> {busy ? "保存中…" : "保存全部设置"}</button>

      {sensitive && (
        <SensitiveConfirm
          action={{
            title: sensitive === "save" ? "保存站点设置" : "解除全部封禁",
            confirmText: sensitive === "save" ? "确认保存" : "确认解除",
            danger: sensitive === "resetRateLimit",
            summary: sensitive === "save"
              ? <span>将更新站点基础信息、SEO、货币、主题、邮件、限流、人机验证与钱包等配置。</span>
              : <span>将清空当前全部临时封禁和限流计数,误封自救时使用。</span>,
          }}
          onClose={() => setSensitive(null)}
          onConfirm={sensitive === "save" ? save : resetRateLimit}
        />
      )}
    </div>
  );
}
