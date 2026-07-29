import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LockKeyhole, Pencil, Plus, Save, ShieldCheck, SlidersHorizontal, UserCog, X } from "lucide-react";
import { ApiError, get, post, put } from "../../lib/api";
import SensitiveConfirm from "../../components/SensitiveConfirm";

interface AdminUser {
  id: number; username: string; nickname: string | null; enabled: boolean;
  roles: string[]; lastLoginAt: string | null; lastLoginIp: string | null;
}
interface RoleView {
  id: number; code: string; name: string; description: string | null; builtin: boolean; permissionCodes: string[];
}
interface PermissionView { id: number; code: string; name: string; groupName: string | null; }
interface Page<T> { items: T[]; total: number; }

type RoleForm = { code: string; name: string; description: string; permissionCodes: string[]; builtin?: boolean };
type PendingSensitive =
  | { kind: "createUser" }
  | { kind: "toggleUser"; user: AdminUser }
  | { kind: "saveUserRoles" }
  | { kind: "saveRole" };

const EMPTY_ROLE: RoleForm = { code: "", name: "", description: "", permissionCodes: [] };
const ROLE_HINTS: Record<string, string> = {
  SUPER_ADMIN: "平台最高权限,只给老板或核心技术负责人。",
  ADMIN: "日常综合管理,不含支付配置和系统角色配置。",
  OPS: "负责商品、卡密、订单、优惠券和媒体内容。",
  ORDER_MANAGER: "负责查单、补单、关闭订单和交付跟进。",
  FINANCE: "负责支付渠道、提现审核、礼品卡和对账审计。",
  RISK: "负责异常订单、会员状态和余额冻结风控。",
  SUPPORT: "负责查单、会员基础信息和客服工单。",
  CONTENT: "负责媒体文章和基础展示配置。",
  SECURITY_ADMIN: "负责后台账号、角色权限、安全设置和审计。",
  LEGACY_MEMBER_MANAGER: "旧版兼容角色,建议逐步替换为新细分角色。",
};

function hasAuth(code: string) {
  const authorities: string[] = JSON.parse(localStorage.getItem("ka.auth") ?? "[]");
  return authorities.includes("ROLE_SUPER_ADMIN") || authorities.includes("*") || authorities.includes(code);
}

function fmtTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function roleDescription(role: RoleView) {
  return role.description || ROLE_HINTS[role.code] || "自定义岗位角色,按勾选权限控制后台菜单和接口能力。";
}

