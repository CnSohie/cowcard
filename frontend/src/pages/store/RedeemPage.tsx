import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Copy, KeyRound, Loader2, Mail, ShieldCheck, TicketCheck } from "lucide-react";
import { ApiError } from "../../lib/api";
import { isMemberLoggedIn, memberInfo, mPost } from "../../lib/memberApi";

interface RedeemResult {
  status: "FULFILLED" | "REDEEMED" | string;
  message: string;
  cards: string[];
  workNo: string;
}

export default function RedeemPage() {
  const [token, setToken] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [copied, setCopied] = useState(-1);
  const memberLoggedIn = isMemberLoggedIn();
  const member = memberLoggedIn ? memberInfo() : null;
  const memberLocked = !!member?.email;

  useEffect(() => {
    if (member?.email) setContact(member.email);
  }, [member?.email]);

  async function redeem() {
    setBusy(true);
    setError("");
    setResult(null);
    if (!memberLoggedIn) {
      setError("请先注册或登录会员账号后再核销提货码");
      setBusy(false);
      return;
    }
    try {
      setResult(await mPost<RedeemResult>("/member/presale/redeem", {
        token: token.trim(),
        contact: contact.trim() || undefined,
      }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "核销失败");
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string, i: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(i);
      setTimeout(() => setCopied(-1), 1500);
    });
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <div className="mb-5">
        <p className="chip w-fit !text-primary"><TicketCheck size={13} /> Timed Delivery Protocol</p>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">提货兑换中心</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/55">
          输入电子预售提货码后,系统会核验 SHA-256 哈希并原子销毁凭证。凭证遵循“谁持有,谁兑换”,核销后原买家无法找回或重复兑换。
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="card p-6 md:p-7">
          {!memberLoggedIn && (
            <div className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-700 dark:text-amber-300">
              核销会绑定到会员账号,用于后续查询发货状态、接收补货交付和处理退款补偿。请先登录或注册后再核销。
              <div className="mt-3 flex gap-2">
                <Link to="/login" className="btn-primary !px-4 !py-2 text-xs">登录</Link>
                <Link to="/register" className="btn-ghost !px-4 !py-2 text-xs">注册</Link>
              </div>
            </div>
          )}
          <label className="label flex items-center gap-1.5"><KeyRound size={13} /> 电子预售提货码</label>
          <input
            className="input mb-4 font-mono"
            placeholder="PV-..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <label className="label">接收邮箱 / Telegram / 账号备注</label>
          <div className="relative mb-4">
            {memberLocked && <Mail size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />}
            <input
              className={`input ${memberLocked ? "!pl-11 cursor-not-allowed bg-ink/[0.04] text-ink/45 focus:ring-0" : ""}`}
              placeholder="用于补货后定向交付"
              value={contact}
              readOnly={memberLocked}
              aria-readonly={memberLocked}
              title={memberLocked ? "已登录会员将绑定当前账号邮箱" : undefined}
              onChange={(e) => !memberLocked && setContact(e.target.value)}
            />
          </div>
          {memberLocked && <p className="-mt-2 mb-4 text-[11px] text-ink/35">已登录会员将使用当前账号邮箱接收履约结果。</p>}
          {error && <p className="mb-3 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}
          <button className="btn-primary w-full !py-3.5" disabled={busy || !memberLoggedIn || !token.trim()} onClick={redeem}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : "核销提货码"}
          </button>
        </div>

        <div className="card h-fit p-5">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-bold"><ShieldCheck size={14} /> 运作原理</p>
          <div className="space-y-2 text-xs leading-relaxed text-ink/55">
            <p>Token 由 256-bit CSPRNG 生成,平台仅保存 StorageHash。</p>
            <p>开放提货前也可以提前核销,系统会先绑定当前会员。</p>
            <p>核销成功即 Burn,之后可在会员中心查询发货状态。</p>
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
                <button
                  key={i}
                  onClick={() => copy(c, i)}
                  className="group flex w-full items-center justify-between gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-left transition hover:brightness-95"
                >
                  <code className="break-all font-mono text-sm font-semibold">{c}</code>
                  {copied === i ? <CheckCircle2 size={15} className="shrink-0 text-primary" /> : <Copy size={15} className="shrink-0 text-ink/40 group-hover:text-ink" />}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-600 dark:text-amber-400">
              凭证已经销毁并生成履约工单。商家补货后会按你提交的接收信息定向交付。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
