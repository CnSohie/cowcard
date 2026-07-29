import { Link } from "react-router-dom";
import { FileText, ShieldCheck } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <div className="mb-8">
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-primary">
          <FileText size={22} />
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">网站服务条款</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink/55">
          使用本站下单、注册会员、充值余额或购买内容,即表示你已阅读并同意以下条款。
        </p>
      </div>

      <article className="prose-ka card p-6 sm:p-8">
        <h2>1. 服务范围</h2>
        <p>本站提供数字商品、卡密、媒体内容与会员余额相关服务。商品说明、价格、库存、有效期和使用方式以页面展示为准。</p>

        <h2>2. 账号与安全</h2>
        <p>你应妥善保管会员账号、密码、订单号和查询凭证。因自行泄露、转发或在不可信环境中使用导致的损失,由你自行承担。</p>

        <h2>3. 下单与自动发货</h2>
        <p>订单支付成功后,系统会自动发货或入账。部分支付渠道可能存在确认延迟,订单状态以本站后台最终记录为准。</p>

        <h2>4. 数字商品特殊规则</h2>
        <p>卡密、账号凭证、付费文章等数字内容一经发货或解锁,通常不支持无理由退款。若商品本身无法使用,请在合理时间内联系售后并提供订单号、问题截图或必要排查信息。</p>

        <h2>5. 余额与推广</h2>
        <p>会员余额仅限本站内消费或按页面规则申请提现。推广佣金、提现门槛、审核周期和处理方式以本站实际配置为准。</p>

        <h2>6. 禁止行为</h2>
        <p>不得利用本站进行违法交易、攻击接口、恶意占库存、批量撞库、绕过支付、倒卖违规内容或侵犯第三方权益。本站可对异常订单和账号采取限制、冻结、取消或封禁措施。</p>

        <h2>7. 风险提示</h2>
        <p>加密货币转账需自行核对链、币种、金额和收款地址。转错链、转错币、少付或使用不受支持网络导致的损失,本站可能无法追回。</p>

        <h2>8. 隐私与通知</h2>
        <p>本站会为了下单、发货、查单、售后、风控和通知目的处理你的邮箱、订单信息、登录记录和必要的支付状态信息。启用邮件通知后,系统会向订单邮箱发送发货或入账提醒。</p>

        <h2>9. 条款更新</h2>
        <p>本站可根据业务和安全需要更新本条款。更新后继续使用本站服务,视为接受新的条款内容。</p>
      </article>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-accent-soft px-5 py-4 text-sm">
        <span className="inline-flex items-center gap-2 font-medium text-primary"><ShieldCheck size={16} /> 下单前请确认商品说明与售后规则</span>
        <Link to="/" className="btn-primary !px-5 !py-2">返回商店</Link>
      </div>
    </div>
  );
}
