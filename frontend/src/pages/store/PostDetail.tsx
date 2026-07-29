import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Eye, Loader2, Lock, Sparkles, Tag, Wallet } from "lucide-react";
import { ApiError } from "../../lib/api";
import { isMemberLoggedIn, mGet, mPost, type ArticleDetail } from "../../lib/memberApi";
import { renderMarkdown } from "../../lib/markdown";
import { currencySymbol, money } from "../../lib/currency";
import { useSeo } from "../../lib/seo";
import { CaptchaBox, captchaHeaders } from "../../lib/captcha";

/** 文章阅读页:handsome 风格排版(.prose-ka)+ 余额付费解锁。 */

function fmtDate(s: string | null) {
  if (!s) return "";
  const d = new Date(s);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export default function PostDetail() {
  const { slug } = useParams();
  const nav = useNavigate();
  const [a, setA] = useState<ArticleDetail | null>(null);
  const [error, setError] = useState("");
  const [buying, setBuying] = useState(false);
  const [buyErr, setBuyErr] = useState("");
  const [justUnlocked, setJustUnlocked] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const handleCaptchaToken = useCallback((token: string) => setCaptchaToken(token), []);
  const handleCaptchaEnabled = useCallback((enabled: boolean) => setCaptchaEnabled(enabled), []);

  useEffect(() => {
    setA(null);
    setError("");
    mGet<ArticleDetail>(`/posts/${slug}`).then(setA).catch((e) => setError(e instanceof ApiError ? e.message : "文章不存在"));
    window.scrollTo({ top: 0 });
  }, [slug]);

  const html = useMemo(() => renderMarkdown(a?.content), [a?.content]);
  const tags = useMemo(
    () => (a?.tags ?? "").split(/[,,\s]+/).map((t) => t.trim()).filter(Boolean),
    [a?.tags],
  );
  useSeo(a ? {
    title: a.title,
    description: a.summary || a.title,
    keywords: a.tags ?? "",
    image: a.coverImage,
    type: "article",
    canonical: `${window.location.origin}/posts/${a.slug}`,
  } : undefined);

  async function purchase() {
    if (!a) return;
    if (!isMemberLoggedIn()) {
      nav(`/login?redirect=${encodeURIComponent(`/posts/${slug}`)}`);
      return;
    }
    if (captchaEnabled && !captchaToken) {
      setBuyErr("请先完成人机验证");
      return;
    }
    setBuyErr("");
    setBuying(true);
    try {
      await mPost(`/member/articles/${a.id}/purchase`, undefined, { headers: captchaHeaders(captchaToken) });
      const fresh = await mGet<ArticleDetail>(`/posts/${slug}`);
      setA(fresh);
      setJustUnlocked(true);
    } catch (e) {
      setBuyErr(e instanceof ApiError ? e.message : "购买失败,请稍后再试");
    } finally {
      setCaptchaToken("");
      setCaptchaResetKey((x) => x + 1);
      setBuying(false);
    }
  }

  if (error) {
    return (
      <div className="card grid place-items-center gap-4 py-24 text-ink/45">
        <p>{error}</p>
        <Link to="/posts" className="btn-ghost">返回文章列表</Link>
      </div>
    );
  }
  if (!a) return <div className="card grid place-items-center py-24 text-ink/40">加载中…</div>;

  return (
    <article className="mx-auto max-w-3xl animate-fade-up">
      <button onClick={() => nav(-1)} className="mb-6 flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={15} /> 返回
      </button>

      {/* 封面 */}
      {a.coverImage && (
        <div className="mb-7 overflow-hidden rounded-3xl">
          <img src={a.coverImage} alt="" className="aspect-video w-full object-cover" />
        </div>
      )}

      {/* 标题与元信息 */}
      <header className="mb-8">
        {a.category && <p className="mb-2.5 text-xs font-bold uppercase tracking-widest text-primary">{a.category}</p>}
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">{a.title}</h1>
        {a.summary && <p className="mt-3.5 text-[15px] leading-relaxed text-ink/50">{a.summary}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink/[0.06] pb-6 text-xs text-ink/45">
          <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} /> {fmtDate(a.publishedAt)}</span>
          <span className="inline-flex items-center gap-1.5"><Eye size={13} /> {a.views} 次阅读</span>
          {Number(a.price) > 0 && (
            <span className={`inline-flex items-center gap-1.5 font-semibold ${a.purchased ? "text-primary" : "text-amber-600 dark:text-amber-400"}`}>
              <Lock size={12} /> {a.purchased ? "已购买" : `付费 ${money(a.price)}`}
            </span>
          )}
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-ink/[0.05] px-2.5 py-1"><Tag size={10} /> {t}</span>
          ))}
        </div>
      </header>

      {/* 解锁成功提示 */}
      {justUnlocked && (
        <div className="mb-6 flex items-center gap-2.5 rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          <Sparkles size={15} /> 已解锁全文,感谢支持!
        </div>
      )}

      {/* 正文 */}
      <div className="prose-ka" dangerouslySetInnerHTML={{ __html: html }} />

      {/* 付费墙 */}
      {a.locked && (
        <div className="relative mt-2">
          <div className="pointer-events-none absolute -top-24 left-0 right-0 h-24 bg-gradient-to-b from-transparent to-base" />
          <div className="overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-b from-accent-soft/70 to-accent-soft/25 p-8 text-center sm:p-10">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary shadow-lg">
              <Lock size={20} className="text-primary-contrast" />
            </span>
            <h3 className="mt-4 text-lg font-bold">以下为付费内容</h3>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink/50">
              购买后即可阅读全文,永久有效。费用将从平台余额中扣除。
            </p>
            <p className="mt-5 text-4xl font-extrabold tracking-tight">
              <span className="text-base font-semibold text-ink/40">{currencySymbol()}</span>{a.price}
            </p>
            <CaptchaBox
              action="article_purchase"
              onToken={handleCaptchaToken}
              onEnabledChange={handleCaptchaEnabled}
              resetKey={captchaResetKey}
            />
            <button className="btn-primary mx-auto mt-6 !px-8 !py-3.5" disabled={buying} onClick={purchase}>
              {buying
                ? <><Loader2 size={15} className="animate-spin" /> 处理中…</>
                : isMemberLoggedIn()
                  ? <><Wallet size={15} /> 余额支付 {money(a.price)} 解锁</>
                  : "登录后购买"}
            </button>
            {buyErr && (
              <p className="mt-3.5 text-xs text-red-500">
                {buyErr}
                {buyErr.includes("余额") && <Link to="/me" className="ml-2 font-semibold text-primary underline">去充值 →</Link>}
              </p>
            )}
            {!buyErr && isMemberLoggedIn() && (
              <p className="mt-3.5 text-[11px] text-ink/35">余额不足?可在 <Link to="/me" className="text-primary underline">会员中心</Link> 充值</p>
            )}
          </div>
        </div>
      )}

      <div className="mt-12 border-t border-ink/[0.06] pt-6 text-center">
        <Link to="/posts" className="btn-ghost">← 更多文章</Link>
      </div>
    </article>
  );
}
