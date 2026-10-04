import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BadgePercent, Clock3, KeyRound, Mail, Minus, Plus, ShieldCheck, Wrench } from "lucide-react";
import { ApiError, get, post, type CreateOrderResponse, type ProductDetail } from "../../lib/api";
import { isMemberLoggedIn, mGet, mPost, memberInfo } from "../../lib/memberApi";
import { recalledContact, rememberContact } from "../../lib/contactMemory";
import { rememberOrder } from "../../lib/orderHistory";
import { currencySymbol, money } from "../../lib/currency";
import { useSeo } from "../../lib/seo";
import { useI18n } from "../../lib/i18n";
import { CaptchaBox, captchaHeaders } from "../../lib/captcha";
import { useStorePageLoading } from "../../components/StoreAvailability";

interface PriceQuote {
  unitPrice: string; discountPerUnit: string; levelName: string | null; source: string;
  wholesaleTiers: { minQuantity: number; unitPrice: string }[];
  productId: string; quantity: number;
}
interface ManualField { key: string; label: string; type: "TEXT" | "EMAIL" | "NUMBER" | "SELECT" | "TEXTAREA"; required: boolean; placeholder?: string; options?: string[]; }
const LEGACY_MANUAL_FIELDS: ManualField[] = [{ key: "delivery_details", label: "交付所需信息", type: "TEXTAREA", required: true, placeholder: "请填写账号、区服、角色 ID 或其他交付资料" }];
function parseManualFields(schema: string | null): ManualField[] {
  try { const parsed = JSON.parse(schema ?? ""); return Array.isArray(parsed) && parsed.length ? parsed : LEGACY_MANUAL_FIELDS; }
  catch { return LEGACY_MANUAL_FIELDS; }
}

