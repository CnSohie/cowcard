import { useCallback, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import SiteMark from "../../components/SiteMark";
import { ApiError, post, setTokens } from "../../lib/api";
import { CaptchaBox, captchaHeaders } from "../../lib/captcha";

interface TokenResponse {
  accessToken: string; refreshToken: string; username: string;
  nickname: string | null; authorities: string[];
}

export default function AdminLogin() {
  const nav = useNavigate();
  const location = useLocation();
  const renamed = location.state as { username?: string; message?: string } | null;
  const [username, setUsername] = useState(renamed?.username ?? "");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
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

  async function login() {
    setBusy(true);
    setError("");
    if (captchaEnabled && !captchaToken) {
      setError("请先完成人机验证");
      setBusy(false);
      return;
    }
    try {
      const r = await post<TokenResponse>("/auth/login", {
        username, password, totpCode: totpCode || undefined,
      }, { headers: captchaHeaders(captchaToken) });
      setTokens(r.accessToken, r.refreshToken);
      localStorage.setItem("ka.auth", JSON.stringify(r.authorities));
      localStorage.setItem("ka.user", r.nickname || r.username);
      nav("/admin");
    } catch (e) {
      if (e instanceof ApiError && e.code === 1005) {
        setNeedTotp(true);
        setError("该账户已启用两步验证，请输入动态码");
      } else {
        setError(e instanceof ApiError ? e.message : "登录失败");
      }
    } finally {
      setCaptchaToken("");
      setCaptchaResetKey((x) => x + 1);
      setBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center bg-base px-5 py-12">
      <Link to="/" className="absolute left-6 top-6 inline-flex items-center gap-1.5 text-xs text-[var(--gpt-muted)] transition hover:text-ink">
        <ArrowLeft size={14} /> 返回商店
      </Link>
      <div className="w-full max-w-[390px] reveal-in">
        <div className="mb-7">
          <SiteMark alt="" className="mb-5 h-10 w-10 rounded-xl object-cover" />
          <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-ink">管理工作台</h1>
          <p className="mt-2 text-xs text-[var(--gpt-muted)]">输入管理员凭据以管理商品、订单与支付渠道。</p>
        </div>

        <div className="card p-6 sm:p-7">
          {renamed?.message && (
            <p className="mb-4 rounded-xl bg-accent-soft px-3.5 py-2.5 text-xs text-primary" role="status">{renamed.message}</p>
          )}
          <div className="space-y-3.5">
            <div>
              <label className="label">用户名</label>
              <input className="input h-11" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="label">密码</label>
              <input className="input h-11" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && login()} />
            </div>
            {needTotp && (
              <div>
                <label className="label">两步验证动态码</label>
                <input className="input h-11 text-center font-mono text-lg tracking-[0.28em]" maxLength={6}
                  value={totpCode} autoFocus placeholder="000000"
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && login()} />
              </div>
            )}
          </div>
          {error && <p className="mt-3.5 text-xs text-red-500">{error}</p>}
          <CaptchaBox
            action="admin_login"
            onToken={handleCaptchaToken}
            onEnabledChange={handleCaptchaEnabled}
            resetKey={captchaResetKey}
          />
          <button className="btn-primary mt-5 h-11 w-full" disabled={busy || !username || !password} onClick={login}>
            <Lock size={14} /> {busy ? "登录中…" : "登录工作台"}
          </button>
        </div>
        <p className="mt-5 text-center text-[11px] text-[var(--gpt-muted)]">连续失败 5 次将临时锁定 15 分钟</p>
      </div>
    </div>
  );
}
