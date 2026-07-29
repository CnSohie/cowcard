import { useEffect, useState } from "react";
import {
  Globe2, HandCoins, Mail, Moon, Palette, Save, Send, ShieldCheck,
  Sun, SunMoon, Timer, Unlock,
} from "lucide-react";
import { ApiError, get, post } from "../../lib/api";
import { applySiteTheme, previewTheme, THEMES, type ThemeName } from "../../lib/theme";
import { setCurrency } from "../../lib/currency";

const MODES = [
  { value: "auto", label: "跟随系统", icon: SunMoon },
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
] as const;

const CURRENCIES = [
  { code: "CNY", label: "人民币", symbol: "¥" },
  { code: "USD", label: "美元", symbol: "$" },
  { code: "EUR", label: "欧元", symbol: "€" },
  { code: "GBP", label: "英镑", symbol: "£" },
  { code: "JPY", label: "日元", symbol: "¥" },
  { code: "CHF", label: "瑞郎", symbol: "CHF" },
  { code: "HKD", label: "港币", symbol: "HK$" },
  { code: "TWD", label: "新台币", symbol: "NT$" },
  { code: "SGD", label: "新币", symbol: "S$" },
] as const;

const GOODS_SUBJECT = "【{{siteName}}】订单 {{orderNo}} 已发货";
const GOODS_BODY = `你好,你的订单已完成发货。

订单号: {{orderNo}}
商品: {{productName}}
数量: {{quantity}}
实付金额: {{currencySymbol}}{{amount}} {{currencyCode}}
支付渠道: {{paidChannel}}
发货时间: {{deliveredAt}}

卡密内容:
{{cards}}

你也可以前往 {{queryUrl}} 使用订单号和邮箱查询。
如需售后,请联系: {{supportContact}}

{{siteName}}`;

const RECHARGE_SUBJECT = "【{{siteName}}】充值订单 {{orderNo}} 已入账";
const RECHARGE_BODY = `你好,你的余额充值已入账。

订单号: {{orderNo}}
入账金额: {{currencySymbol}}{{balanceAmount}} {{currencyCode}}
支付渠道: {{paidChannel}}
入账时间: {{deliveredAt}}

你可以登录会员中心查看余额和流水。
如需帮助,请联系: {{supportContact}}

{{siteName}}`;

