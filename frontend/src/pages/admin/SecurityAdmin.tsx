import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { ApiError, get, post, setTokens } from "../../lib/api";

export default function SecurityAdmin() {
  const nav = useNavigate();
  // 修改密码
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwdMsg, setPwdMsg] = useState<[string, boolean] | null>(null);
  // 两步验证(所有管理动作先验管理员密码,防旁人利用未锁屏会话)
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [totpPwd, setTotpPwd] = useState("");
  const [code, setCode] = useState("");
  const [totpMsg, setTotpMsg] = useState("");

  function loadStatus() {
    get<{ enabled: boolean }>("/auth/totp/status").then((r) => setEnabled(r.enabled)).catch(() => void 0);
  }
  useEffect(loadStatus, []);

  async function changePassword() {
    setPwdMsg(null);
    try {
      await post("/auth/change-password", { oldPassword, newPassword });
      setTokens(null, null);
      localStorage.removeItem("ka.auth");
      alert("密码已修改,请重新登录");
      nav("/admin/login");
    } catch (e) {
      setPwdMsg([e instanceof ApiError ? e.message : "修改失败", false]);
    }
  }

  async function startSetup() {
    setTotpMsg("");
    try {
      setSetup(await post<{ secret: string; otpauthUri: string }>("/auth/totp/setup", { password: totpPwd }));
    } catch (e) {
      setTotpMsg(e instanceof ApiError ? e.message : "生成失败");
    }
  }

  async function enableTotp() {
    setTotpMsg("");
    try {
      await post("/auth/totp/enable", { password: totpPwd, code: code.trim() });
      setSetup(null);
      setCode("");
      setTotpPwd("");
      setTotpMsg("两步验证已启用,下次登录需输入动态码");
      loadStatus();
    } catch (e) {
      setTotpMsg(e instanceof ApiError ? e.message : "启用失败");
    }
  }

  async function disableTotp() {
    setTotpMsg("");
    try {
      await post("/auth/totp/disable", { password: totpPwd, code: code.trim() });
      setCode("");
      setTotpPwd("");
      setTotpMsg("两步验证已关闭");
      loadStatus();
    } catch (e) {
      setTotpMsg(e instanceof ApiError ? e.message : "关闭失败");
    }
  }

  return (
    <div className="max-w-2xl animate-fade-up">
      <h1 className="mb-6 text-xl font-bold">安全设置</h1>

      <div className="card mb-5 p-6">
        <h2 className="mb-4 flex items-center gap-2 font-semibold"><KeyRound size={16} /> 修改密码</h2>
        <label className="label">当前密码</label>
        <input className="input mb-3" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
        <label className="label">新密码(至少 10 位,修改后全端强制重新登录)</label>
        <input className="input mb-4" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        {pwdMsg && <p className={`mb-3 text-xs ${pwdMsg[1] ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{pwdMsg[0]}</p>}
        <button className="btn-primary" disabled={!oldPassword || newPassword.length < 10} onClick={changePassword}>修改密码</button>
      </div>

      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            {enabled ? <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400" /> : <ShieldOff size={16} className="text-ink/45" />}
            两步验证(TOTP)
          </h2>
          <span className={`chip ${enabled ? "!text-emerald-600 dark:text-emerald-400" : "!text-ink/45"}`}>
            {enabled === null ? "…" : enabled ? "已启用" : "未启用"}
          </span>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-ink/45">
          使用 Google Authenticator / 1Password 等认证器 App 扫码绑定,启用后登录与财务操作需额外输入 6 位动态码。
          绑定 / 解绑均需先验证管理员密码,防止他人利用未锁屏的登录会话操作。
        </p>

        {enabled !== null && (
          <div className="mb-4 max-w-xs">
            <label className="label">管理员密码(2FA 管理需验证)</label>
            <input className="input" type="password" autoComplete="current-password" placeholder="登录密码"
              value={totpPwd} onChange={(e) => setTotpPwd(e.target.value)} />
          </div>
        )}

        {!enabled && !setup && (
          <button className="btn-primary" disabled={!totpPwd} onClick={startSetup}>生成密钥并绑定</button>
        )}

        {!enabled && setup && (
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            <div className="shrink-0 rounded-xl bg-white p-3">
              <QRCodeSVG value={setup.otpauthUri} size={144} />
            </div>
            <div className="min-w-0 flex-1">
              <label className="label">或手动输入密钥</label>
              <code className="mb-3 block break-all rounded-lg bg-ink/[0.05] p-2.5 font-mono text-xs text-amber-300">{setup.secret}</code>
              <label className="label">输入 App 上显示的 6 位动态码完成启用</label>
              <div className="flex gap-2">
                <input className="input !w-36 text-center font-mono" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                <button className="btn-primary" disabled={code.length !== 6 || !totpPwd} onClick={enableTotp}>启用</button>
              </div>
            </div>
          </div>
        )}

        {enabled && (
          <div>
            <label className="label">输入当前动态码以关闭两步验证</label>
            <div className="flex gap-2">
              <input className="input !w-36 text-center font-mono" maxLength={6} value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              <button className="btn-ghost !text-red-500" disabled={code.length !== 6 || !totpPwd} onClick={disableTotp}>关闭</button>
            </div>
          </div>
        )}
        {totpMsg && <p className="mt-3 text-xs text-sky-600 dark:text-sky-400">{totpMsg}</p>}
      </div>
    </div>
  );
}
