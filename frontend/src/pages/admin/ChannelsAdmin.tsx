import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Save } from "lucide-react";
import { ApiError, get, post } from "../../lib/api";
import SensitiveConfirm from "../../components/SensitiveConfirm";

/** 支付渠道:字段化配置 + 完整性检查;密钥永不回显,留空即保留。 */

interface AdminChannel {
  id: number;
  code: string;
  displayName: string;
  enabled: boolean;
  sortOrder: number;
  configured: boolean;
  ready: boolean;
  missingFields: string[];
  validationError: string | null;
  config: Record<string, string>;
  secrets: Record<string, boolean>;
}

interface FieldSpec {
  key: string;
  label: string;
  help?: string;
  secret?: boolean;
  multiline?: boolean;
  optional?: boolean;
  options?: { value: string; label: string }[];
}

const FIELDS: Record<string, FieldSpec[]> = {
  ALIPAY_OFFICIAL: [
    { key: "mode", label: "支付方式", options: [{ value: "qr", label: "当面付扫码（推荐）" }, { value: "page", label: "电脑网站支付" }] },
    { key: "appId", label: "应用 AppID", help: "支付宝开放平台应用详情中的 AppID" },
    { key: "sellerId", label: "支付宝账号 PID", help: "2088 开头的支付宝用户 ID，用于回调收款方核验" },
    { key: "privateKey", label: "应用私钥", secret: true, multiline: true, help: "应用私钥，不是支付宝公钥；服务端会 AES-256-GCM 加密保存" },
    { key: "alipayPublicKey", label: "支付宝公钥", secret: true, multiline: true, help: "开放平台密钥工具生成/换取的“支付宝公钥”" },
    { key: "notifyUrl", label: "异步通知地址", help: "必须能被支付宝公网访问，例如 https://域名/api/pay/notify/ALIPAY_OFFICIAL" },
    { key: "returnUrl", label: "支付后返回地址", optional: true, help: "可留空自动返回本站；支持 {{orderNo}} 占位符" },
    { key: "gateway", label: "支付宝网关", help: "正式环境通常无需修改" },
  ],
  EPAY: [
    { key: "gateway", label: "易支付网关", help: "例如 https://pay.example.com；系统会自动拼接 /submit.php" },
    { key: "pid", label: "商户 PID" },
    { key: "key", label: "商户密钥", secret: true },
    { key: "payType", label: "支付类型", options: [{ value: "alipay", label: "支付宝" }, { value: "wxpay", label: "微信支付" }, { value: "qqpay", label: "QQ 钱包" }] },
    { key: "notifyUrl", label: "异步通知地址", help: "例如 https://域名/api/pay/notify/EPAY" },
    { key: "returnUrl", label: "支付后返回地址", optional: true, help: "可留空自动返回本站；支持 {{orderNo}} 占位符" },
  ],
  STRIPE: [
    { key: "secretKey", label: "Secret Key", secret: true, help: "Stripe 控制台的 sk_live_… 或测试环境 sk_test_…" },
    { key: "webhookSecret", label: "Webhook Signing Secret", secret: true, help: "监听 checkout.session.completed 的 whsec_…" },
    { key: "currency", label: "收款币种", help: "三位币种代码，例如 USD、CNY、EUR" },
    { key: "successUrl", label: "成功返回地址", optional: true, help: "可留空自动返回本站；支持 {{orderNo}}" },
    { key: "cancelUrl", label: "取消返回地址", optional: true, help: "可留空自动返回本站；支持 {{orderNo}}" },
  ],
  CRYPTO_TRANSFER: [
    { key: "merchantAddress", label: "EVM 收款地址", help: "Base、Polygon、BSC 共用的 0x 收款地址；只填写公开地址，绝不要填写助记词或私钥" },
  ],
  CRYPTO_WALLET: [
    { key: "merchantAddress", label: "EVM 收款地址", help: "与转账直付共用；修改任一处都会更新统一链上扫描地址" },
  ],
};

