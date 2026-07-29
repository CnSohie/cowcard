import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Gift, KeyRound, Loader2, Mail, UserRound, Zap } from "lucide-react";
import { ApiError } from "../../lib/api";
import { isMemberLoggedIn, memberLogin, memberRegister } from "../../lib/memberApi";

/** 会员登录 / 注册:双 Tab 切换,支持 ?ref= 邀请码预填与 ?redirect= 回跳。 */
export default function MemberAuth() {
  const nav = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const redirect = params.get("redirect") || "/me";
  const refCode = params.get("ref") || "";

  const [mode, setMode] = useState<"login" | "register">(
    location.pathname === "/register" || refCode ? "register" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [ref, setRef] = useState(refCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isMemberLoggedIn()) nav(redirect, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setError("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("请输入正确的邮箱地址");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 位");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await memberLogin(email.trim(), password);
      else await memberRegister(email.trim(), password, nickname.trim() || undefined, ref.trim() || undefined);
      nav(redirect, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "操作失败,请稍后再试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md animate-fade-up py-6 sm:py-10">
      <div className="card p-7 sm:p-9">
        {/* 品牌 */}
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-primary shadow-lg">
            <Zap size={19} strokeWidth={2.5} className="text-accent dark:text-primary-contrast" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">{mode === "login" ? "欢迎回来" : "创建账户"}</h1>
            <p className="mt-1 text-xs text-ink/45">
              {mode === "login" ? "登录后管理余额、订单与已购内容" : "注册即开通平台余额钱包,可购付费文章、赚推广佣金"}
            </p>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-ink/[0.05] p-1">
          {(["login", "register"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(""); }}
              className={`rounded-full py-2 text-sm font-semibold transition ${
                mode === m ? "bg-surface text-ink shadow" : "text-ink/45 hover:text-ink"
              }`}>
              {m === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        {/* 表单 */}
        <div className="space-y-4">
          <div>
            <label className="label">邮箱</label>
            <div className="relative">
              <Mail size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />
              <input className="input !pl-11" placeholder="you@example.com" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">密码</label>
            <div className="relative">
              <KeyRound size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />
              <input className="input !pl-11" type="password" placeholder={mode === "register" ? "至少 6 位" : "••••••••"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()} />
            </div>
          </div>
          {mode === "register" && (
            <>
              <div>
                <label className="label">昵称(可选)</label>
                <div className="relative">
                  <UserRound size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />
                  <input className="input !pl-11" placeholder="怎么称呼你" value={nickname}
                    onChange={(e) => setNickname(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">邀请码(可选)</label>
                <div className="relative">
                  <Gift size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />
                  <input className="input !pl-11 uppercase" placeholder="好友的邀请码" value={ref}
                    onChange={(e) => setRef(e.target.value)} />
                </div>
                {refCode && <p className="mt-1.5 text-[11px] text-primary">已自动填入好友邀请码</p>}
              </div>
            </>
          )}
        </div>

        {error && <p className="mt-4 text-xs text-red-500">{error}</p>}

        <button className="btn-primary mt-6 w-full !py-3.5" disabled={busy} onClick={submit}>
          {busy ? <><Loader2 size={15} className="animate-spin" /> 请稍候…</> : mode === "login" ? "登 录" : "注册并登录"}
        </button>

        <p className="mt-5 text-center text-xs text-ink/40">
          {mode === "login" ? (
            <>还没有账户?<button className="font-semibold text-primary" onClick={() => setMode("register")}>立即注册</button></>
          ) : (
            <>已有账户?<button className="font-semibold text-primary" onClick={() => setMode("login")}>直接登录</button></>
          )}
        </p>
      </div>
      <p className="mt-5 text-center text-[11px] text-ink/35">
        游客也可直接下单购买商品,<Link to="/order" className="underline">凭订单号查询</Link>
      </p>
    </div>
  );
}
