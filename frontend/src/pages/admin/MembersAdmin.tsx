import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Ban, Check, ChevronLeft, ChevronRight, Crown, Gift, Mail, Search, ShieldCheck,
  Snowflake, UsersRound, Wallet, X,
} from "lucide-react";
import { ApiError, get, post } from "../../lib/api";
import { money } from "../../lib/currency";
import SensitiveConfirm from "../../components/SensitiveConfirm";

/** 会员管理:余额钱包总览、邀请关系、封禁/解封(封禁即时失效其登录态)。 */

interface AdminMember {
  id: number; email: string; nickname: string | null; enabled: boolean;
  inviteCode: string; inviterId: number | null;
  balance: string; frozen: string;
  shoppingBalance: string; withdrawableBalance: string;
  shoppingFrozen: string; withdrawableFrozen: string; withdrawalFrozen: string;
  levelId: number | null; levelName: string | null;
  totalRecharge: string; totalSpend: string;
  lastLoginAt: string | null; createdAt: string;
}
interface MemberLevelOption {
  id: number;
  name: string;
  manualOnly: boolean;
  enabled: boolean;
  defaultLevel: boolean;
  discountRate?: string;
}
interface PageResult<T> { items: T[]; total: number; page: number; size: number; }
interface MemberStats { total: number; enabled: number; disabled: number; balance: string; frozen: string; }

const SIZE = 15;
const FREEZE_REASONS = [
  "风控核查: 账户交易异常",
  "客诉处理中: 暂停可用余额",
  "疑似盗号: 等待用户核验身份",
  "提现信息异常: 暂停资金操作",
  "管理员临时冻结",
];
const UNFREEZE_REASONS = [
  "风控核查完成,解除冻结",
  "客诉已处理,解除冻结",
  "用户身份已核验,解除冻结",
];

function fmt(s: string | null) {
  return s ? new Date(s).toLocaleString() : "—";
}

function levelPriceLabel(level: MemberLevelOption) {
  if (level.discountRate == null || level.discountRate === "") return null;
  const rate = Number(level.discountRate);
  if (!Number.isFinite(rate)) return null;
  return rate >= 100 ? "无折扣" : `计价 ${Number.isInteger(rate) ? rate.toFixed(0) : rate}%`;
}

function LevelChoice({
  level, picked, current, onPick,
}: {
  level: MemberLevelOption;
  picked: boolean;
  current: boolean;
  onPick: () => void;
}) {
  const price = levelPriceLabel(level);
  return (
    <button type="button" role="radio" aria-checked={picked} onClick={onPick}
      className={`flex w-full min-w-0 items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition ${
        picked ? "border-primary/40 bg-accent-soft" : "border-ink/10 bg-surface hover:border-primary/25"
      }`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
        picked ? "bg-primary text-primary-contrast" : "bg-ink/[0.04] text-ink/50"
      }`}>
        <Crown size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-ink">{level.name}</span>
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          {current && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">当前</span>}
          {level.manualOnly && <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-[10px] font-bold text-ink/55">仅人工</span>}
          {level.defaultLevel && <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-[10px] font-bold text-ink/55">默认</span>}
          {!level.enabled && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">已停用</span>}
          {price && <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-[10px] font-bold text-ink/55">{price}</span>}
        </span>
      </span>
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
        picked ? "border-primary bg-primary text-primary-contrast" : "border-ink/15"
      }`} aria-hidden="true">
        {picked && <Check size={12} />}
      </span>
    </button>
  );
}

function hasAdminAuth(code: string) {
  const authorities: string[] = JSON.parse(localStorage.getItem("ka.auth") ?? "[]");
  return authorities.includes("ROLE_SUPER_ADMIN") || authorities.includes("*") || authorities.includes(code);
}

