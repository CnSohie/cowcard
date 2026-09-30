import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export default function CatalogSelect({ label, value, options, onChange, icon, className = "" }: {
  label: string; value: string; options: { value: string; label: string }[];
  onChange: (value: string) => void; icon?: ReactNode; className?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  const show = () => { setActive(selected); setOpen(true); };
  const choose = (index: number) => {
    if (options[index]) onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);
  return <div ref={root} className={`catalog-dropdown ${className}`} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={trigger} type="button" role="combobox" aria-label={label} aria-expanded={open}
      aria-haspopup="listbox" aria-controls={open ? id : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined}
      className="catalog-dropdown-trigger" onClick={() => open ? setOpen(false) : show()}
      onKeyDown={(event) => {
        if (["ArrowDown", "ArrowUp", "Home", "End", "Escape", "Enter", " "].includes(event.key)) {
          if (event.key === "Escape") { if (open) { event.preventDefault(); setOpen(false); } return; }
          event.preventDefault();
          if (event.key === "Enter" || event.key === " ") { if (open) choose(active); else show(); return; }
          if (!open) { show(); return; }
          setActive((index) => event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const index = options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
          if (index >= 0) { event.preventDefault(); setOpen(true); setActive(index); }
        }
      }}>
      {icon}<span className="min-w-0 flex-1 truncate">{options[selected]?.label}</span>
      <ChevronDown size={14} aria-hidden="true" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div id={id} role="listbox" aria-label={label} className="catalog-dropdown-menu">
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option"
        aria-selected={option.value === value} className={`catalog-dropdown-option ${index === active ? "is-active" : ""}`}
        onPointerMove={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
        <span className="min-w-0 flex-1 break-words">{option.label}</span>
        {option.value === value && <Check size={14} className="shrink-0" aria-hidden="true" />}
      </div>)}
    </div>}
  </div>;
}
