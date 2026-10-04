import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Clock3, Moon, Sun, Wrench } from "lucide-react";

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
const pad = (value: number) => String(value).padStart(2, "0");

function TimePicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const parts = draft.split(":");
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const dismiss = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return <div ref={root} onKeyDown={e => { if (open && e.key === "Escape") { e.stopPropagation(); close(); } }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <p className="mb-2 text-xs font-semibold text-ink/55">{label}</p>
    <button type="button" ref={trigger} aria-label={label} aria-expanded={open} className={`flex w-full items-center justify-between gap-2 rounded-2xl border bg-surface px-4 py-3 ${focus} ${open ? "border-primary/50" : "border-ink/10 hover:border-primary/30"}`} onClick={() => { if (open) close(); else { setDraft(value); setOpen(true); } }}><span className="font-mono text-2xl font-bold tracking-tight">{value}</span><ChevronDown size={16} className={`text-primary transition ${open ? "rotate-180" : ""}`} /></button>
    {open && <div className="mt-2 rounded-2xl border border-primary/20 bg-surface p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between text-xs"><span className="text-ink/45">北京时间</span><span className="font-mono font-bold text-primary">{draft}</span></div>
      <div className="grid grid-cols-2 gap-2">{[24, 60].map((count, part) => <div key={count}><p className="mb-2 text-center text-[10px] text-ink/40">{part === 0 ? "小时" : "分钟"}</p><div className="grid max-h-36 grid-cols-2 gap-1 overflow-y-auto overscroll-contain rounded-xl bg-base p-1">{Array.from({ length: count }, (_, n) => <button type="button" key={n} aria-label={`${pad(n)}${part === 0 ? "时" : "分"}`} aria-pressed={parts[part] === pad(n)} className={`rounded-lg py-2 text-xs font-semibold ${focus} ${parts[part] === pad(n) ? "bg-primary text-primary-contrast" : "hover:bg-accent-soft"}`} onClick={() => setDraft(part === 0 ? `${pad(n)}:${parts[1]}` : `${parts[0]}:${pad(n)}`)}>{pad(n)}</button>)}</div></div>)}</div>
      <div className="mt-3 flex items-center justify-between gap-2"><button type="button" className={`rounded-lg p-2 text-xs text-ink/50 ${focus}`} onClick={close}>取消</button><button type="button" className="btn-primary !px-3 !py-2 text-xs" onClick={() => { onChange(draft); close(); }}><Check size={12} />确定</button></div>
    </div>}
  </div>;
}

export default function AvailabilityForm({ cfg, set }: { cfg: Record<string, string>; set: (key: string, value: string) => void }) {
  const start = cfg["site.off_hours.start"] || "22:00";
  const end = cfg["site.off_hours.end"] || "09:00";
  return <div className="grid items-start gap-4 lg:grid-cols-2">
    {[{ key: "maintenance", icon: Wrench, title: "手动维护", desc: "为小店留一点焕新的时间", placeholder: "网站维护中，请稍后再来。" }, { key: "off_hours", icon: Moon, title: "每日休息", desc: "到点打烊，也准时回来", placeholder: "已经下班啦，营业后欢迎再来。" }].map(({ key, icon: Icon, title, desc, placeholder }) => {
      const enabled = cfg[`site.${key}.enabled`] === "1";
      const message = cfg[`site.${key}.message`] ?? "";
      return <section key={key} className={`overflow-hidden rounded-3xl border transition ${enabled ? "border-primary/30 bg-accent-soft/30" : "border-ink/10 bg-surface"}`}>
        <div className="flex items-center gap-3 p-5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-primary"><Icon size={21} strokeWidth={1.7} /></span><div className="min-w-0 flex-1"><h3 className="text-sm font-bold">{title}</h3><p className="mt-1 text-[11px] text-ink/45">{desc}</p></div><button type="button" role="switch" aria-label={`开启${title}`} aria-checked={enabled} onClick={() => set(`site.${key}.enabled`, enabled ? "0" : "1")} className={`relative h-7 w-12 shrink-0 rounded-full transition ${focus} ${enabled ? "bg-primary" : "bg-ink/15"}`}><span className={`absolute top-1 grid h-5 w-5 place-items-center rounded-full bg-surface shadow-sm transition-transform ${enabled ? "translate-x-6" : "translate-x-1"} left-0`}>{enabled && <Check size={11} className="text-primary" />}</span></button></div>
        <div className="px-5 pb-5">
          <div className="mb-5 flex items-start gap-2 rounded-xl bg-surface/80 p-3 text-xs leading-5 text-ink/55"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${enabled ? "bg-primary" : "bg-ink/25"}`} /><span>{key === "maintenance" ? (enabled ? "保存后暂停接单，优先于每日休息计划。" : "当前配置关闭维护，营业状态按每日计划判断。") : (enabled ? "保存后每日自动执行，到点自动恢复营业。" : "当前配置关闭自动休息，可先编辑好营业计划。")}</span></div>
          {key === "off_hours" && <>
            <div className="mb-3 grid grid-cols-2 gap-3"><TimePicker label="下班时间" value={start} onChange={v => set("site.off_hours.start", v)} /><TimePicker label="恢复营业" value={end} onChange={v => set("site.off_hours.end", v)} /></div>
            <div className="mb-3 flex flex-wrap gap-2">{["22:00–09:00", "23:00–08:00", "00:00–08:00"].map(range => <button type="button" key={range} className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold ${focus} ${`${start}–${end}` === range ? "border-primary/25 bg-accent-soft text-primary" : "border-ink/10 text-ink/50 hover:border-primary/30"}`} onClick={() => { const [a, b] = range.split("–"); set("site.off_hours.start", a); set("site.off_hours.end", b); }}>{range}</button>)}</div>
            <p className={`mb-5 flex items-center gap-2 text-[11px] leading-5 ${start === end ? "text-red-600 dark:text-red-400" : "text-ink/50"}`}><Sun size={14} className="shrink-0" />{start === end ? "开始与结束时间不能相同，请调整后保存。" : `${start} 下班 → ${start > end ? "次日 " : "当日 "}${end} 恢复 · 北京时间`}</p>
          </>}
          <label className="label" htmlFor={`availability-${key}`}>买家看到的提示</label><textarea id={`availability-${key}`} rows={4} maxLength={500} className="input resize-y !rounded-2xl !bg-surface text-sm leading-6 focus:!border-primary/40" value={message} placeholder={placeholder} onChange={e => set(`site.${key}.message`, e.target.value)} /><div className="mt-2 flex justify-between gap-2 text-[10px] text-ink/40"><span>留空使用默认文案 · 下方即时预览</span><span className="shrink-0 tabular-nums">{message.length} / 500</span></div>
          {key === "maintenance" && <p className="mt-5 flex items-start gap-2 border-t border-ink/[0.07] pt-4 text-[11px] leading-6 text-ink/45"><Clock3 size={14} className="mt-1 shrink-0" />维护不会中断已有订单的支付确认和自动发货，后台与查单仍然可用。</p>}
        </div>
      </section>;
    })}
  </div>;
}
