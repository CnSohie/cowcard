import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BadgePercent, Clock3, KeyRound, Mail, Minus, Plus, ShieldCheck, Wrench } from "lucide-react";
import { ApiError, get, post, type CreateOrderResponse, type ProductDetail } from "../../lib/api";
import { isMemberLoggedIn, mGet, mPost, memberInfo } from "../../lib/memberApi";
import { rememberOrder } from "../../lib/orderHistory";
import { currencySymbol, money } from "../../lib/currency";
import { useSeo } from "../../lib/seo";

export default function ProductPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState<ProductDetail | null>(null);
  const [qty, setQty] = useState(1);
  const [contact, setContact] = useState("");
  const [queryPassword, setQueryPassword] = useState("");
  const [buyerNote, setBuyerNote] = useState("");
  const [memberPrice, setMemberPrice] = useState<{ unitPrice: string; discountPerUnit: string; levelName: string | null; source: string } | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [discount, setDiscount] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    get<ProductDetail>(`/store/products/${id}`)
      .then((d) => {
        setP(d);
        setQty(d.minBuy);
      })
      .catch((e) => setError(e.message));
    // 已登录会员自动带入邮箱,下单同时计入账号(供推广返佣与订单归属)
    if (isMemberLoggedIn()) {
      const m = memberInfo();
      if (m?.email) setContact((c) => c || m.email);
      mGet<{ unitPrice: string; discountPerUnit: string; levelName: string | null; source: string }>(`/store/products/${id}/member-price`)
        .then(setMemberPrice).catch(() => void 0);
    }
  }, [id]);

  useEffect(() => {
    setDiscount(null);
    setCouponMsg("");
  }, [qty, couponCode]);

  useSeo(p ? {
    title: p.name,
    description: p.brief || p.description || p.name,
    type: "website",
    canonical: `${window.location.origin}/product/${p.id}`,
  } : undefined);

  if (!p) {
    return <div className="card grid place-items-center py-24 text-ink/40">{error || "加载中…"}</div>;
  }

  const shownUnitPrice = memberPrice?.unitPrice ?? p.price;
  const base = Number(shownUnitPrice) * qty;
  const total = (discount ? base - Number(discount) : base).toFixed(2);
  const isManual = p.deliveryMode === "MANUAL";
  const isPresale = p.deliveryMode === "PRESALE_VOUCHER";
  const presaleEnded = isPresale && p.presaleEndAt != null && new Date(p.presaleEndAt).getTime() <= Date.now();
  const memberLocked = isMemberLoggedIn();
  const fmtTime = (s: string | null) => s ? new Date(s).toLocaleString() : "商家另行公告";

  async function checkCoupon() {
    setCouponMsg("");
    try {
      const r = await post<{ discount: string; finalAmount: string }>("/store/coupon-check", {
        code: couponCode.trim(),
        productId: p!.id,
        quantity: qty,
      });
      setDiscount(String(r.discount));
      setCouponMsg(`已抵扣 ${money(r.discount)}`);
    } catch (e) {
      setDiscount(null);
      setCouponMsg(e instanceof ApiError ? e.message : "校验失败");
    }
  }

  async function submit() {
    setError("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) {
      setError("请输入正确的邮箱,用于接收与查询订单");
      return;
    }
    if (isManual && !buyerNote.trim()) {
      setError("请填写人工发货所需信息");
      return;
    }
    if (presaleEnded) {
      setError("该商品预售期已结束,不可继续下单");
      return;
    }
    setSubmitting(true);
    try {
      // 会员登录态下走会员客户端(携带会员 JWT),订单自动关联账号
      const create = isMemberLoggedIn() ? mPost : post;
      const r = await create<CreateOrderResponse>("/orders", {
        productId: p!.id,
        quantity: qty,
        contact,
        queryPassword: queryPassword || undefined,
        couponCode: couponCode.trim() || undefined,
        useWallet: false,
        buyerNote: isManual ? buyerNote.trim() : undefined,
      });
      // 本机留存订单凭证:查单页可一键带出,免翻邮箱
      rememberOrder({
        orderNo: r.orderNo, contact: contact.trim(), productName: p!.name,
        amount: String(r.amount ?? total), createdAt: new Date().toISOString(), queryToken: r.queryToken,
        presaleVoucherToken: r.presaleVoucherToken ?? undefined,
      });
      nav(`/pay/${r.orderNo}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "下单失败,请稍后再试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <button onClick={() => nav(-1)} className="mb-6 flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={15} /> 返回
      </button>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="card p-7 md:p-9">
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{p.name}</h1>
          {p.brief && <p className="mt-2.5 text-sm leading-relaxed text-ink/55">{p.brief}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="text-4xl font-extrabold tracking-tight">
              <span className="text-base font-semibold text-ink/40">{currencySymbol()}</span>
              {shownUnitPrice}
            </span>
            {memberPrice && Number(memberPrice.discountPerUnit) > 0 && (
              <span className="chip !text-sky-600 dark:!text-sky-400">
                {memberPrice.levelName ?? "会员"}价 · 已省 {money((Number(memberPrice.discountPerUnit) * qty).toFixed(2))}
              </span>
            )}
            <span className={`chip ${isManual || isPresale || p.stock > 0 ? "!text-primary" : "!text-red-500"}`}>
              {presaleEnded ? "预售结束" : isPresale ? "预售 · 电子提货码" : isManual ? "人工发货" : p.stock > 0 ? `库存充足 · ${p.stock}` : "已售罄"}
            </span>
          </div>
          {p.description && (
            <div className="mt-7 whitespace-pre-wrap border-t border-ink/[0.06] pt-6 text-sm leading-relaxed text-ink/60">
              {p.description}
            </div>
          )}
        </div>

        <div className="card h-fit p-6 md:p-7">
          <h2 className="mb-5 font-bold">下单信息</h2>
          <label className="label">购买数量({p.minBuy} ~ {p.maxBuy})</label>
          <div className="mb-4 flex items-center gap-2">
            <button className="btn-ghost !px-3.5 !py-2.5" onClick={() => setQty(Math.max(p.minBuy, qty - 1))}><Minus size={14} /></button>
            <input
              className="input !w-20 text-center"
              value={qty}
              onChange={(e) => {
                const v = parseInt(e.target.value || "0", 10);
                if (!Number.isNaN(v)) setQty(Math.min(p.maxBuy, Math.max(p.minBuy, v)));
              }}
            />
            <button className="btn-ghost !px-3.5 !py-2.5" onClick={() => setQty(Math.min(p.maxBuy, qty + 1))}><Plus size={14} /></button>
          </div>
          <label className="label">联系邮箱(接收/查询订单凭证)</label>
          <div className="relative mb-4">
            <Mail size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />
            <input
              className={`input !pl-11 ${memberLocked ? "cursor-not-allowed bg-ink/[0.04] text-ink/45 focus:ring-0" : ""}`}
              placeholder="you@example.com"
              value={contact}
              readOnly={memberLocked}
              aria-readonly={memberLocked}
              title={memberLocked ? "登录会员下单时固定使用账号邮箱" : undefined}
              onChange={(e) => !memberLocked && setContact(e.target.value)}
            />
          </div>
          {memberLocked && <p className="-mt-2 mb-4 text-[11px] text-ink/35">已登录会员将使用账号邮箱创建订单。</p>}
          <label className="label">查询密码(可选,至少 6 位)</label>
          <input className="input mb-4" type="password" placeholder="选填" value={queryPassword} onChange={(e) => setQueryPassword(e.target.value)} />
          {isManual && (
            <div className="mb-4 rounded-2xl border border-ink/[0.07] bg-accent-soft/55 p-4">
              <label className="label flex items-center gap-1.5"><Wrench size={13} /> 人工发货信息</label>
              {p.manualPrompt && <p className="mb-3 whitespace-pre-wrap text-xs leading-relaxed text-ink/55">{p.manualPrompt}</p>}
              <textarea
                className="input min-h-[112px] resize-none text-sm leading-relaxed"
                placeholder="请填写账号、区服、收货说明或其他业务信息"
                value={buyerNote}
                onChange={(e) => setBuyerNote(e.target.value)}
              />
            </div>
          )}
          {isPresale && (
            <div className="mb-4 rounded-2xl border border-primary/15 bg-accent-soft/70 p-4">
              <label className="label flex items-center gap-1.5"><KeyRound size={13} /> 预售提货码规则</label>
              <div className="space-y-2 text-xs leading-relaxed text-ink/58">
                <p>支付后系统签发一枚电子预售提货码,原始码只展示一次;数据库仅保存 SHA-256 哈希,不保存明文。</p>
                <p>提货码是无记名凭证:谁持有码,谁可以登录会员后在提货兑换中心提前核销。核销后凭证立即销毁并绑定当前会员。</p>
                <p className="flex items-center gap-1.5 font-medium text-ink/70"><Clock3 size={13} /> 开放提货: {fmtTime(p.presaleStartAt)}</p>
                <p className="flex items-center gap-1.5 font-medium text-ink/70"><Clock3 size={13} /> 最晚截止: {fmtTime(p.presaleEndAt)}</p>
              </div>
            </div>
          )}
          <label className="label">优惠码(可选)</label>
          <div className="mb-1 flex gap-2">
            <input className="input flex-1 uppercase" placeholder="COUPON" value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)} />
            <button className="btn-ghost shrink-0" disabled={!couponCode.trim()} onClick={checkCoupon}>
              <BadgePercent size={14} /> 校验
            </button>
          </div>
          {couponMsg && (
            <p className={`mb-2 text-xs ${discount ? "text-primary" : "text-red-500"}`}>{couponMsg}</p>
          )}
          <div className="mb-4 mt-4 space-y-1.5 border-t border-ink/[0.06] pt-4">
            {discount && (
              <div className="flex items-center justify-between text-xs text-ink/50">
                <span>优惠抵扣</span><span className="font-medium text-primary">-{money(discount)}</span>
              </div>
            )}
            {memberPrice && Number(memberPrice.discountPerUnit) > 0 && (
              <div className="flex items-center justify-between text-xs text-ink/50">
                <span>会员优惠</span><span className="font-medium text-sky-600 dark:text-sky-400">-{money((Number(memberPrice.discountPerUnit) * qty).toFixed(2))}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink/50">应付合计</span>
              <span className="text-3xl font-extrabold tracking-tight">{money(total)}</span>
            </div>
          </div>
          {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
          <button className="btn-primary w-full !py-3.5" disabled={submitting || presaleEnded || (!isManual && !isPresale && p.stock <= 0)} onClick={submit}>
            {submitting ? "创建订单中…" : presaleEnded ? "预售已结束" : "立即购买"}
          </button>
          <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-ink/35">
            <ShieldCheck size={12} /> {isPresale ? "支付成功后获得提货码,登录会员后可提前核销并查询履约状态" : isManual ? "支付成功后由后台人工处理,请妥善保存订单号" : "支付成功后自动发货,请妥善保存订单号"}
          </p>
        </div>
      </div>
    </div>
  );
}
