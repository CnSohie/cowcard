import SecretBlock from "../../components/SecretBlock";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, KeyRound, Loader2, Mail, ShieldCheck, TicketCheck } from "lucide-react";
import { ApiError } from "../../lib/api";
import { isMemberLoggedIn, memberInfo, mPost } from "../../lib/memberApi";
import { useI18n } from "../../lib/i18n";
import { CaptchaBox, captchaHeaders } from "../../lib/captcha";

interface RedeemResult {
  status: "FULFILLED" | "REDEEMED" | string;
  message: string;
  cards: string[];
  workNo: string;
}

export default function RedeemPage() {
  const { copy: ui, lang } = useI18n();
  const t = ui.redeem;
  const [token, setToken] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const memberLoggedIn = isMemberLoggedIn();
  const member = memberLoggedIn ? memberInfo() : null;
  const memberLocked = !!member?.email;
  const handleCaptchaToken = useCallback((token: string) => {
    setCaptchaToken(token);
    if (token) {
      setError((current) => current === "请先完成人机验证" ? "" : current);
    }
  }, []);
  const handleCaptchaEnabled = useCallback((enabled: boolean) => setCaptchaEnabled(enabled), []);

  useEffect(() => {
    if (member?.email) setContact(member.email);
  }, [member?.email]);

  async function redeem() {
    setBusy(true);
    setError("");
    setResult(null);
    if (!memberLoggedIn) {
      setError(t.loginFirst);
      setBusy(false);
      return;
    }
    if (captchaEnabled && !captchaToken) {
      setError("请先完成人机验证");
      setBusy(false);
      return;
    }
    try {
      setResult(await mPost<RedeemResult>("/member/presale/redeem", {
        token: token.trim(),
        contact: contact.trim() || undefined,
      }, { headers: captchaHeaders(captchaToken) }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.failed);
    } finally {
      setCaptchaToken("");
      setCaptchaResetKey((x) => x + 1);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <div className="mb-5">
        <p className="chip w-fit !text-primary"><TicketCheck size={13} /> Timed Delivery Protocol</p>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{t.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/55">
          {t.intro}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="card p-6 md:p-7">
          {!memberLoggedIn && (
            <div className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-700 dark:text-amber-300">
              {t.loginRequired}
              <div className="mt-3 flex gap-2">
                <Link to="/login" className="btn-primary !px-4 !py-2 text-xs">{ui.nav.login}</Link>
                <Link to="/register" className="btn-ghost !px-4 !py-2 text-xs">{t.register}</Link>
              </div>
            </div>
          )}
          <label className="label flex items-center gap-1.5"><KeyRound size={13} /> {t.token}</label>
          <input
            className="input mb-4 font-mono"
            placeholder="PV-..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <label className="label">{t.contact}</label>
          <div className="relative mb-4">
            {memberLocked && <Mail size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />}
            <input
              className={`input ${memberLocked ? "!pl-11 cursor-not-allowed bg-ink/[0.04] text-ink/45 focus:ring-0" : ""}`}
              placeholder={t.contactPh}
              value={contact}
              readOnly={memberLocked}
              aria-readonly={memberLocked}
              title={memberLocked ? t.lockedHint : undefined}
              onChange={(e) => !memberLocked && setContact(e.target.value)}
            />
          </div>
          {memberLocked && <p className="-mt-2 mb-4 text-[11px] text-ink/35">{t.lockedHint}</p>}
          {error && <p className="mb-3 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}
          <CaptchaBox
            action="presale_redeem"
            onToken={handleCaptchaToken}
            onEnabledChange={handleCaptchaEnabled}
            resetKey={captchaResetKey}
          />
          <button className="btn-primary w-full !py-3.5" disabled={busy || !memberLoggedIn || !token.trim()} onClick={redeem}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : t.submit}
          </button>
        </div>

        <div className="card h-fit p-5">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-bold"><ShieldCheck size={14} /> {t.how}</p>
          <div className="space-y-2 text-xs leading-relaxed text-ink/55">
            {t.howItems.map((item) => <p key={item}>{item}</p>)}
          </div>
        </div>
      </div>

      {result && (
        <div className="card mt-5 p-6 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-bold">
              <CheckCircle2 size={18} className="text-primary" /> {result.message}
            </h2>
            <span className="chip font-mono">{result.workNo}</span>
          </div>
          {result.cards.length > 0 ? (
            <div className="mt-5 space-y-2">
              {result.cards.map((c, i) => (
                <SecretBlock key={i} value={c} label={`${lang === "zh" ? "卡密" : "Card"} ${i + 1}`} />
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-600 dark:text-amber-400">
              {t.queued}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