export default function MembersAdmin() {
  const [data, setData] = useState<PageResult<AdminMember> | null>(null);
  const [stats, setStats] = useState<MemberStats | null>(null);
  const [input, setInput] = useState("");
  const [kw, setKw] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminMember | null>(null);
  const [freezeMode, setFreezeMode] = useState<"freeze" | "unfreeze" | null>(null);
  const [statusTarget, setStatusTarget] = useState<AdminMember | null>(null);
  const [freezeAmount, setFreezeAmount] = useState("");
  const [freezeNote, setFreezeNote] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [levels, setLevels] = useState<MemberLevelOption[]>([]);
  const [levelsState, setLevelsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [levelChoice, setLevelChoice] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const canManageStatus = hasAdminAuth("member:status") || hasAdminAuth("member:manage");
  const canFreezeWallet = hasAdminAuth("wallet:freeze") || hasAdminAuth("member:manage");
  const canAssignLevel = hasAdminAuth("member-level:manage") || hasAdminAuth("member:manage");

  useEffect(() => {
    if (!selected || !canAssignLevel) return;
    let alive = true;
    setLevelsState("loading");
    get<MemberLevelOption[]>("/admin/member-levels")
      .then((rows) => {
        if (!alive) return;
        setLevels(rows.filter((level) => level.id != null));
        setLevelsState("ready");
      })
      .catch(() => { if (alive) setLevelsState("error"); });
    return () => { alive = false; };
  }, [selected?.id, canAssignLevel]);

  useEffect(() => {
    setLevelChoice(selected?.levelId ? String(selected.levelId) : "");
    setAssignOpen(false);
  }, [selected?.id, selected?.levelId]);

  useEffect(() => {
    setLoading(true);
    get<PageResult<AdminMember>>("/admin/members", { q: kw || undefined, page: page - 1, size: SIZE })
      .then(setData)
      .catch(() => void 0)
      .finally(() => setLoading(false));
    get<MemberStats>("/admin/members/stats").then(setStats).catch(() => void 0);
  }, [kw, page]);

  async function toggle(m: AdminMember, auth: { password: string; totpCode: string }) {
    if (!canManageStatus) return;
    await post(`/admin/members/${m.id}/toggle`, auth);
    const next = { ...m, enabled: !m.enabled };
    setData((d) => d && ({ ...d, items: d.items.map((x) => (x.id === m.id ? next : x)) }));
    setSelected((s) => (s?.id === m.id ? next : s));
    setStatusTarget(null);
    get<MemberStats>("/admin/members/stats").then(setStats).catch(() => void 0);
  }

  function openFreeze(mode: "freeze" | "unfreeze") {
    if (!canFreezeWallet) return;
    setFreezeMode(mode);
    setFreezeAmount("");
    setFreezeNote(mode === "freeze" ? FREEZE_REASONS[0] : UNFREEZE_REASONS[0]);
    setActionErr("");
  }

  async function execFreeze(auth: { password: string; totpCode: string }) {
    if (!selected) return;
    const amount = Number(freezeAmount);
    if (!amount || amount <= 0) throw new Error("请输入正确的金额");
    try {
      const balances = await post<Pick<AdminMember, "balance" | "frozen" | "shoppingBalance" | "withdrawableBalance" | "shoppingFrozen" | "withdrawableFrozen" | "withdrawalFrozen">>(`/admin/members/${selected.id}/${freezeMode}`, {
        amount: freezeAmount,
        note: freezeNote.trim() || (freezeMode === "freeze" ? "管理员临时冻结" : "管理员解除冻结"),
        ...auth,
      });
      setData((d) => d && ({ ...d, items: d.items.map((x) => x.id === selected.id ? { ...x, ...balances } : x) }));
      setSelected((m) => m && { ...m, ...balances });
      get<MemberStats>("/admin/members/stats").then(setStats).catch(() => void 0);
      setFreezeMode(null);
    } catch (e) {
      throw e instanceof ApiError ? e : new Error("操作失败,请稍后再试");
    }
  }

  function levelLabel(member: Pick<AdminMember, "levelId" | "levelName">) {
    return member.levelName || (member.levelId ? `等级 #${member.levelId}` : "未设置");
  }

  async function assignLevel(auth: { password: string; totpCode: string }) {
    if (!selected || !levelChoice) throw new Error("请选择会员等级");
    const levelId = Number(levelChoice);
    const level = levels.find((item) => item.id === levelId);
    await post(`/admin/member-levels/members/${selected.id}/assign`, { levelId, ...auth });
    const next = { ...selected, levelId, levelName: level?.name ?? selected.levelName };
    setData((d) => d && ({ ...d, items: d.items.map((x) => (x.id === selected.id ? next : x)) }));
    setSelected(next);
    setAssignOpen(false);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / SIZE)) : 1;
  const chosenLevel = levels.find((item) => String(item.id) === levelChoice);

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">用户中心管理</h1>
          <p className="mt-1 text-xs text-ink/45">管理注册会员、余额钱包、会员等级、邀请关系和账号状态。</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            className="input !pl-10"
            placeholder="搜索邮箱 / 昵称,回车确认"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setKw(input.trim()); setPage(1); }
            }}
          />
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "注册会员", value: stats?.total ?? "—", icon: UsersRound },
          { label: "正常账号", value: stats?.enabled ?? "—", icon: ShieldCheck },
          { label: "可用余额", value: stats ? money(stats.balance) : "—", icon: Wallet },
          { label: "冻结金额", value: stats ? money(stats.frozen) : "—", icon: Ban },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-ink/45">{s.label}</p>
                <p className="mt-2 text-2xl font-extrabold tracking-tight">{s.value}</p>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-accent-soft text-primary">
                <s.icon size={18} />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead><tr>
            <th className="th">会员</th><th className="th">等级</th><th className="th">钱包余额</th><th className="th">邀请码</th>
            <th className="th">邀请人</th><th className="th">最近登录</th><th className="th">注册时间</th>
            <th className="th">状态</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td className="td py-14 text-center text-ink/40" colSpan={8}>加载中…</td></tr>
            ) : !data || data.items.length === 0 ? (
              <tr><td className="td py-14 text-center" colSpan={8}>
                <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-accent-soft">
                  <UsersRound size={18} className="text-primary" />
                </span>
                <span className="text-sm text-ink/40">{kw ? "没有匹配的会员" : "暂无注册会员"}</span>
              </td></tr>
            ) : (
              data.items.map((m) => (
                <tr key={m.id} className="cursor-pointer hover:bg-ink/[0.02]" onClick={() => setSelected(m)}>
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-sm font-extrabold text-primary">
                        {(m.nickname || m.email).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{m.email}</span>
                        <span className="block text-xs text-ink/40">#{m.id}{m.nickname ? ` · ${m.nickname}` : ""}</span>
                      </span>
                    </div>
                  </td>
                  <td className="td whitespace-nowrap text-xs">{levelLabel(m)}</td>
                  <td className="td">
                    <div className="text-xs text-ink/70">购物 {money(m.shoppingBalance, "CNY")}<br />可提现 {money(m.withdrawableBalance, "CNY")}</div>
                    {Number(m.frozen) > 0 && <div className="text-xs text-amber-600 dark:text-amber-400">冻结 {money(m.frozen)}</div>}
                  </td>
                  <td className="td"><span className="chip !py-0.5 font-mono text-[11px]">{m.inviteCode}</span></td>
                  <td className="td text-xs">{m.inviterId ? `#${m.inviterId}` : "—"}</td>
                  <td className="td text-xs">{fmt(m.lastLoginAt)}</td>
                  <td className="td text-xs">{fmt(m.createdAt)}</td>
                  <td className="td">
                    {canManageStatus ? (
                      <button onClick={(e) => { e.stopPropagation(); setStatusTarget(m); }}
                        title={m.enabled ? "点击封禁(将立即失效其登录态)" : "点击解封"}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          m.enabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-500"
                        }`}>
                        {m.enabled ? "正常" : "已封禁"}
                      </button>
                    ) : (
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        m.enabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-500"
                      }`}>
                        {m.enabled ? "正常" : "已封禁"}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <button className="btn-ghost !px-3.5" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button>
          <span className="text-sm text-ink/50">第 {page} / {totalPages} 页</span>
          <button className="btn-ghost !px-3.5" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button>
        </div>
      )}

      {selected && createPortal((
        <>
          <div className="drawer-mask" onClick={() => setSelected(null)} />
          <aside className="drawer-panel !max-w-lg">
            <header className="border-b border-ink/[0.06] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-lg font-extrabold text-primary-contrast">
                    {(selected.nickname || selected.email).slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-lg font-extrabold tracking-tight">{selected.nickname || selected.email.split("@")[0]}</h2>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        selected.enabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-500"
                      }`}>
                        {selected.enabled ? "正常" : "封禁"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink/45">{selected.email}</p>
                    <p className="mt-1 font-mono text-[11px] text-ink/30">会员 #{selected.id}</p>
                  </div>
                </div>
                <button
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-ink/10 text-ink/45 transition hover:bg-ink/[0.05] hover:text-ink"
                  onClick={() => setSelected(null)}>
                  <X size={16} />
                </button>
              </div>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <section className="overflow-hidden rounded-3xl border border-ink/[0.07]">
                <div className="grid grid-cols-2 gap-4 p-5 text-xs text-ink/55">
                  <div><p>购物余额（不可提现）</p><p className="mt-2 text-sm text-ink">{money(selected.shoppingBalance, "CNY")}</p><p className="mt-2">风控冻结 {money(selected.shoppingFrozen, "CNY")}</p></div>
                  <div><p>可提现余额</p><p className="mt-2 text-sm text-ink">{money(selected.withdrawableBalance, "CNY")}</p><p className="mt-2">风控冻结 {money(selected.withdrawableFrozen, "CNY")}</p></div>
                  <p className="col-span-2">提现处理中 {money(selected.withdrawalFrozen, "CNY")} · 仅能在提现审核中处理</p>
                </div>
                {canFreezeWallet ? (
                  <div className="p-4">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button className="rounded-2xl border border-ink/10 px-4 py-3 text-sm font-bold text-ink transition hover:border-primary/30 hover:bg-accent-soft/60 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={Number(selected.balance) <= 0}
                        onClick={() => openFreeze("freeze")}>
                        <span className="inline-flex items-center gap-2"><Snowflake size={14} /> 冻结余额</span>
                      </button>
                      <button className="rounded-2xl border border-ink/10 px-4 py-3 text-sm font-bold text-ink transition hover:border-primary/30 hover:bg-accent-soft/60 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={Number(selected.shoppingFrozen) + Number(selected.withdrawableFrozen) <= 0}
                        onClick={() => openFreeze("unfreeze")}>
                        <span className="inline-flex items-center gap-2"><Wallet size={14} /> 解除冻结</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-xs text-ink/40">当前账号只有查看权限,余额冻结由风控或旧会员管理员处理。</div>
                )}
              </section>

              <section className="rounded-3xl border border-ink/[0.07] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="section-label !mb-0"><span className="h-1 w-4 rounded-full bg-accent" /> 会员等级</p>
                  <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-bold text-primary">{levelLabel(selected)}</span>
                </div>
                <p className="mb-4 text-xs leading-6 text-ink/45">
                  累计充值 {money(selected.totalRecharge)} · 累计消费 {money(selected.totalSpend)}
                </p>
                {canAssignLevel ? (
                  <>
                    <p className="label">授予等级</p>
                    {levelsState === "loading" && (
                      <div className="mb-3 space-y-2" role="status" aria-label="正在加载等级">
                        <div className="h-16 animate-pulse rounded-2xl bg-ink/[0.04]" />
                        <div className="h-16 animate-pulse rounded-2xl bg-ink/[0.04]" />
                      </div>
                    )}
                    {levelsState === "error" && (
                      <p className="mb-3 text-xs leading-6 text-ink/45">等级加载失败，关闭后重新打开会员即可重试。</p>
                    )}
                    {levelsState === "ready" && (
                      <div role="radiogroup" aria-label="授予等级" className="mb-3 space-y-2">
                        {levels.map((level) => (
                          <LevelChoice key={level.id} level={level}
                            picked={String(level.id) === levelChoice}
                            current={level.id === selected.levelId}
                            onPick={() => setLevelChoice(String(level.id))} />
                        ))}
                        {selected.levelId != null && !levels.some((level) => level.id === selected.levelId) && (
                          <LevelChoice
                            level={{ id: selected.levelId, name: levelLabel(selected), manualOnly: false, enabled: true, defaultLevel: false }}
                            picked={String(selected.levelId) === levelChoice}
                            current
                            onPick={() => setLevelChoice(String(selected.levelId))} />
                        )}
                        {levels.length === 0 && selected.levelId == null && (
                          <p className="rounded-2xl bg-ink/[0.03] px-4 py-3 text-xs leading-6 text-ink/45">还没有可授予的等级。</p>
                        )}
                      </div>
                    )}
                    <p className="mb-3 text-xs leading-6 text-ink/45">
                      新建并保存的等级会立即出现在这里。授予后马上生效；仅人工授予的等级不会被充值或消费自动替换。
                    </p>
                    <button type="button" className="btn-primary w-full"
                      disabled={levelsState !== "ready" || !levelChoice || Number(levelChoice) === selected.levelId}
                      onClick={() => setAssignOpen(true)}>
                      <Crown size={15} /> {levelChoice && Number(levelChoice) === selected.levelId ? "已是当前等级" : "授予此等级"}
                    </button>
                  </>
                ) : (
                  <p className="text-xs leading-6 text-ink/45">当前账号只能查看等级。授予等级需要会员等级管理权限。</p>
                )}
              </section>

              <section className="rounded-3xl border border-ink/[0.07] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink/35">
                    <Snowflake size={13} /> 风控规则
                  </p>
                  <span className="rounded-full bg-ink/[0.04] px-2.5 py-1 text-[10px] font-bold text-ink/40">2FA 保护</span>
                </div>
                <p className="text-xs leading-relaxed text-ink/45">
                  冻结只会把可用余额转入冻结余额,不会凭空改钱;用户前台会看到最近一次冻结原因。
                  {canFreezeWallet ? "执行前需要管理员密码和 2FA。" : "当前账号无需 2FA,因为没有冻结操作权限。"}
                </p>
                {actionErr && <p className="mb-3 text-xs text-red-500">{actionErr}</p>}
              </section>

              <section className="space-y-3 rounded-3xl border border-ink/[0.07] p-5 text-sm">
                <p className="section-label !mb-4"><span className="h-1 w-4 rounded-full bg-accent" /> 账户资料</p>
                {[
                  ["邮箱", selected.email],
                  ["昵称", selected.nickname || "未设置"],
                  ["邀请码", selected.inviteCode],
                  ["邀请人", selected.inviterId ? `#${selected.inviterId}` : "无"],
                  ["最近登录", fmt(selected.lastLoginAt)],
                  ["注册时间", fmt(selected.createdAt)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-t border-ink/[0.05] pt-3 first:border-t-0 first:pt-0">
                    <span className="shrink-0 text-ink/45">{label}</span>
                    <span className={`${label === "邀请码" ? "font-mono" : ""} break-all text-right font-medium text-ink/75`}>{value}</span>
                  </div>
                ))}
              </section>
            </div>
            <footer className="border-t border-ink/[0.06] bg-surface/95 p-5">
              <div className="flex gap-3">
                <a className="rounded-2xl border border-ink/10 px-4 py-3 text-center text-sm font-bold transition hover:border-primary/30 hover:bg-accent-soft/60"
                  href={`mailto:${selected.email}`}>
                  <span className="inline-flex items-center gap-2"><Mail size={14} /> 发邮件</span>
                </a>
                {canManageStatus && (
                  <button className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                    selected.enabled ? "border-red-500/20 bg-red-500/10 text-red-500 hover:bg-red-500/15" : "border-primary/30 bg-accent-soft text-primary"
                  }`} onClick={() => setStatusTarget(selected)}>
                    {selected.enabled ? <Ban size={14} /> : <Gift size={14} />}
                    {selected.enabled ? "封禁账号" : "解除封禁"}
                  </button>
                )}
              </div>
            </footer>
          </aside>
        </>
      ), document.body)}

      {freezeMode && selected && (
        <SensitiveConfirm
          action={{
            title: freezeMode === "freeze" ? "冻结会员余额" : "解除余额冻结",
            confirmText: freezeMode === "freeze" ? "确认冻结" : "确认解冻",
            danger: freezeMode === "freeze",
            summary: (
              <div className="space-y-1">
                <div className="flex justify-between gap-3"><span className="text-ink/45">会员</span><span>{selected.email}</span></div>
                <div className="flex justify-between gap-3"><span className="text-ink/45">可用余额</span><span>{money(selected.balance)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-ink/45">可解冻风控金额</span><span>{money((Number(selected.shoppingFrozen) + Number(selected.withdrawableFrozen)).toFixed(2), "CNY")}</span></div>
              </div>
            ),
          }}
          onClose={() => setFreezeMode(null)}
          onConfirm={execFreeze}
        >
          <p className="mb-3 text-xs leading-relaxed text-ink/55">风控冻结先占用购物余额，再占用可提现余额；解冻退回原钱包。提现处理中金额不在此处解冻。</p>
          <label className="label">金额（人民币）</label>
          <div className="mb-3 flex gap-2">
            <input className="input flex-1" inputMode="decimal" placeholder="0.00"
            value={freezeAmount} onChange={(e) => setFreezeAmount(e.target.value)} />
            <button type="button" className="btn-ghost shrink-0 !px-3 text-xs"
              onClick={() => setFreezeAmount(freezeMode === "freeze" ? selected.balance : (Number(selected.shoppingFrozen) + Number(selected.withdrawableFrozen)).toFixed(2))}>
              {freezeMode === "freeze" ? "全部可用" : "全部风控冻结"}
            </button>
          </div>
          <label className="label">{freezeMode === "freeze" ? "冻结原因" : "解冻原因"}</label>
          <div className="mb-3 flex flex-wrap gap-2">
            {(freezeMode === "freeze" ? FREEZE_REASONS : UNFREEZE_REASONS).map((reason) => (
              <button key={reason} type="button"
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                  freezeNote === reason ? "border-primary/45 bg-accent-soft text-primary" : "border-ink/10 bg-surface text-ink/55 hover:border-primary/30 hover:text-ink"
                }`}
                onClick={() => setFreezeNote(reason)}>
                {reason}
              </button>
            ))}
          </div>
          <label className="label">备注</label>
          <textarea className="input mb-4 min-h-16 resize-none text-sm" placeholder="例如: 风控核查 / 客诉冻结"
            value={freezeNote} onChange={(e) => setFreezeNote(e.target.value)} />
        </SensitiveConfirm>
      )}
      {assignOpen && selected && chosenLevel && (
        <SensitiveConfirm
          action={{
            title: "授予会员等级",
            confirmText: "确认授予",
            summary: (
              <div className="space-y-1">
                <div className="flex justify-between gap-3"><span className="text-ink/45">会员</span><span className="break-all text-right">{selected.email}</span></div>
                <div className="flex justify-between gap-3"><span className="text-ink/45">当前等级</span><span>{levelLabel(selected)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-ink/45">授予为</span><span>{chosenLevel.name}</span></div>
              </div>
            ),
          }}
          onClose={() => setAssignOpen(false)}
          onConfirm={assignLevel}
        />
      )}
      {statusTarget && (
        <SensitiveConfirm
          action={{
            title: statusTarget.enabled ? "封禁会员账号" : "解除会员封禁",
            confirmText: statusTarget.enabled ? "确认封禁" : "确认解封",
            danger: statusTarget.enabled,
            summary: (
              <div className="space-y-1">
                <div className="flex justify-between gap-3"><span className="text-ink/45">会员</span><span>{statusTarget.email}</span></div>
                <div className="flex justify-between gap-3"><span className="text-ink/45">动作</span><span>{statusTarget.enabled ? "封禁并失效登录态" : "恢复登录"}</span></div>
              </div>
            ),
          }}
          onClose={() => setStatusTarget(null)}
          onConfirm={(auth) => toggle(statusTarget, auth)}
        />
      )}
    </div>
  );
}
