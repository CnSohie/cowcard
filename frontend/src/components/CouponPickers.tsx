import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Globe2, Package, Search } from "lucide-react";

export type ProductOption = { id: number; name: string };
const pad = (n: number) => String(n).padStart(2, "0");
function today() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(type => parts.find(p => p.type === type)!.value).join("-");
}
function dayString(date: Date) { return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`; }
const focusStyle = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

export function ScopePicker({ value, onChange, products, error }: {
  value: number | null; onChange: (v: number | null) => void; products: ProductOption[]; error: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const specific = value != null;
  const selected = products.find(p => p.id === value);
  const filtered = products.filter(p => `${p.name} ${p.id}`.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function chooseAll() {
    setOpen(false);
    setQuery("");
    onChange(null);
  }

  function chooseSpecific() {
    setOpen(false);
    setQuery("");
    if (value == null) onChange(0);
  }

  return (
    <div ref={root} onKeyDown={(e) => { if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); } }}>
      <p className="label">适用范围</p>
      <div className="grid grid-cols-2 gap-3">
        {([
          { all: true, icon: Globe2, title: "全店通用", desc: "所有商品均可使用" },
          { all: false, icon: Package, title: "指定商品", desc: selected ? `已选 ${selected.name}` : "只对一款商品生效" },
        ] as const).map(({ all, icon: Icon, title, desc }) => {
          const active = all ? !specific : specific;
          return (
            <button key={title} type="button" aria-pressed={active}
              className={`rounded-2xl border p-4 text-left transition ${focusStyle} ${active ? "border-primary/50 bg-accent-soft" : "border-ink/10 bg-surface hover:border-primary/30"}`}
              onClick={all ? chooseAll : chooseSpecific}>
              <span className="mb-3 flex items-center justify-between text-primary">
                <Icon size={20} strokeWidth={1.6} />
                <span className={`grid h-4 w-4 place-items-center rounded-full border ${active ? "border-primary bg-primary text-primary-contrast" : "border-ink/20"}`}>
                  {active && <Check size={11} />}
                </span>
              </span>
              <span className="block text-sm font-bold">{title}</span>
              <span className="mt-1 block truncate text-[11px] leading-5 text-ink/45">{desc}</span>
            </button>
          );
        })}
      </div>

      {specific && (
        <div className="mt-3 rounded-2xl border border-ink/10 bg-surface p-3">
          {selected ? (
            <div className="flex items-center gap-3 rounded-xl bg-accent-soft px-3 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-primary"><Package size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-primary">已选商品</span>
                <span className="mt-0.5 block truncate text-sm font-bold text-ink">{selected.name}</span>
                <span className="mt-0.5 block text-[11px] text-ink/45">商品编号 #{selected.id}</span>
              </span>
              <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                {open ? "收起" : "更换"}
              </button>
            </div>
          ) : (
            <button type="button" aria-expanded={open} className={`flex w-full items-center gap-3 rounded-xl border border-dashed border-ink/15 px-3 py-3 text-left ${focusStyle}`}
              onClick={() => setOpen((v) => !v)}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-primary"><Package size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{value ? `商品 #${value}` : "选择商品"}</span>
                <span className="mt-0.5 block text-[11px] text-ink/45">{value ? "商品列表里没有这款，可能已删除" : "从商品列表中选择一款"}</span>
              </span>
              <ChevronDown size={16} className={`shrink-0 text-ink/40 transition ${open ? "rotate-180" : ""}`} />
            </button>
          )}

          {open && (
            <div id={id} className="mt-3 border-t border-ink/[0.07] pt-3">
              <div className="mb-2 flex items-center gap-2 rounded-xl bg-base px-3">
                <Search size={16} className="text-ink/40" />
                <input ref={search} aria-label="搜索适用商品" value={query} onChange={(e) => setQuery(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" placeholder="搜索商品名称 / ID…" />
              </div>
              <p className="px-2 py-2 text-[10px] font-semibold tracking-wider text-ink/40">{filtered.length} 款商品 · 单选</p>
              <div className="max-h-56 overflow-y-auto overscroll-contain" aria-label="商品列表">
                {filtered.map((p) => (
                  <button type="button" key={p.id} aria-pressed={p.id === value}
                    className={`mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-left ${focusStyle} ${p.id === value ? "bg-accent-soft text-primary" : "hover:bg-ink/[0.04]"}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { onChange(p.id); setQuery(""); setOpen(false); }}>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold">{p.name}</span>
                      <span className="mt-1 block text-[10px] text-ink/45">#{p.id}</span>
                    </span>
                    {p.id === value && <Check size={16} className="shrink-0" />}
                  </button>
                ))}
                {!filtered.length && (
                  <p className="px-4 py-8 text-center text-sm text-ink/45">{query ? "没有匹配的商品，换个关键词试试" : "暂无可选商品"}</p>
                )}
              </div>
            </div>
          )}
          {!selected && !open && (
            <p className="mt-2 px-1 text-[11px] text-ink/45">还没有选定商品，保存前需要选一款。</p>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>}
    </div>
  );
}

export function ExpiryPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? `${today()}T23:59:59`);
  const [month, setMonth] = useState((value ?? today()).slice(0, 7));
  const trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const date = draft.slice(0, 10), hour = draft.slice(11, 13), minute = draft.slice(14, 16);
  const [year, mon] = month.split("-").map(Number);
  const offset = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const close = () => { setOpen(false); trigger.current?.focus(); };
  function show() { setDraft(value ?? `${today()}T23:59:59`); setMonth((value ?? today()).slice(0, 7)); setOpen(true); }
  function preset(days: number | null) {
    if (days === null) onChange(null);
    else { const d = new Date(`${today()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); onChange(`${dayString(d)}T23:59:59`); }
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const dismiss = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return <div ref={root} onKeyDown={e => { if (e.key === "Escape" && open) { e.stopPropagation(); close(); } }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <div className="mb-2 flex items-center justify-between"><p className="label !mb-0">有效期至</p><span className="text-[10px] font-medium text-ink/40">北京时间 · UTC+8</span></div>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls={id} onClick={() => open ? close() : show()} className={`flex w-full items-center gap-3 rounded-2xl border bg-surface p-4 text-left ${focusStyle} ${open ? "border-primary/50" : "border-ink/10 hover:border-primary/30"}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-primary"><CalendarDays size={20} /></span><span className="flex-1"><span className="block text-sm font-bold">{value ? value.slice(0, 10).replace(/-/g, " / ") : "长期有效"}</span><span className="mt-1 block text-xs text-ink/45">{value ? `${value.slice(11)} 到期` : "不设到期时间 · 点击自定义"}</span></span><ChevronDown size={16} className={`text-ink/40 transition ${open ? "rotate-180" : ""}`} /></button>
    <div className="mt-3 flex flex-wrap gap-2">{[{ days: 0, label: "今天" }, { days: 7, label: "7 天" }, { days: 30, label: "30 天" }, { days: null, label: "长期有效" }].map(p => <button type="button" key={p.label} onClick={() => preset(p.days)} className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${focusStyle} ${p.days === null && !value ? "border-primary/20 bg-accent-soft text-primary" : "border-ink/10 text-ink/60 hover:border-primary/40"}`}>{p.label}</button>)}</div>
    {open && <div id={id} className="mt-3 rounded-3xl border border-primary/20 bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-5 flex items-center justify-between"><button type="button" aria-label="上个月" className={`rounded-full border border-ink/10 p-2 ${focusStyle}`} onClick={() => setMonth(dayString(new Date(Date.UTC(year, mon - 2, 1))).slice(0, 7))}><ChevronLeft size={16} /></button><span className="text-sm font-extrabold">{year} 年 {mon} 月</span><button type="button" aria-label="下个月" className={`rounded-full border border-ink/10 p-2 ${focusStyle}`} onClick={() => setMonth(dayString(new Date(Date.UTC(year, mon, 1))).slice(0, 7))}><ChevronRight size={16} /></button></div>
      <div className="grid grid-cols-7 gap-1">{"一二三四五六日".split("").map(d => <span key={d} className="py-2 text-center text-[10px] text-ink/40">{d}</span>)}{Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}{Array.from({ length: count }, (_, i) => { const day = `${month}-${pad(i + 1)}`, selected = day === date; return <button key={day} type="button" aria-label={day} aria-pressed={selected} aria-current={day === today() ? "date" : undefined} className={`relative aspect-square rounded-xl text-sm font-semibold transition ${focusStyle} ${selected ? "bg-primary text-primary-contrast shadow-sm" : "hover:bg-accent-soft"}`} onClick={() => setDraft(`${day}T${draft.slice(11)}`)}>{i + 1}{day === today() && <span className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${selected ? "bg-primary-contrast" : "bg-primary"}`} />}</button>; })}</div>
      <div className="mt-5 border-t border-ink/[0.08] pt-4"><div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-bold"><Clock3 size={14} />到期时刻</span><span className="rounded-lg bg-accent-soft px-3 py-1 font-mono text-sm font-bold text-primary">{hour} : {minute}</span></div>
        <div className="grid grid-cols-2 gap-3">{[{ label: "小时", count: 24, value: hour, hour: true }, { label: "分钟", count: 60, value: minute, hour: false }].map(part => <div key={part.label} className="rounded-xl border border-ink/10 p-2"><p className="pb-2 text-center text-[10px] text-ink/40">{part.label}</p><div className="grid max-h-28 grid-cols-3 gap-1 overflow-y-auto overscroll-contain">{Array.from({ length: part.count }, (_, i) => <button type="button" key={i} aria-label={`${pad(i)}${part.label}`} aria-pressed={part.value === pad(i)} className={`rounded-lg py-2 text-xs font-semibold ${focusStyle} ${part.value === pad(i) ? "bg-primary text-primary-contrast" : "hover:bg-accent-soft"}`} onClick={() => setDraft(`${date}T${part.hour ? pad(i) : hour}:${part.hour ? minute : pad(i)}:00`)}>{pad(i)}</button>)}</div></div>)}</div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><button type="button" className={`text-xs text-ink/50 ${focusStyle}`} onClick={close}>取消</button><button type="button" className="btn-primary !px-5 !py-2.5 text-xs" onClick={() => { onChange(draft); close(); }}><Check size={14} />确认到期时间</button></div>
    </div>}
    <p className="mt-2 text-[11px] leading-5 text-ink/40">快捷期限自动填至当天 23:59:59；自定义时间选择后点击确认。</p>
  </div>;
}
