import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Gift, KeyRound, Loader2, Mail, UserRound } from "lucide-react";
import SiteMark from "../../components/SiteMark";
import { ApiError } from "../../lib/api";
import { isMemberLoggedIn, memberLogin, memberRegister } from "../../lib/memberApi";
import { useI18n } from "../../lib/i18n";
import { CaptchaBox } from "../../lib/captcha";

/** 会员登录 / 注册:双 Tab 切换,支持 ?ref= 邀请码预填与 ?redirect= 回跳。 */
export default function MemberAuth() {
  const nav = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const redirect = params.get("redirect") || "/me";
  const refCode = params.get("ref") || "";
  const { copy } = useI18n();
  const t = copy.auth;

  const [mode, setMode] = useState<"login" | "register">(
    location.pathname === "/register" || refCode ? "register" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [ref, setRef] = useState(refCode);
  const [busy, setBusy] = useState(false);
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
    if (isMemberLoggedIn()) nav(redirect, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setError("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError(t.emailError);
      return;
    }
    if (password.length < 6) {
      setError(t.passwordError);
      return;
    }
    if (captchaEnabled && !captchaToken) {
      setError("请先完成人机验证");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await memberLogin(email.trim(), password, captchaToken);
      else await memberRegister(email.trim(), password, nickname.trim() || undefined, ref.trim() || undefined, captchaToken);
      nav(redirect, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.failed);
    } finally {
      setCaptchaToken("");
      setCaptchaResetKey((x) => x + 1);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md reveal-in py-6 sm:py-10">
      <div className="card p-7 sm:p-9">
        {/* 品牌 */}
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <SiteMark alt="" className="h-11 w-11 rounded-xl object-cover" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{mode === "login" ? t.welcome : t.createAccount}</h1>
            <p className="mt-1.5 text-xs text-[var(--gpt-muted)]">
              {mode === "login" ? t.loginIntro : t.registerIntro}
            </p>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-[10px] bg-[var(--gpt-secondary)] p-1">
          {(["login", "register"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(""); }}
              className={`rounded-[7px] py-2 text-xs font-medium transition ${
                mode === m ? "bg-surface text-ink shadow-sm" : "text-[var(--gpt-muted)] hover:text-ink"
              }`}>
              {m === "login" ? t.login : t.register}
            </button>
          ))}
        </div>

        {/* 表单 */}
        <div className="space-y-4">
          <div>
            <label className="label">{t.email}</label>
            <div className="relative">
              <Mail size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />
              <input className="input !pl-11" placeholder="you@example.com" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">{t.password}</label>
            <div className="relative">
              <KeyRound size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />
              <input className="input !pl-11" type="password" placeholder={mode === "register" ? t.passwordError : "••••••••"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()} />
            </div>
          </div>
          {mode === "register" && (
            <>
              <div>
                <label className="label">{t.nickname}</label>
                <div className="relative">
                  <UserRound size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />
                  <input className="input !pl-11" placeholder={t.nicknamePh} value={nickname}
                    onChange={(e) => setNickname(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">{t.invite}</label>
                <div className="relative">
                  <Gift size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />
                  <input className="input !pl-11 uppercase" placeholder={t.invitePh} value={ref}
                    onChange={(e) => setRef(e.target.value)} />
                </div>
                {refCode && <p className="mt-1.5 text-[11px] text-primary">{t.inviteFilled}</p>}
              </div>
            </>
          )}
        </div>

        {error && <p className="mt-4 text-xs text-red-500">{error}</p>}

        <CaptchaBox
          action={`member_${mode}`}
          onToken={handleCaptchaToken}
          onEnabledChange={handleCaptchaEnabled}
          resetKey={captchaResetKey}
        />

        <button className="btn-primary mt-6 w-full !py-3.5" disabled={busy} onClick={submit}>
          {busy ? <><Loader2 size={15} className="animate-spin" /> {t.busy}</> : mode === "login" ? t.loginBtn : t.registerBtn}
        </button>

        <p className="mt-5 text-center text-xs text-ink/40">
          {mode === "login" ? (
            <>{t.noAccount}<button className="font-semibold text-primary" onClick={() => setMode("register")}>{t.registerNow}</button></>
          ) : (
            <>{t.hasAccount}<button className="font-semibold text-primary" onClick={() => setMode("login")}>{t.loginNow}</button></>
          )}
        </p>
      </div>
      <p className="mt-5 text-center text-[11px] text-ink/35">
        {t.guestHint}<Link to="/order" className="underline">{t.queryByOrder}</Link>
      </p>
    </div>
  );
}
