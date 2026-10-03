import { ArrowUpRight, Clock3, Moon, PackageCheck, Search, ShieldCheck, Sparkles, Sun, Wrench } from "lucide-react";
import { Link } from "react-router-dom";

export type AvailabilityStatus = {
  state: "OPEN" | "MAINTENANCE" | "OFF_HOURS";
  message: string;
  timezone: string;
  offStart: string;
  offEnd: string;
  resumesAt: string | null;
};

/** 商城与后台预览共用同一组件，预览不会改变实际营业状态。 */
export default function AvailabilityPanel({ status, compact = false, preview = false }: {
  status: AvailabilityStatus; compact?: boolean; preview?: boolean;
}) {
  const maintenance = status.state === "MAINTENANCE";
  const Icon = maintenance ? Wrench : Moon;
  const resumeDate = status.resumesAt ? new Date(status.resumesAt) : null;
  const resume = resumeDate && !Number.isNaN(resumeDate.getTime())
    ? resumeDate.toLocaleString("zh-CN", { timeZone: status.timezone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : `${status.offEnd}（北京时间）`;

  if (compact) return <section className="mb-6 flex items-start gap-4 rounded-3xl border border-primary/15 bg-accent-soft p-5" aria-live="polite">
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface text-primary"><Icon size={20} /></span>
    <div className="min-w-0"><h2 className="font-bold">{maintenance ? "网站维护中" : "当前已下班"}</h2>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink/65">{status.message}</p>
      <p className="mt-2 text-xs leading-5 text-ink/50">已有订单与售后服务仍可使用。{!maintenance && `预计 ${resume} 恢复营业。`}</p>
    </div>
  </section>;

  return <section className="availability-panel relative isolate mb-6 overflow-hidden rounded-[2rem] border border-ink/[0.08] bg-surface sm:rounded-[2.5rem]" aria-live="polite">
    <div className="grid lg:grid-cols-[1.1fr_1fr]">
      <div className="relative z-10 flex flex-col justify-center px-6 py-10 sm:px-10 sm:py-16 lg:p-14">
        <div className="mb-8 flex items-center gap-2 text-xs font-semibold tracking-widest text-primary">
          <span className="h-2 w-2 rounded-full bg-primary" />{maintenance ? "用心整理，焕新再见" : "慢下来，明天见"}
        </div>
        <h1 className="text-4xl font-extrabold leading-[1.2] tracking-tight sm:text-5xl lg:text-6xl">{maintenance ? <>给美好体验<br /><span className="text-primary">一点时间。</span></> : <>今天先到这里，<br /><span className="text-primary">好梦，明天见。</span></>}</h1>
        <p className="mt-6 max-w-md whitespace-pre-wrap break-words text-sm leading-7 text-ink/60 sm:text-base">{status.message || (maintenance ? "我们正在为小店做些细致的维护。待一切准备好，再与你相见。" : "小店暂时打烊，正在为下一次相遇补充能量。谢谢你的耐心等待。")}</p>
        <div className="mt-7 flex items-start gap-3 rounded-2xl border border-ink/[0.07] bg-base/70 p-4">
          <Clock3 size={18} className="mt-0.5 shrink-0 text-primary" />
          <div><p className="text-sm font-bold">{maintenance ? "准备好后，我们就回来" : `预计 ${resume} 恢复营业`}</p>
            <p className="mt-1 text-xs leading-5 text-ink/50">{maintenance ? "恢复后本页会自动更新，无需反复刷新。" : `每日休息 ${status.offStart} – ${status.offEnd} · 北京时间`}</p></div>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          {preview ? <span className="btn-primary"><Search size={16} />查询已有订单<ArrowUpRight size={16} /></span> : <Link className="btn-primary" to="/order"><Search size={16} />查询已有订单<ArrowUpRight size={16} /></Link>}
          <span className="text-xs text-ink/45">{preview ? "效果预览 · 未改变营业状态" : "订单一直都在，安心等待就好"}</span>
        </div>
      </div>
      <div className="availability-art relative flex min-h-[330px] items-center justify-center overflow-hidden bg-accent-soft p-8 sm:min-h-[420px]" aria-hidden="true">
        <div className="absolute h-72 w-72 rounded-full border border-primary/10 sm:h-96 sm:w-96" />
        <div className="absolute h-56 w-56 rounded-full border border-primary/15 sm:h-72 sm:w-72" />
        <div className="absolute h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
        <Sparkles className="absolute left-[14%] top-[16%] text-primary/60" size={26} strokeWidth={1.3} />
        <span className="absolute right-[15%] top-[24%] h-3 w-3 rounded-full border border-primary/35" />
        <span className="absolute bottom-[20%] left-[15%] h-2 w-2 rounded-full bg-primary/30" />
        <div className="availability-art-card relative w-full max-w-[280px] -rotate-6 rounded-[2rem] border border-primary/15 bg-surface p-6 shadow-[0_24px_60px_rgb(var(--c-primary)/0.12)] sm:p-8">
          <div className="flex items-center justify-between border-b border-ink/10 pb-4"><span className="text-xs font-bold tracking-[0.18em] text-ink/50">{maintenance ? "A LITTLE REFRESH" : "SEE YOU TOMORROW"}</span><span className="h-2 w-2 rounded-full bg-primary/40" /></div>
          <div className="relative mx-auto my-6 grid h-28 w-28 place-items-center rounded-full bg-accent-soft text-primary">
            <Icon size={52} strokeWidth={1.2} />
            <span className="absolute -right-2 top-0 grid h-10 w-10 place-items-center rounded-full border-4 border-surface bg-primary text-primary-contrast">{maintenance ? <Sparkles size={16} /> : <span className="text-sm font-bold">zZ</span>}</span>
          </div>
          <p className="text-center text-2xl font-extrabold tracking-tight">{maintenance ? "美好，正在发生" : "小店休息中"}</p>
          <p className="mt-2 text-center text-xs text-ink/40">{maintenance ? "每一个细节，都值得被照顾" : "把期待留给下一个清晨"}</p>
          <div className="mt-6 flex items-center justify-center gap-2 rounded-full bg-base px-3 py-3 text-xs font-semibold text-primary">{maintenance ? <Wrench size={14} /> : <Sun size={14} />}{maintenance ? "维护进行中" : `${status.offEnd} 再见`}</div>
        </div>
        <div className="absolute bottom-[10%] right-[7%] flex rotate-6 items-center gap-2 rounded-2xl border border-primary/10 bg-surface px-4 py-3 text-xs font-bold text-primary shadow-sm"><ShieldCheck size={17} />订单妥善保管中</div>
      </div>
    </div>
    <div className="grid gap-5 border-t border-ink/[0.07] px-6 py-6 sm:grid-cols-3 sm:px-10">
      {[
        { icon: Search, title: "订单随时可查", text: "已购商品与交付记录保留" },
        { icon: PackageCheck, title: "已付款订单照常处理", text: "自动发货与支付确认持续运行" },
        { icon: Clock3, title: "新交易暂歇", text: "恢复后可下单、充值与购买文章" },
      ].map(({ icon: ServiceIcon, title, text }) => <div key={title} className="flex items-start gap-3"><ServiceIcon size={18} className="mt-0.5 shrink-0 text-primary/70" /><div><p className="text-xs font-bold">{title}</p><p className="mt-1 text-[11px] leading-5 text-ink/45">{text}</p></div></div>)}
    </div>
  </section>;
}