function cents(value: string | number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

function effectiveMinimumQuantity(product: ProductDetail) {
  const amountMinimum = cents(product.minOrderAmount);
  const listPrice = cents(product.price);
  const amountQuantity = amountMinimum > 0 && listPrice > 0 ? Math.ceil(amountMinimum / listPrice) : 1;
  return Math.max(product.minBuy, amountQuantity);
}

export default function ProductPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { copy, lang } = useI18n();
  const t = copy.product;
  const [p, setP] = useState<ProductDetail | null>(null);
  const [qty, setQty] = useState(1);
  const [contact, setContact] = useState(() => (isMemberLoggedIn() ? memberInfo()?.email : "") || recalledContact());
  const [queryPassword, setQueryPassword] = useState("");
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [memberPrice, setMemberPrice] = useState<PriceQuote | null>(null);
  const [priceError, setPriceError] = useState("");
  const [priceReload, setPriceReload] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [discount, setDiscount] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const handleCaptchaToken = useCallback((token: string) => {
    setCaptchaToken(token);
    if (token) {
      setError((current) => current === "请先完成人机验证" ? "" : current);
    }
  }, []);
  const handleCaptchaEnabled = useCallback((enabled: boolean) => setCaptchaEnabled(enabled), []);

  useEffect(() => {
    let alive = true;
    setP(null);
    get<ProductDetail>(`/store/products/${id}`)
      .then((d) => {
        if (!alive) return;
        setP(d);
        setQty(effectiveMinimumQuantity(d));
      })
      .catch((e) => { if (alive) setError(e.message); });
    // 已登录会员自动带入邮箱,下单同时计入账号(供推广返佣与订单归属)
    if (isMemberLoggedIn()) {
      const m = memberInfo();
      if (m?.email) setContact(m.email);
    }
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    let alive = true;
    setPriceError("");
    const request = isMemberLoggedIn() ? mGet : get;
    const timer = window.setTimeout(() => {
      request<PriceQuote>(`/store/products/${id}/member-price`, { quantity: qty })
        .then((quote) => { if (alive) setMemberPrice({ ...quote, productId: id!, quantity: qty }); })
        .catch(() => { if (alive) setPriceError(lang === "zh" ? "价格加载失败，请重试" : "Could not load price. Retry."); });
    }, 150);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [id, qty, priceReload, lang]);

  const couponRequestKey = useRef("");
  couponRequestKey.current = `${id}:${qty}:${couponCode}:${memberPrice?.unitPrice}`;
  const quoteReady = String(p?.id) === id && memberPrice?.productId === id && memberPrice?.quantity === qty && !priceError;

  useEffect(() => {
    setDiscount(null);
    setCouponMsg("");
  }, [id, qty, couponCode, memberPrice]);

  useStorePageLoading(!error && String(p?.id ?? "") !== String(id ?? ""));

  useSeo(p ? {
    title: p.name,
    description: p.brief || p.description || p.name,
    type: "website",
    canonical: `${window.location.origin}/product/${p.id}`,
  } : undefined);

  if (!p) {
    return <div className="card grid place-items-center py-24 text-ink/40">{error || copy.common.loading}</div>;
  }

  const shownUnitPrice = memberPrice?.unitPrice ?? p.price;
  const effectiveMinBuy = effectiveMinimumQuantity(p);
  const minimumOrderAmount = cents(p.minOrderAmount);
  const meetsMinimumOrderAmount = cents(p.price) * qty >= minimumOrderAmount;
  const base = Number(shownUnitPrice) * qty;
  const total = (discount ? base - Number(discount) : base).toFixed(2);
  const isManual = p.deliveryMode === "MANUAL";
  const manualFormFields = isManual ? parseManualFields(p.manualFormSchema) : [];
  const isPresale = p.deliveryMode === "PRESALE_VOUCHER";
  const presaleSaleEndAt = p.presaleSaleEndAt ?? p.presaleEndAt;
  const presaleEnded = isPresale && presaleSaleEndAt != null && new Date(presaleSaleEndAt).getTime() <= Date.now();
  const memberLocked = isMemberLoggedIn();
  const fmtTime = (s: string | null) => s ? new Date(s).toLocaleString() : t.tba;

  async function checkCoupon() {
    if (!quoteReady) return;
    const key = couponRequestKey.current;
    setCouponMsg("");
    try {
      const request = isMemberLoggedIn() ? mPost : post;
      const r = await request<{ discount: string; finalAmount: string }>("/store/coupon-check", {
        code: couponCode.trim(),
        productId: p!.id,
        quantity: qty,
      });
      if (key !== couponRequestKey.current) return;
      setDiscount(String(r.discount));
      setCouponMsg(`${t.discount} ${money(r.discount)}`);
    } catch (e) {
      if (key !== couponRequestKey.current) return;
      setDiscount(null);
      setCouponMsg(e instanceof ApiError ? e.message : "Check failed");
    }
  }

  async function submit() {
    if (!quoteReady) return;
    setError("");
    if (!meetsMinimumOrderAmount) {
      setError(`该商品最低订购金额为 ${money(p!.minOrderAmount)}，请增加购买数量`);
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.trim())) {
      setError(t.emailError);
      return;
    }
    if (isManual) {
      const missing = manualFormFields.find((field) => field.required && !(manualValues[field.key] ?? "").trim());
      if (missing) { setError(`请填写${missing.label}`); return; }
    }
    if (presaleEnded) {
      setError(t.presaleEndedError);
      return;
    }
    if (captchaEnabled && !captchaToken) {
      setError("请先完成人机验证");
      return;
    }
    setSubmitting(true);
    try {
      // 会员登录态下走会员客户端(携带会员 JWT),订单自动关联账号
      const create = isMemberLoggedIn() ? mPost : post;
      const r = await create<CreateOrderResponse>("/orders", {
        productId: p!.id,
        quantity: qty,
        contact: contact.trim(),
        queryPassword: queryPassword || undefined,
        couponCode: couponCode.trim() || undefined,
        useWallet: false,
        buyerNote: isManual ? JSON.stringify(manualValues) : undefined,
      }, { headers: captchaHeaders(captchaToken) });
      rememberContact(contact);
      // 本机留存订单凭证:查单页可一键带出,免翻邮箱
      rememberOrder({
        orderNo: r.orderNo, contact: contact.trim(), productName: p!.name,
        amount: String(r.amount ?? total), createdAt: new Date().toISOString(), queryToken: r.queryToken,
      });
      nav(`/pay/${r.orderNo}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.orderFailed);
    } finally {
      setCaptchaToken("");
      setCaptchaResetKey((x) => x + 1);
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <button onClick={() => nav(-1)} className="mb-6 flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={15} /> {copy.common.back}
      </button>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="card p-7 md:p-9">
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{p.name}</h1>
          {p.brief && <p className="mt-2.5 text-sm leading-relaxed text-ink/55">{p.brief}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="text-4xl font-extrabold tracking-tight">
              <span className="text-[1rem] font-semibold text-ink/40">{currencySymbol()}</span>
              {shownUnitPrice}
            </span>
            {memberPrice && Number(memberPrice.discountPerUnit) > 0 && (
              <span className="chip !text-sky-600 dark:!text-sky-400">
                {memberPrice.source === "WHOLESALE" ? (lang === "zh" ? "批发价" : "Wholesale") : `${memberPrice.levelName ?? "Member"} ${t.memberPrice}`} · {t.saved} {money((Number(memberPrice.discountPerUnit) * qty).toFixed(2))}
              </span>
            )}
            {p.soldQuantity != null && <span className="chip">{lang === "zh" ? `已售 ${p.soldQuantity.toLocaleString()} 件` : `${p.soldQuantity.toLocaleString()} sold`}</span>}
            <span className={`chip ${isManual || isPresale || p.stock > 0 ? "!text-primary" : "!text-red-500"}`}>
              {presaleEnded ? copy.common.presaleEnded : isPresale ? t.presaleVoucher : isManual ? copy.common.manualDelivery : p.stock > 0 ? `${t.inStock} · ${p.stock}` : copy.common.soldOut}
            </span>
          </div>
          {!!memberPrice?.wholesaleTiers?.length && <div className="mt-5 rounded-2xl bg-accent-soft p-4">
            <h3 className="text-sm font-bold">{lang === "zh" ? "可享批发价" : "Volume pricing"}</h3>
            <div className="mt-2 flex flex-wrap gap-2">{memberPrice.wholesaleTiers.map((tier, i) => <span key={i} className="rounded-xl bg-surface px-3 py-2 text-xs text-ink/70">
              {lang === "zh" ? `${tier.minQuantity} 件起` : `${tier.minQuantity}+ units`} · {money(tier.unitPrice)} / {lang === "zh" ? "件" : "unit"}
            </span>)}</div>
            <p className="mt-2 text-xs text-ink/55">{lang === "zh" ? "按购买数量自动取适用最低单价，与会员价不重复打折。" : "The lowest eligible unit price applies; member discounts are not stacked."}</p>
          </div>}
          {p.description && (
            <div className="mt-7 whitespace-pre-wrap border-t border-ink/[0.06] pt-6 text-sm leading-relaxed text-ink/60">
              {p.description}
            </div>
          )}
        </div>

        <div className="card h-fit p-6 md:p-7 lg:sticky lg:top-24">
          <h2 className="mb-5 font-bold">{t.orderInfo}</h2>
          <div className="mb-1.5 flex h-5 items-center justify-between gap-3">
            <label className="label !mb-0 shrink-0">{t.qty}({effectiveMinBuy} ~ {p.maxBuy})</label>
            <p role="status" className="flex min-w-0 items-center justify-end gap-2 text-xs text-ink/50">
              <span className="truncate">{priceError || (!quoteReady ? (lang === "zh" ? "正在更新价格…" : "Updating price…") : "")}</span>
              {priceError && <button type="button" className="shrink-0 underline" onClick={() => setPriceReload(v => v + 1)}>{lang === "zh" ? "重试" : "Retry"}</button>}
            </p>
          </div>
          <div className="mb-4 flex items-center gap-2">
            <button aria-label={t.qty + " −"} disabled={qty <= effectiveMinBuy} className="btn-ghost shrink-0 !px-3.5 !py-2.5" onClick={() => setQty(Math.max(effectiveMinBuy, qty - 1))}><Minus size={14} /></button>
            <input
              inputMode="numeric" aria-label={t.qty}
              className="input !w-20 shrink-0 text-center"
              value={qty}
              onChange={(e) => {
                const v = parseInt(e.target.value || "0", 10);
                if (!Number.isNaN(v)) setQty(Math.min(p.maxBuy, Math.max(effectiveMinBuy, v)));
              }}
            />
            <button aria-label={t.qty + " +"} disabled={qty >= p.maxBuy} className="btn-ghost shrink-0 !px-3.5 !py-2.5" onClick={() => setQty(Math.min(p.maxBuy, qty + 1))}><Plus size={14} /></button>
          </div>
          {minimumOrderAmount > 0 && (
            <p className="-mt-2 mb-4 rounded-2xl bg-accent-soft/60 px-3.5 py-2.5 text-xs leading-relaxed text-ink/55">
              起购要求：至少 {p.minBuy} 件，且商品标价小计满 <span className="font-bold text-primary">{money(p.minOrderAmount)}</span>。会员价与优惠券不影响起购资格。
            </p>
          )}
          <label className="label">{t.contact}</label>
          <div className="relative mb-4">
            <Mail size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />
            <input
              className={`input !pl-11 ${memberLocked ? "cursor-not-allowed bg-ink/[0.04] text-ink/45 focus:ring-0" : ""}`}
              type="email" autoComplete="email" inputMode="email" aria-label={t.contact}
              placeholder="you@example.com"
              value={contact}
              readOnly={memberLocked}
              aria-readonly={memberLocked}
              title={memberLocked ? t.memberEmailTitle : undefined}
              onChange={(e) => !memberLocked && setContact(e.target.value)}
            />
          </div>
          {memberLocked && <p className="-mt-2 mb-4 text-[11px] text-ink/35">{t.memberEmailLocked}</p>}
          <label className="label">{t.queryPassword}</label>
          <input className="input mb-4" type="password" autoComplete="new-password" aria-label={t.queryPassword} placeholder={t.optional} value={queryPassword} onChange={(e) => setQueryPassword(e.target.value)} />
          {isManual && (
            <div className="mb-4 rounded-2xl border border-sky-500/15 bg-sky-500/[0.06] p-4">
              <label className="label flex items-center gap-1.5"><Wrench size={13} /> 人工交付资料</label>
              {p.manualPrompt && <p className="mb-4 whitespace-pre-wrap rounded-xl bg-surface/70 px-3 py-2.5 text-xs leading-relaxed text-ink/55">{p.manualPrompt}</p>}
              <div className="space-y-3">
                {manualFormFields.map((field) => <div key={field.key}>
                  <label className="label">{field.label}{field.required ? <span className="ml-1 text-red-500">*</span> : <span className="ml-1 font-normal text-ink/30">选填</span>}</label>
                  {field.type === "SELECT" ? (
                    <select className="input" value={manualValues[field.key] ?? ""}
                      onChange={(e) => setManualValues({ ...manualValues, [field.key]: e.target.value })}>
                      <option value="">请选择</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : field.type === "TEXTAREA" ? (
                    <textarea className="input min-h-[96px] resize-none" placeholder={field.placeholder}
                      value={manualValues[field.key] ?? ""} onChange={(e) => setManualValues({ ...manualValues, [field.key]: e.target.value })} />
                  ) : (
                    <input className="input" type={field.type === "EMAIL" ? "email" : "text"} placeholder={field.placeholder}
                      value={manualValues[field.key] ?? ""} onChange={(e) => setManualValues({ ...manualValues, [field.key]: e.target.value })} />
                  )}
                </div>)}
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink/40"><ShieldCheck size={12} className="mt-0.5 shrink-0" /> 请勿填写支付密码、验证码或私钥。</p>
            </div>
          )}
          {isPresale && (
            <div className="mb-4 rounded-2xl border border-primary/15 bg-accent-soft/70 p-4">
              <label className="label flex items-center gap-1.5"><KeyRound size={13} /> {t.presaleRule}</label>
              <div className="space-y-2 text-xs leading-relaxed text-ink/58">
                <p>{t.presaleText1}</p>
                <p>{t.presaleText2}</p>
                <p className="flex items-center gap-1.5 font-medium text-ink/70"><Clock3 size={13} /> {t.presaleSaleEnd}: {fmtTime(presaleSaleEndAt)}</p>
                <p className="flex items-center gap-1.5 font-medium text-ink/70"><Clock3 size={13} /> {t.presaleStart}: {fmtTime(p.presaleStartAt)}</p>
                <p className="flex items-center gap-1.5 font-medium text-ink/70"><Clock3 size={13} /> {t.presaleEnd}: {fmtTime(p.presaleEndAt)}</p>
              </div>
            </div>
          )}
          <details className="mt-2"><summary className="cursor-pointer text-sm text-ink/60">{t.coupon}</summary>
          <div className="pt-3">
          <div className="mb-1 flex gap-2">
            <input className="input flex-1 uppercase" aria-label={t.coupon} placeholder="COUPON" value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)} />
            <button className="btn-ghost shrink-0" disabled={!quoteReady || !couponCode.trim()} onClick={checkCoupon}>
              <BadgePercent size={14} /> {copy.common.verify}
            </button>
          </div>
          {couponMsg && (
            <p className={`mb-2 text-xs ${discount ? "text-primary" : "text-red-500"}`}>{couponMsg}</p>
          )}
          </div></details>
          <div className="mb-4 mt-4 space-y-1.5 border-t border-ink/[0.06] pt-4">
            {discount && (
              <div className="flex items-center justify-between text-xs text-ink/50">
                <span>{t.discount}</span><span className="font-medium text-primary">-{money(discount)}</span>
              </div>
            )}
            {memberPrice && Number(memberPrice.discountPerUnit) > 0 && (
              <div className="flex items-center justify-between text-xs text-ink/50">
                <span>{t.memberDiscount}</span><span className="font-medium text-sky-600 dark:text-sky-400">-{money((Number(memberPrice.discountPerUnit) * qty).toFixed(2))}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink/50">{t.total}</span>
              <span className="text-3xl font-extrabold tracking-tight">{money(total)}</span>
            </div>
          </div>
          {error && <p role="alert" className="mb-3 text-xs text-red-500">{error}</p>}
          <CaptchaBox
            action="order_create"
            onToken={handleCaptchaToken}
            onEnabledChange={handleCaptchaEnabled}
            resetKey={captchaResetKey}
          />
          <button className="btn-primary w-full !py-3.5" disabled={!quoteReady || submitting || presaleEnded || !meetsMinimumOrderAmount || (!isManual && !isPresale && p.stock <= 0)} onClick={submit}>
            {submitting ? t.creating : presaleEnded ? copy.common.presaleEnded : t.buyNow}
          </button>
          <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-ink/35">
            <ShieldCheck size={12} /> {isPresale ? t.presaleHint : isManual ? t.manualHint : t.autoHint}
          </p>
        </div>
      </div>
    </div>
  );
}
