import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { KeyRound, Loader2, LockKeyhole, ShieldCheck, X } from "lucide-react";
import { ApiError, get } from "../lib/api";

/**
 * 敏感操作双因子确认弹层(财务/订单/权限变更统一入口):
 * - 打开即检查 2FA 状态:未启用 → 引导前往「安全设置」开启,不允许绕过;
 * - 已启用 → 管理员密码 + 6 位动态码复核后才执行;
 * - 设计:留白、单列、无浏览器原生弹窗;错误就地显示。
 */
export interface SensitiveAction {
  title: string;        // 操作名:人工补单 / 关闭订单 / 通过提现…
  summary?: ReactNode;  // 关键信息摘要(订单号、金额等)
  confirmText?: string;
  danger?: boolean;     // 危险色确认按钮(驳回/关闭类)
}

export default function SensitiveConfirm({
  action, onConfirm, onClose, children,
}: {
  action: SensitiveAction;
  /** 校验通过后执行;抛错则就地展示错误并保持弹层。 */
  onConfirm: (auth: { password: string; totpCode: string }) => Promise<void>;
  onClose: () => void;
  children?: ReactNode; // 额外表单项(如审核备注),渲染在凭证输入之上
}) {
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);
  const [trusted, setTrusted] = useState(false);
  const [trustedUntil, setTrustedUntil] = useState("");
  const [graceMinutes, setGraceMinutes] = useState(5);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    get<{ enabled: boolean; trusted?: boolean; trustedUntil?: string; graceMinutes?: number }>("/auth/totp/status")
      .then((r) => {
        setTotpEnabled(r.enabled);
        setTrusted(!!r.trusted);
        setTrustedUntil(r.trustedUntil ?? "");
        setGraceMinutes(r.graceMinutes ?? 5);
      })
      .catch(() => setTotpEnabled(false));
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const ready = trusted || (password.length > 0 && /^\d{6}$/.test(code));

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm({ password, totpCode: code });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "操作失败,请重试");
      setCode("");
      codeRef.current?.focus();
      setBusy(false);
    }
  }

  const modal = (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/45 px-4 py-[max(16px,5dvh)] backdrop-blur-sm"
      onClick={() => !busy && onClose()}>
      <div className="card my-auto flex max-h-[calc(100dvh-32px)] w-full max-w-sm flex-col !bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-ink/[0.06] px-6 py-5">
          <div>
            <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft">
              <ShieldCheck size={22} className="text-primary" />
            </span>
            <h2 className="text-lg font-extrabold tracking-tight">{action.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink/45">敏感操作需管理员密码与两步验证动态码双重确认。</p>
          </div>
          <button onClick={onClose} disabled={busy}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/35 transition hover:bg-ink/[0.06] hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          {action.summary && (
            <div className="rounded-2xl bg-ink/[0.04] px-4 py-3.5 text-sm">{action.summary}</div>
          )}

          {totpEnabled === null && (
            <div className="grid place-items-center py-10">
              <Loader2 size={20} className="animate-spin text-ink/30" />
            </div>
          )}

          {totpEnabled === false && (
            <div className="mt-5">
              <div className="flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
                <LockKeyhole size={17} className="mt-0.5 shrink-0 text-amber-500" />
                <p className="text-[13px] leading-relaxed text-ink/70">
                  你的账号还未启用<b>两步验证(2FA)</b>。为保障资金、订单和后台权限安全,卡密管理、补单、关单、提现审核、角色调整等操作必须先完成启用。
                </p>
              </div>
              <Link to="/admin/security" className="btn-primary mt-5 w-full" onClick={onClose}>
                前往安全设置启用
              </Link>
              <button className="btn-ghost mt-2.5 w-full" onClick={onClose}>暂不操作</button>
            </div>
          )}

          {totpEnabled === true && (
            <div className="mt-5">
              {children}
              {trusted ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] p-4 text-[13px] leading-relaxed text-ink/70">
                  已完成 2FA 验证,当前 {graceMinutes} 分钟有效期内无需再次输入密码和动态码。
                  {trustedUntil && <span className="mt-1 block text-[11px] text-ink/40">有效期至 {new Date(trustedUntil).toLocaleString()}</span>}
                </div>
              ) : (
                <>
                  <label className="label">管理员密码</label>
                  <div className="relative mb-4">
                    <KeyRound size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />
                    <input className="input !pl-10" type="password" autoComplete="current-password"
                      placeholder="登录密码" value={password} autoFocus
                      onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <label className="label">动态验证码</label>
                  <input ref={codeRef}
                    className="input text-center font-mono !text-xl font-bold tracking-[0.5em]"
                    inputMode="numeric" autoComplete="one-time-code" placeholder="••••••"
                    maxLength={6} value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && submit()} />
                </>
              )}

              {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

              <button
                className={`btn-primary mt-5 w-full !py-3.5 ${action.danger ? "!bg-red-500 !text-white hover:!bg-red-600" : ""}`}
                disabled={!ready || busy} onClick={submit}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                {busy ? "验证并执行中…" : action.confirmText ?? "确认执行"}
              </button>
              <p className="mt-3 text-center text-[11px] text-ink/30">本次操作将记录审计日志</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