export default function SettingsAdmin() {
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    get<Record<string, string>>("/admin/config").then(setCfg).catch(() => void 0);
  }, []);

  function set(key: string, value: string) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      await post("/admin/config", cfg);
      applySiteTheme(cfg["site.theme"], cfg["site.mode"]);
      setCurrency(cfg["site.currency"]);
      setMsg("已保存,商城前台即刻生效");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function testMail() {
    setTesting(true);
    setMsg("");
    try {
      await post("/admin/config/mail/test", { to: testTo.trim() });
      setMsg("测试邮件已发送,请检查收件箱或垃圾邮件");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "测试邮件发送失败");
    } finally {
      setTesting(false);
    }
  }

  const theme = cfg["site.theme"] ?? "mint";
  const mode = cfg["site.mode"] ?? "auto";

  return (
    <div className="max-w-2xl animate-fade-up">
      <h1 className="mb-6 text-xl font-extrabold tracking-tight">站点设置</h1>

      <div className="card mb-5 p-6">
        <h2 className="mb-4 font-bold">基本信息</h2>
        <label className="label">站点名称</label>
        <input className="input mb-3" value={cfg["site.name"] ?? ""} placeholder="Ka 发卡"
          onChange={(e) => set("site.name", e.target.value)} />
        <label className="label">公告(留空不展示)</label>
        <input className="input mb-3" value={cfg["site.announcement"] ?? ""} placeholder="全场自动发货…"
          onChange={(e) => set("site.announcement", e.target.value)} />
        <label className="label">联系方式(展示给买家)</label>
        <input className="input" value={cfg["site.contact"] ?? ""} placeholder="Telegram: @xxx"
          onChange={(e) => set("site.contact", e.target.value)} />
        <label className="label mt-3">站点网址(邮件查单链接使用)</label>
        <input className="input font-mono text-xs" value={cfg["site.url"] ?? ""} placeholder="https://ka.example.com"
          onChange={(e) => set("site.url", e.target.value)} />
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><Globe2 size={16} /> SEO 设置</h2>
        <p className="mb-4 text-xs leading-relaxed text-ink/45">
          用于首页、文章、商品页面的 title/meta/canonical/OG 标签。文章详情会自动用文章标题、摘要、封面覆盖全站默认值。
        </p>
        <label className="label">SEO 标题</label>
        <input className="input mb-3" value={cfg["seo.title"] ?? ""} placeholder="Ka 发卡 · 数字商品秒级到账"
          onChange={(e) => set("seo.title", e.target.value)} />
        <label className="label">SEO 描述</label>
        <textarea className="input mb-3 min-h-20 text-sm leading-relaxed" maxLength={180}
          value={cfg["seo.description"] ?? ""} placeholder="自动发卡平台,支持支付宝、USDT、USDC 和信用卡支付,卡密秒级交付。"
          onChange={(e) => set("seo.description", e.target.value)} />
        <label className="label">关键词(英文逗号分隔)</label>
        <input className="input mb-3" value={cfg["seo.keywords"] ?? ""} placeholder="自动发卡,卡密,数字商品,USDT支付"
          onChange={(e) => set("seo.keywords", e.target.value)} />
        <label className="label">OG 分享图 URL</label>
        <input className="input mb-4 font-mono text-xs" value={cfg["seo.og_image"] ?? ""} placeholder="https://ka.example.com/files/og.png"
          onChange={(e) => set("seo.og_image", e.target.value)} />
        <label className="label">搜索引擎收录</label>
        <div className="flex flex-wrap gap-2.5">
          {([["1", "允许收录"], ["0", "禁止收录"]] as const).map(([v, label]) => (
            <button key={v} className={`chip !py-2.5 ${(cfg["seo.index"] ?? "1") === v ? "chip-on" : ""}`}
              onClick={() => set("seo.index", v)}>
              {label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink/40">
          sitemap: <span className="font-mono">/sitemap.xml</span> · robots: <span className="font-mono">/robots.txt</span>
        </p>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><HandCoins size={16} /> 货币与换汇</h2>
        <p className="mb-4 text-xs text-ink/45">
          商品价格、优惠券、余额和提现按站点计价币种解释;加密支付自动换算为 USD 稳定币,支付宝/易支付自动换算为 CNY。
        </p>
        <label className="label">站点计价币种</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {CURRENCIES.map((c) => {
            const on = (cfg["site.currency"] ?? "CNY") === c.code;
            return (
              <button key={c.code}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                  on ? "border-primary bg-primary text-primary-contrast" : "border-ink/10 bg-surface hover:border-ink/25"
                }`}
                onClick={() => set("site.currency", c.code)}>
                <span>
                  <span className="block text-sm font-bold">{c.code}</span>
                  <span className={`block text-xs ${on ? "text-primary-contrast/70" : "text-ink/40"}`}>{c.label}</span>
                </span>
                <span className={`text-sm font-extrabold ${on ? "text-primary-contrast" : "text-primary"}`}>{c.symbol}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink/40">
          切换币种后,请同步核对商品价格、文章价格、优惠券面额、钱包最低提现金额等数值;系统不会自动改写已有价格数字。
        </p>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><Palette size={16} /> 全站主题</h2>
        <p className="mb-4 text-xs text-ink/45">买家商城与管理后台共用;买家仍可自行切换明暗。点选即时预览,保存后生效。</p>
        <label className="label">主题色系</label>
        <div className="mb-4 flex flex-wrap gap-2.5">
          {THEMES.map((t) => (
            <button key={t.value}
              onClick={() => { set("site.theme", t.value); previewTheme(t.value as ThemeName); }}
              className={`chip !py-2.5 !pl-2.5 ${theme === t.value ? "chip-on" : ""}`}>
              <span className="h-4 w-4 rounded-full" style={{ background: t.swatch }} />
              {t.label}
            </button>
          ))}
        </div>
        <label className="label">默认明暗模式</label>
        <div className="flex flex-wrap gap-2.5">
          {MODES.map((m) => (
            <button key={m.value} onClick={() => set("site.mode", m.value)}
              className={`chip !py-2.5 ${mode === m.value ? "chip-on" : ""}`}>
              <m.icon size={13} /> {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><Timer size={16} /> 交易设置</h2>
        <p className="mb-4 text-xs text-ink/45">
          到时未支付的订单每分钟自动扫描关闭并<b>释放预占库存</b>;同邮箱/同 IP 未支付订单数超限时拒绝新下单,防止恶意批量下单锁库存。
        </p>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
          <div>
            <label className="label">订单支付超时(分钟)</label>
            <input className="input !py-2.5" type="number" min={1} max={1440}
              value={cfg["order.expire_minutes"] ?? ""} placeholder="15(默认)"
              onChange={(e) => set("order.expire_minutes", e.target.value)} />
          </div>
          <div>
            <label className="label">同邮箱未支付上限(笔)</label>
            <input className="input !py-2.5" type="number" min={1} max={100}
              value={cfg["order.max_pending_per_contact"] ?? ""} placeholder="3(默认)"
              onChange={(e) => set("order.max_pending_per_contact", e.target.value)} />
          </div>
          <div>
            <label className="label">同 IP 未支付上限(笔)</label>
            <input className="input !py-2.5" type="number" min={1} max={200}
              value={cfg["order.max_pending_per_ip"] ?? ""} placeholder="5(默认)"
              onChange={(e) => set("order.max_pending_per_ip", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><ShieldCheck size={16} /> CC 防护(接口限流)</h2>
        <p className="mb-4 text-xs text-ink/45">
          按 IP 分档限流,连续超限自动临时封禁。全部留空使用内置默认;保存后<b>即刻生效</b>。误封自己时点下方「解除全部封禁」。
        </p>
        <label className="label">防护开关</label>
        <div className="mb-4 flex gap-2.5">
          {[["", "开启(默认)"], ["0", "关闭"]].map(([v, l]) => (
            <button key={v}
              className={`chip !py-2.5 ${(cfg["security.rl.enabled"] === "0" ? "0" : "") === v ? "chip-on" : ""}`}
              onClick={() => set("security.rl.enabled", v)}>{l}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {([
            ["security.rl.global_per_minute", "买家接口 / 分钟", "480"],
            ["security.rl.admin_per_minute", "后台接口 / 分钟", "600"],
            ["security.rl.login_per_minute", "登录注册 / 分钟", "10"],
            ["security.rl.order_per_minute", "下单 / 分钟", "20"],
            ["security.rl.pay_per_minute", "支付轮询 / 分钟", "90"],
            ["security.rl.ban_threshold", "触发封禁阈值(次/2分钟)", "5"],
            ["security.rl.ban_minutes", "首次封禁时长(分钟)", "10"],
          ] as const).map(([key, label, ph]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input className="input !py-2.5" type="number" min={1} value={cfg[key] ?? ""} placeholder={ph}
                onChange={(e) => set(key, e.target.value)} />
            </div>
          ))}
        </div>
        <button className="btn-ghost mt-4 !py-2.5 text-xs"
          onClick={async () => {
            try {
              await post("/admin/config/rate-limit/reset");
              setMsg("已解除全部临时封禁并重置限流计数");
            } catch (e) {
              setMsg(e instanceof ApiError ? e.message : "操作失败");
            }
          }}>
          <Unlock size={13} /> 解除全部封禁(立即)
        </button>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><ShieldCheck size={16} /> 敏感操作验证</h2>
        <p className="mb-4 text-xs leading-relaxed text-ink/45">
          卡密管理、补单、关单、提现审核、冻结余额等敏感操作首次需要管理员密码 + 2FA。验证通过后的有效期内,弹层仍会提示风险,但会明确显示无需再次输入 2FA。
        </p>
        <label className="label">2FA 免重复验证时间(分钟)</label>
        <input className="input max-w-xs" type="number" min={0} max={60}
          value={cfg["security.sensitive_grace_minutes"] ?? "5"} placeholder="5"
          onChange={(e) => set("security.sensitive_grace_minutes", e.target.value)} />
        <p className="mt-2 text-[11px] text-ink/40">填 0 表示每次敏感操作都重新验证;最大 60 分钟。</p>
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><HandCoins size={16} /> 钱包与推广</h2>
        <p className="mb-4 text-xs text-ink/45">会员余额钱包在平台内统一流转:可购买付费文章、接收推广佣金;提现需人工审核。</p>
        <label className="label">推广佣金比例(%,0~100;0 = 关闭返佣)</label>
        <input className="input mb-1" type="number" min={0} max={100} step="0.1"
          value={cfg["commission.rate"] ?? ""} placeholder="0"
          onChange={(e) => set("commission.rate", e.target.value)} />
        <p className="mb-3 text-[11px] text-ink/40">被邀请会员每笔实付消费(商品订单 / 付费文章)按比例计入邀请人余额;充值不计佣。</p>
        <label className="label">最低提现金额(元)</label>
        <input className="input" type="number" min={0.01} step="0.01"
          value={cfg["wallet.min_withdraw"] ?? ""} placeholder="10"
          onChange={(e) => set("wallet.min_withdraw", e.target.value)} />
      </div>

      <div className="card mb-5 p-6">
        <h2 className="mb-1 font-bold">Telegram 成交通知</h2>
        <p className="mb-4 text-xs text-ink/45">向 @BotFather 创建机器人获取 Token,向机器人发一条消息后从 getUpdates 拿 chat_id。两项都填才生效。</p>
        <label className="label">Bot Token</label>
        <input className="input mb-3 font-mono text-xs" value={cfg["tg.bot_token"] ?? ""} placeholder="123456:ABC-DEF…"
          onChange={(e) => set("tg.bot_token", e.target.value)} />
        <label className="label">Chat ID</label>
        <input className="input font-mono text-xs" value={cfg["tg.chat_id"] ?? ""} placeholder="-100123456789"
          onChange={(e) => set("tg.chat_id", e.target.value)} />
      </div>

      <div className="card mb-5 p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="mb-1 flex items-center gap-2 font-bold"><Mail size={16} /> 邮件通知</h2>
            <p className="text-xs text-ink/45">开启后,商品发货和余额充值入账会自动给买家邮箱发送通知。</p>
          </div>
          <button className={`chip !py-2.5 ${(cfg["mail.enabled"] === "1" || cfg["mail.enabled"] === "true") ? "chip-on" : ""}`}
            onClick={() => set("mail.enabled", (cfg["mail.enabled"] === "1" || cfg["mail.enabled"] === "true") ? "0" : "1")}>
            {(cfg["mail.enabled"] === "1" || cfg["mail.enabled"] === "true") ? "已启用" : "未启用"}
          </button>
        </div>

        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label">SMTP Host</label>
            <input className="input font-mono text-xs" value={cfg["mail.host"] ?? ""} placeholder="smtp.example.com"
              onChange={(e) => set("mail.host", e.target.value)} />
          </div>
          <div>
            <label className="label">端口</label>
            <input className="input" type="number" value={cfg["mail.port"] ?? "587"}
              onChange={(e) => set("mail.port", e.target.value)} />
          </div>
          <div>
            <label className="label">SMTP 用户名</label>
            <input className="input font-mono text-xs" value={cfg["mail.username"] ?? ""} placeholder="notice@example.com"
              onChange={(e) => set("mail.username", e.target.value)} />
          </div>
          <div>
            <label className="label">SMTP 密码 / 授权码</label>
            <input className="input font-mono text-xs" type="password" value={cfg["mail.password"] ?? ""}
              onChange={(e) => set("mail.password", e.target.value)} />
          </div>
          <div>
            <label className="label">发件邮箱</label>
            <input className="input font-mono text-xs" value={cfg["mail.from"] ?? ""} placeholder="notice@example.com"
              onChange={(e) => set("mail.from", e.target.value)} />
          </div>
          <div>
            <label className="label">发件名称</label>
            <input className="input" value={cfg["mail.from_name"] ?? ""} placeholder={cfg["site.name"] || "Ka 发卡"}
              onChange={(e) => set("mail.from_name", e.target.value)} />
          </div>
          <div>
            <label className="label">STARTTLS</label>
            <button className={`chip w-full justify-center !py-3 ${(cfg["mail.starttls"] ?? "1") !== "0" ? "chip-on" : ""}`}
              onClick={() => set("mail.starttls", (cfg["mail.starttls"] ?? "1") !== "0" ? "0" : "1")}>
              {(cfg["mail.starttls"] ?? "1") !== "0" ? "开启" : "关闭"}
            </button>
          </div>
          <div>
            <label className="label">SSL</label>
            <button className={`chip w-full justify-center !py-3 ${cfg["mail.ssl"] === "1" ? "chip-on" : ""}`}
              onClick={() => set("mail.ssl", cfg["mail.ssl"] === "1" ? "0" : "1")}>
              {cfg["mail.ssl"] === "1" ? "开启" : "关闭"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input className="input" value={testTo} placeholder="测试收件邮箱"
            onChange={(e) => setTestTo(e.target.value)} />
          <button className="btn-ghost" disabled={testing || !testTo.trim()} onClick={testMail}>
            <Send size={14} /> {testing ? "发送中…" : "发送测试邮件"}
          </button>
        </div>

        <div className="mt-5 rounded-3xl border border-ink/[0.07] p-4">
          <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 商品发货模板</p>
          <label className="label">邮件标题</label>
          <input className="input mb-3" value={cfg["mail.template.order_paid_subject"] ?? GOODS_SUBJECT}
            onChange={(e) => set("mail.template.order_paid_subject", e.target.value)} />
          <label className="label">邮件正文</label>
          <textarea className="input min-h-52 font-mono text-xs" value={cfg["mail.template.order_paid_body"] ?? GOODS_BODY}
            onChange={(e) => set("mail.template.order_paid_body", e.target.value)} />
        </div>

        <div className="mt-4 rounded-3xl border border-ink/[0.07] p-4">
          <p className="section-label"><span className="h-1 w-4 rounded-full bg-accent" /> 余额充值模板</p>
          <label className="label">邮件标题</label>
          <input className="input mb-3" value={cfg["mail.template.recharge_subject"] ?? RECHARGE_SUBJECT}
            onChange={(e) => set("mail.template.recharge_subject", e.target.value)} />
          <label className="label">邮件正文</label>
          <textarea className="input min-h-44 font-mono text-xs" value={cfg["mail.template.recharge_body"] ?? RECHARGE_BODY}
            onChange={(e) => set("mail.template.recharge_body", e.target.value)} />
          <p className="mt-3 text-[11px] leading-relaxed text-ink/40">
            可用变量: {"{{siteName}} {{orderNo}} {{productName}} {{amount}} {{quantity}} {{paidChannel}} {{deliveredAt}} {{cards}} {{balanceAmount}} {{currencySymbol}} {{currencyCode}} {{queryUrl}} {{supportContact}}"}
          </p>
        </div>
      </div>

      {msg && <p className="mb-3 text-sm text-primary">{msg}</p>}
      <button className="btn-primary" disabled={busy} onClick={save}><Save size={15} /> {busy ? "保存中…" : "保存全部设置"}</button>
    </div>
  );
}
