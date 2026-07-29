import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { get, post } from "../../lib/api";
import SensitiveConfirm from "../../components/SensitiveConfirm";

/** 支付渠道:收款配置=资金流向,保存/启停一律走密码+2FA 双因子确认;变更即时 TG 告警。 */

interface AdminChannel {
  id: number; code: string; displayName: string; enabled: boolean; sortOrder: number; configEnc: string | null;
}

const CONFIG_HINT: Record<string, string> = {
  ALIPAY_OFFICIAL: '{"appId":"","privateKey":"","alipayPublicKey":"","notifyUrl":"https://域名/api/pay/notify/ALIPAY_OFFICIAL","mode":"qr"}',
  EPAY: '{"gateway":"https://pay.example.com","pid":"","key":"","notifyUrl":"https://域名/api/pay/notify/EPAY","payType":"alipay"}',
  STRIPE: '{"secretKey":"sk_live_xxx","webhookSecret":"whsec_xxx","currency":"USD","successUrl":"https://域名/pay/{{orderNo}}","cancelUrl":"https://域名/pay/{{orderNo}}"}',
  CRYPTO_TRANSFER: "无需配置(商户地址与链参数在服务端 application.yml / 环境变量 KA_MERCHANT_ADDRESS)",
  CRYPTO_WALLET: "无需配置(同上)",
};

export default function ChannelsAdmin() {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [configs, setConfigs] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState("");
  // 待确认的变更(密码 + 2FA 后才提交)
  const [pending, setPending] = useState<{ ch: AdminChannel; enabled: boolean } | null>(null);

  function load() {
    get<AdminChannel[]>("/admin/channels").then(setChannels).catch(() => void 0);
  }
  useEffect(load, []);

  async function submit(auth: { password: string; totpCode: string }) {
    if (!pending) return;
    const { ch, enabled } = pending;
    await post("/admin/channels", {
      id: ch.id, enabled, displayName: ch.displayName,
      sortOrder: ch.sortOrder, configJson: configs[ch.id]?.trim() || undefined,
      ...auth,
    });
    setMsg(`「${ch.displayName}」已保存${configs[ch.id]?.trim() ? "(收款配置已更新)" : ""}`);
    setConfigs((c) => ({ ...c, [ch.id]: "" }));
    setPending(null);
    load();
  }

  const pendingConfigChanged = pending ? !!configs[pending.ch.id]?.trim() : false;

  return (
    <div className="max-w-3xl animate-fade-up">
      <h1 className="mb-2 text-xl font-extrabold tracking-tight">支付渠道</h1>
      <p className="mb-6 text-xs text-ink/45">
        敏感配置提交后 AES-256 加密存储,页面不回显;留空表示不修改。保存/启停需密码 + 动态码双重确认,变更会推送 Telegram 告警。
      </p>
      {msg && <p className="mb-3 text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
      <div className="space-y-4">
        {channels.map((ch) => (
          <div key={ch.id} className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{ch.displayName}</h2>
                <p className="mt-0.5 font-mono text-[11px] text-ink/45">
                  {ch.code} · {ch.configEnc ? "已配置" : "未配置"}
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={ch.enabled}
                  onChange={(e) => { setMsg(""); setPending({ ch, enabled: e.target.checked }); }} />
                <span className={ch.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-ink/45"}>
                  {ch.enabled ? "已启用" : "已停用"}
                </span>
              </label>
            </div>
            {ch.code.startsWith("CRYPTO") ? (
              <p className="mt-3 rounded-lg bg-ink/[0.04] p-3 text-xs text-ink/45">{CONFIG_HINT[ch.code]}</p>
            ) : (
              <div className="mt-3">
                <textarea className="input min-h-20 font-mono text-xs" placeholder={CONFIG_HINT[ch.code] ?? "{}"}
                  value={configs[ch.id] ?? ""} onChange={(e) => setConfigs((c) => ({ ...c, [ch.id]: e.target.value }))} />
                <button className="btn-ghost mt-2 text-xs"
                  onClick={() => { setMsg(""); setPending({ ch, enabled: ch.enabled }); }}>
                  <Save size={13} /> 保存配置
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 双因子确认 */}
      {pending && (
        <SensitiveConfirm
          action={{
            title: "支付渠道变更",
            confirmText: "确认变更",
            danger: pendingConfigChanged,
            summary: (
              <div className="space-y-1">
                <div className="flex justify-between gap-3">
                  <span className="text-ink/45">渠道</span>
                  <span className="font-medium">{pending.ch.displayName}<span className="ml-1.5 font-mono text-[11px] text-ink/40">{pending.ch.code}</span></span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink/45">启用状态</span>
                  <span className={pending.enabled ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-ink/60"}>
                    {pending.enabled ? "启用" : "停用"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink/45">收款配置</span>
                  <span className={pendingConfigChanged ? "font-semibold text-red-500" : "text-ink/60"}>
                    {pendingConfigChanged ? "将被更新(资金流向变更!)" : "不改动"}
                  </span>
                </div>
                {pendingConfigChanged && (
                  <p className="pt-1 text-[11px] leading-relaxed text-ink/40">
                    请再次核对商户号/密钥归属是你本人的收款账户;变更将推送 Telegram 告警并记录审计。
                  </p>
                )}
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
