import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Zap } from "lucide-react";
import { ApiError, post, setTokens } from "../../lib/api";

interface TokenResponse {
  accessToken: string; refreshToken: string; username: string;
  nickname: string | null; authorities: string[];
}

export default function AdminLogin() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function login() {
    setBusy(true);
    setError("");
    try {
      const r = await post<TokenResponse>("/auth/login", {
        username, password, totpCode: totpCode || undefined,
      });
      setTokens(r.accessToken, r.refreshToken);
      localStorage.setItem("ka.auth", JSON.stringify(r.authorities));
      localStorage.setItem("ka.user", r.nickname || r.username);
      nav("/admin");
    } catch (e) {
      if (e instanceof ApiError && e.code === 1005) {
        setNeedTotp(true);
        setError("该账户已启用两步验证,请输入动态码");
      } else {
        setError(e instanceof ApiError ? e.message : "登录失败");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="card w-full max-w-sm animate-fade-up p-8">
        <div className="mb-7 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-primary">
            <Zap size={18} strokeWidth={2.5} className="text-accent dark:text-primary-contrast" />
          </span>
          <div>
            <h1 className="font-extrabold tracking-tight">Ka 管理后台</h1>
            <p className="text-xs text-ink/40">Merchant Console</p>
          </div>
        </div>
        <label className="label">用户名</label>
        <input className="input mb-3" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <label className="label">密码</label>
        <input className="input mb-4" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && login()} />
        {needTotp && (
          <>
            <label className="label">两步验证动态码</label>
            <input className="input mb-4 text-center font-mono tracking-widest" maxLength={6}
              value={totpCode} autoFocus
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && login()} />
          </>
        )}
        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
        <button className="btn-primary w-full !py-3.5" disabled={busy || !username || !password} onClick={login}>
          <Lock size={15} /> {busy ? "登录中…" : "登 录"}
        </button>
        <p className="mt-4 text-center text-[11px] text-ink/35">连续失败 5 次将临时锁定 15 分钟</p>
      </div>
    </div>
  );
}