export default function UsersAdmin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [permissions, setPermissions] = useState<PermissionView[]>([]);
  const [creating, setCreating] = useState(false);
  const [roleForm, setRoleForm] = useState<RoleForm | null>(null);
  const [roleEditUser, setRoleEditUser] = useState<AdminUser | null>(null);
  const [roleEditCodes, setRoleEditCodes] = useState<string[]>([]);
  const [pendingSensitive, setPendingSensitive] = useState<PendingSensitive | null>(null);
  const [form, setForm] = useState({ username: "", password: "", nickname: "", roleCodes: [] as string[] });
  const [msg, setMsg] = useState("");
  const [roleMsg, setRoleMsg] = useState("");
  const canManageRoles = hasAuth("role:manage");

  function load() {
    get<Page<AdminUser>>("/admin/users", { size: 100 }).then((p) => setUsers(p.items)).catch(() => void 0);
    get<RoleView[]>("/admin/roles").then(setRoles).catch(() => void 0);
    if (canManageRoles) {
      get<PermissionView[]>("/admin/roles/permissions").then(setPermissions).catch(() => void 0);
    }
  }

  useEffect(load, []);

  const permissionGroups = useMemo(() => {
    return permissions.reduce<Record<string, PermissionView[]>>((acc, p) => {
      const group = p.groupName || "其他";
      acc[group] = acc[group] || [];
      acc[group].push(p);
      return acc;
    }, {});
  }, [permissions]);

  async function createUser(auth: { password: string; totpCode: string }) {
    setMsg("");
    try {
      await post("/admin/users", { ...form, authPassword: auth.password, totpCode: auth.totpCode });
      setPendingSensitive(null);
      setCreating(false);
      setForm({ username: "", password: "", nickname: "", roleCodes: [] });
      load();
    } catch (e) {
      const text = e instanceof ApiError ? e.message : "创建失败";
      setMsg(text);
      throw new Error(text);
    }
  }

  async function toggleEnabled(u: AdminUser, auth: { password: string; totpCode: string }) {
    await put(`/admin/users/${u.id}`, { enabled: !u.enabled, authPassword: auth.password, totpCode: auth.totpCode });
    setPendingSensitive(null);
    load();
  }

  function openRoleEditor(role?: RoleView) {
    setRoleMsg("");
    setRoleForm(role ? {
      code: role.code,
      name: role.name,
      description: role.description || roleDescription(role),
      permissionCodes: role.permissionCodes,
      builtin: role.builtin,
    } : { ...EMPTY_ROLE });
  }

  async function saveRole(auth: { password: string; totpCode: string }) {
    if (!roleForm) return;
    setRoleMsg("");
    try {
      await post("/admin/roles", {
        code: roleForm.code.trim(),
        name: roleForm.name.trim(),
        description: roleForm.description.trim(),
        permissionCodes: roleForm.permissionCodes,
        authPassword: auth.password,
        totpCode: auth.totpCode,
      });
      setPendingSensitive(null);
      setRoleForm(null);
      load();
    } catch (e) {
      const text = e instanceof ApiError ? e.message : "角色保存失败";
      setRoleMsg(text);
      throw new Error(text);
    }
  }

  function openUserRoleEditor(user: AdminUser) {
    setMsg("");
    setRoleEditUser(user);
    setRoleEditCodes(user.roles);
  }

  async function saveUserRoles(auth: { password: string; totpCode: string }) {
    if (!roleEditUser || roleEditCodes.length === 0) return;
    setMsg("");
    try {
      await put(`/admin/users/${roleEditUser.id}`, {
        roleCodes: roleEditCodes,
        authPassword: auth.password,
        totpCode: auth.totpCode,
      });
      setPendingSensitive(null);
      setRoleEditUser(null);
      load();
    } catch (e) {
      const text = e instanceof ApiError ? e.message : "角色调整失败";
      setMsg(text);
      throw new Error(text);
    }
  }

  function toggleRoleCode(code: string) {
    if (!roleForm) return;
    setRoleForm({
      ...roleForm,
      permissionCodes: roleForm.permissionCodes.includes(code)
        ? roleForm.permissionCodes.filter((c) => c !== code)
        : [...roleForm.permissionCodes, code],
    });
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">用户与角色</h1>
          <p className="mt-1 text-xs text-ink/45">后台账号、岗位角色和菜单权限统一在这里管理。</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> 新建用户</button>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {[
          ["最小权限", "客服只给查单与工单,财务只给提现与支付配置,风控才可冻结余额。"],
          ["旧角色兼容", "旧 OPS / FINANCE / SUPPORT 会在启动时补齐新增权限,但已登录账号需要重新登录。"],
          ["敏感确认", "补单、关单、提现、冻结余额、礼品卡生成等高危操作继续要求密码 + 2FA。"],
        ].map(([title, text]) => (
          <section key={title} className="card p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-ink"><ShieldCheck size={15} /> {title}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink/45">{text}</p>
          </section>
        ))}
      </div>

      <div className="card mb-8 overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead><tr>
            <th className="th">账号</th><th className="th">昵称</th><th className="th">角色</th>
            <th className="th">最近登录</th><th className="th">状态</th><th className="th text-right">操作</th>
          </tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-ink/[0.02]">
                <td className="td font-medium text-ink">{u.username}</td>
                <td className="td">{u.nickname ?? "—"}</td>
                <td className="td">
                  <div className="flex flex-wrap gap-1.5">
                    {u.roles.map((r) => <span key={r} className="chip !py-0.5 font-mono text-[10px]">{r}</span>)}
                  </div>
                </td>
                <td className="td text-xs">{fmtTime(u.lastLoginAt)}{u.lastLoginIp ? ` · ${u.lastLoginIp}` : ""}</td>
                <td className="td">
                    <button onClick={() => setPendingSensitive({ kind: "toggleUser", user: u })}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      u.enabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-500"
                    }`}>
                    {u.enabled ? "启用中" : "已禁用"}
                  </button>
                </td>
                <td className="td">
                  <div className="flex justify-end gap-2">
                    <button className="btn-ghost !px-3 !py-2 text-xs" onClick={() => openUserRoleEditor(u)}>
                      <UserCog size={13} /> 角色
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td className="td py-12 text-center text-ink/40" colSpan={6}>暂无后台账号</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink/70">
          <LockKeyhole size={15} /> 角色权限矩阵
        </h2>
        {canManageRoles && (
          <button className="btn-ghost !py-2 text-xs" onClick={() => openRoleEditor()}>
            <Plus size={13} /> 新建自定义角色
          </button>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {roles.map((r) => (
          <section key={r.id} className="card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-extrabold text-ink">{r.name}</h3>
                  {r.builtin && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-primary">内置</span>}
                </div>
                <p className="mt-1 font-mono text-[11px] text-ink/35">{r.code}</p>
              </div>
              {canManageRoles && r.code !== "SUPER_ADMIN" && (
                <button className="btn-ghost !px-3 !py-2 text-xs" onClick={() => openRoleEditor(r)}>
                  <Pencil size={13} /> 调整
                </button>
              )}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink/50">{roleDescription(r)}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {r.permissionCodes.map((p) => <span key={p} className="chip !py-0.5 font-mono text-[10px]">{p}</span>)}
            </div>
          </section>
        ))}
      </div>

      {creating && createPortal((
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm" onClick={() => setCreating(false)}>
          <div className="card w-full max-w-sm !bg-surface p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">新建后台账号</h2>
              <button onClick={() => setCreating(false)}><X size={17} className="text-ink/45 hover:text-ink" /></button>
            </div>
            <label className="label">用户名</label>
            <input className="input mb-3" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <label className="label">初始密码(至少 10 位)</label>
            <input className="input mb-3" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <label className="label">昵称</label>
            <input className="input mb-3" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
            <label className="label">角色</label>
            <div className="mb-4 flex flex-wrap gap-2">
              {roles.map((r) => (
                <button key={r.code}
                  onClick={() => setForm((f) => ({
                    ...f,
                    roleCodes: f.roleCodes.includes(r.code) ? f.roleCodes.filter((c) => c !== r.code) : [...f.roleCodes, r.code],
                  }))}
                  className={`chip ${form.roleCodes.includes(r.code) ? "chip-on" : ""}`}>
                  {r.name}
                </button>
              ))}
            </div>
            {msg && <p className="mb-3 text-xs text-red-500">{msg}</p>}
            <button className="btn-primary w-full" disabled={!form.username || !form.password || form.roleCodes.length === 0}
              onClick={() => setPendingSensitive({ kind: "createUser" })}>创建</button>
          </div>
        </div>
      ), document.body)}

      {roleEditUser && createPortal((
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm" onClick={() => setRoleEditUser(null)}>
          <div className="card w-full max-w-lg !bg-surface p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">调整账号角色</h2>
                <p className="mt-1 text-xs text-ink/45">{roleEditUser.username}</p>
              </div>
              <button onClick={() => setRoleEditUser(null)}><X size={17} className="text-ink/45 hover:text-ink" /></button>
            </div>
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {roles.map((r) => (
                <button key={r.code}
                  onClick={() => setRoleEditCodes((codes) => (
                    codes.includes(r.code) ? codes.filter((c) => c !== r.code) : [...codes, r.code]
                  ))}
                  className={`rounded-2xl border p-4 text-left transition ${
                    roleEditCodes.includes(r.code) ? "border-primary/45 bg-accent-soft" : "border-ink/10 hover:border-primary/30"
                  }`}>
                  <span className="block text-sm font-bold">{r.name}</span>
                  <span className="mt-1 block font-mono text-[10px] text-ink/35">{r.code}</span>
                </button>
              ))}
            </div>
            {msg && <p className="mb-3 text-xs text-red-500">{msg}</p>}
            <button className="btn-primary w-full" disabled={roleEditCodes.length === 0} onClick={() => setPendingSensitive({ kind: "saveUserRoles" })}>
              <Save size={14} /> 保存角色
            </button>
          </div>
        </div>
      ), document.body)}

      {roleForm && createPortal((
        <div className="fixed inset-0 z-50 bg-ink/40 p-4 backdrop-blur-sm" onClick={() => setRoleForm(null)}>
          <div className="mx-auto flex h-full max-w-4xl items-center justify-center">
            <div className="card flex max-h-[calc(100vh-2rem)] w-full flex-col !bg-surface" onClick={(e) => e.stopPropagation()}>
              <header className="flex items-start justify-between gap-4 border-b border-ink/[0.06] p-6">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-extrabold">
                    <SlidersHorizontal size={17} /> {roleForm.builtin ? "调整内置角色" : "自定义角色"}
                  </h2>
                  <p className="mt-1 text-xs text-ink/45">权限变化会影响下次登录后的菜单和接口访问能力。</p>
                </div>
                <button onClick={() => setRoleForm(null)}><X size={18} className="text-ink/45 hover:text-ink" /></button>
              </header>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">角色码</label>
                    <input className="input" disabled={roleForm.builtin}
                      value={roleForm.code}
                      onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 32) })} />
                  </div>
                  <div>
                    <label className="label">显示名称</label>
                    <input className="input" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} />
                  </div>
                </div>
                <label className="label mt-4">职责说明</label>
                <textarea className="input min-h-20 resize-none" value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} />

                <div className="mt-6 space-y-5">
                  {Object.entries(permissionGroups).map(([group, items]) => (
                    <section key={group} className="rounded-3xl border border-ink/[0.07] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-extrabold">{group}</h3>
                        <span className="text-[11px] text-ink/35">
                          {items.filter((p) => roleForm.permissionCodes.includes(p.code)).length} / {items.length}
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {items.map((p) => {
                          const active = roleForm.permissionCodes.includes(p.code);
                          return (
                            <button key={p.code} type="button"
                              className={`rounded-2xl border p-3 text-left transition ${
                                active ? "border-primary/45 bg-accent-soft text-ink" : "border-ink/10 text-ink/60 hover:border-primary/30 hover:text-ink"
                              }`}
                              onClick={() => toggleRoleCode(p.code)}>
                              <span className="block text-sm font-bold">{p.name}</span>
                              <span className="mt-1 block font-mono text-[10px] text-ink/35">{p.code}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
                {roleMsg && <p className="mt-4 text-xs text-red-500">{roleMsg}</p>}
              </div>
              <footer className="border-t border-ink/[0.06] p-5">
                <button className="btn-primary w-full" disabled={!roleForm.code || !roleForm.name || roleForm.permissionCodes.length === 0}
                  onClick={() => setPendingSensitive({ kind: "saveRole" })}>
                  <Save size={14} /> 保存角色
                </button>
              </footer>
            </div>
          </div>
        </div>
      ), document.body)}

      {pendingSensitive && (
        <SensitiveConfirm
          action={{
            title: pendingSensitive.kind === "createUser" ? "创建后台账号"
              : pendingSensitive.kind === "toggleUser" ? (pendingSensitive.user.enabled ? "禁用后台账号" : "启用后台账号")
              : pendingSensitive.kind === "saveUserRoles" ? "调整账号角色" : "保存角色权限",
            confirmText: "验证并保存",
            danger: pendingSensitive.kind === "toggleUser" && pendingSensitive.user.enabled,
            summary: (
              <div className="space-y-1">
                {pendingSensitive.kind === "createUser" && (
                  <>
                    <div className="flex justify-between gap-3"><span className="text-ink/45">账号</span><span>{form.username}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-ink/45">角色</span><span>{form.roleCodes.join(", ")}</span></div>
                  </>
                )}
                {pendingSensitive.kind === "toggleUser" && (
                  <>
                    <div className="flex justify-between gap-3"><span className="text-ink/45">账号</span><span>{pendingSensitive.user.username}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-ink/45">动作</span><span>{pendingSensitive.user.enabled ? "禁用" : "启用"}</span></div>
                  </>
                )}
                {pendingSensitive.kind === "saveUserRoles" && roleEditUser && (
                  <>
                    <div className="flex justify-between gap-3"><span className="text-ink/45">账号</span><span>{roleEditUser.username}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-ink/45">新角色</span><span>{roleEditCodes.join(", ")}</span></div>
                  </>
                )}
                {pendingSensitive.kind === "saveRole" && roleForm && (
                  <>
                    <div className="flex justify-between gap-3"><span className="text-ink/45">角色</span><span>{roleForm.code}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-ink/45">权限数</span><span>{roleForm.permissionCodes.length}</span></div>
                  </>
                )}
              </div>
            ),
          }}
          onClose={() => setPendingSensitive(null)}
          onConfirm={(auth) => {
            if (pendingSensitive.kind === "createUser") return createUser(auth);
            if (pendingSensitive.kind === "toggleUser") return toggleEnabled(pendingSensitive.user, auth);
            if (pendingSensitive.kind === "saveUserRoles") return saveUserRoles(auth);
            return saveRole(auth);
          }}
        />
      )}
    </div>
  );
}