const FEE_FIELDS: FieldSpec[] = [
  { key: "feeRate", label: "向买家收取的手续费比例(%)", optional: true, help: "按订单待支付金额计算，例如 2.5 表示 2.5%；留空或 0 表示不收取" },
  { key: "feeFixed", label: "固定手续费", optional: true, help: "按站点计价币种每笔加收，例如 0.30；最终手续费 = 金额 × 比例 + 固定值" },
];

const FIELD_LABEL: Record<string, string> = {
  appId: "AppID", sellerId: "支付宝 PID", privateKey: "应用私钥", alipayPublicKey: "支付宝公钥",
  notifyUrl: "异步通知地址", gateway: "网关", pid: "商户 PID", key: "商户密钥", payType: "支付类型",
  secretKey: "Secret Key", webhookSecret: "Webhook Secret", currency: "币种",
  merchantAddress: "EVM 收款地址",
  feeRate: "手续费比例", feeFixed: "固定手续费",
};

export default function ChannelsAdmin() {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [configs, setConfigs] = useState<Record<number, Record<string, string>>>({});
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ ch: AdminChannel; enabled: boolean } | null>(null);

  function load(ignoreDirty = false) {
    get<AdminChannel[]>("/admin/channels").then((items) => {
      setChannels(items);
      setConfigs((current) => {
        const next = { ...current };
        for (const ch of items) {
          if (!ignoreDirty && dirty.has(ch.id)) continue;
          const defaults = { ...ch.config };
          if ((ch.code === "ALIPAY_OFFICIAL" || ch.code === "EPAY") && !defaults.notifyUrl) {
            defaults.notifyUrl = `${window.location.origin}/api/pay/notify/${ch.code}`;
          }
          for (const key of Object.keys(ch.secrets)) defaults[key] = "";
          next[ch.id] = defaults;
        }
        return next;
      });
    }).catch((e) => setError(e instanceof ApiError ? e.message : "支付渠道加载失败"));
  }

  useEffect(load, []);

  function setField(ch: AdminChannel, key: string, value: string) {
    setConfigs((all) => ({ ...all, [ch.id]: { ...(all[ch.id] ?? {}), [key]: value } }));
    setDirty((current) => new Set(current).add(ch.id));
    setMsg("");
    setError("");
  }

  async function submit(auth: { password: string; totpCode: string }) {
    if (!pending) return;
    const { ch, enabled } = pending;
    try {
      await post("/admin/channels", {
        id: ch.id,
        enabled,
        displayName: ch.displayName,
        sortOrder: ch.sortOrder,
        config: dirty.has(ch.id) ? configs[ch.id] : undefined,
        ...auth,
      });
      setMsg(`「${ch.displayName}」已保存${dirty.has(ch.id) ? "，配置完整性校验通过" : ""}`);
      setError("");
      setDirty((current) => { const next = new Set(current); next.delete(ch.id); return next; });
      setPending(null);
      load(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "支付渠道保存失败");
      throw e;
    }
  }

  const pendingConfigChanged = pending ? dirty.has(pending.ch.id) : false;

  return (
    <div className="max-w-4xl animate-fade-up">
      <h1 className="mb-2 text-xl font-extrabold tracking-tight">支付渠道</h1>
      <p className="mb-6 text-xs leading-5 text-ink/45">
        配置已改为字段化表单。密钥只写不读、AES-256-GCM 加密落库；启用前服务端会检查必填项、URL 和密钥格式。保存与启停仍需管理员密码 + 动态码。
      </p>
      {msg && <p className="mb-3 rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
      {error && <p className="mb-3 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}

      <div className="space-y-4">
        {channels.map((ch) => {
          const specs = [...(FIELDS[ch.code] ?? []), ...(ch.code === "BALANCE" ? [] : FEE_FIELDS)];
          return (
            <section key={ch.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-ink/[0.06] p-5">
                <span className={`grid h-10 w-10 place-items-center rounded-2xl ${ch.ready ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                  {ch.ready ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{ch.displayName}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ch.ready ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                      {ch.ready ? "配置完整" : "待完善"}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-ink/40">{ch.code}</p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={ch.enabled}
                    onChange={(e) => { setMsg(""); setError(""); setPending({ ch, enabled: e.target.checked }); }} />
                  <span className={ch.enabled ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-ink/45"}>{ch.enabled ? "已启用" : "已停用"}</span>
                </label>
              </div>

              {ch.missingFields.length > 0 && (
                <div className="border-b border-amber-500/15 bg-amber-500/[0.07] px-5 py-3 text-xs text-amber-700 dark:text-amber-300">
                  启用前还需配置：{ch.missingFields.map((key) => FIELD_LABEL[key] ?? key).join("、")}
                </div>
              )}
              {ch.validationError && ch.missingFields.length === 0 && (
                <div className="border-b border-red-500/15 bg-red-500/[0.07] px-5 py-3 text-xs text-red-600 dark:text-red-300">
                  配置校验未通过：{ch.validationError}
                </div>
              )}

              {specs.length > 0 ? (
                <div className="grid gap-4 p-5 md:grid-cols-2">
                  {specs.map((field) => {
                    const value = configs[ch.id]?.[field.key] ?? "";
                    const secretConfigured = field.secret && ch.secrets[field.key];
                    return (
                      <div key={field.key} className={field.multiline ? "md:col-span-2" : ""}>
                        <label className="label flex items-center gap-1.5">
                          {field.secret && <KeyRound size={11} />}{field.label}{field.optional && <span className="text-ink/30">（可选）</span>}
                        </label>
                        {field.options ? (
                          <select className="input" value={value} onChange={(e) => setField(ch, field.key, e.target.value)}>
                            {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : field.multiline ? (
                          <textarea className="input min-h-28 font-mono text-xs" value={value} autoComplete="off"
                            placeholder={secretConfigured ? "已安全配置；留空不会覆盖原密钥" : `请输入${field.label}`}
                            onChange={(e) => setField(ch, field.key, e.target.value)} />
                        ) : (
                          <input className="input" type={field.secret ? "password" : "text"} value={value} autoComplete="off"
                            placeholder={secretConfigured ? "已安全配置；留空不修改" : `请输入${field.label}`}
                            onChange={(e) => setField(ch, field.key, e.target.value)} />
                        )}
                        {field.help && <p className="mt-1.5 text-[11px] leading-4 text-ink/40">{field.help}</p>}
                      </div>
                    );
                  })}
                  <div className="flex items-end md:col-span-2">
                    <button disabled={!dirty.has(ch.id)} className="btn-primary" onClick={() => { setMsg(""); setError(""); setPending({ ch, enabled: ch.enabled }); }}>
                      <Save size={14} /> 保存并校验配置
                    </button>
                  </div>
                </div>
              ) : (
                <p className="p-5 text-sm text-ink/50">该渠道无需额外密钥配置。</p>
              )}
            </section>
          );
        })}
      </div>

      {pending && (
        <SensitiveConfirm
          action={{
            title: "支付渠道变更",
            confirmText: "验证并保存",
            danger: pendingConfigChanged,
            summary: (
              <div className="space-y-2">
                <div className="flex justify-between gap-3"><span className="text-ink/45">渠道</span><span className="font-medium">{pending.ch.displayName}</span></div>
                <div className="flex justify-between gap-3"><span className="text-ink/45">启用状态</span><span>{pending.enabled ? "启用" : "停用"}</span></div>
                <div className="flex justify-between gap-3"><span className="text-ink/45">收款配置</span><span className={pendingConfigChanged ? "font-semibold text-red-500" : "text-ink/60"}>{pendingConfigChanged ? "将更新并校验" : "不改动"}</span></div>
                {pendingConfigChanged && <p className="pt-1 text-[11px] leading-relaxed text-ink/40">请确认 AppID、商户号、收款账号和密钥均属于你的商户。密钥不会在保存后回显。</p>}
              </div>
            ),
          }}
          onConfirm={submit}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}
