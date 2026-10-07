import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useI18n } from "../lib/i18n";

/** 保留原始内容,长卡密只限制展示高度,复制始终使用完整原文。 */
export default function SecretBlock({ value, label }: { value: string; label?: string }) {
  const { lang } = useI18n();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setError(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch { setError(true); }
  }
  return <div className="secret-block w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-primary/10 bg-accent-soft/50 text-left">
    <div className="secret-block-toolbar flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-primary/10 px-4 py-2">
      <span className="min-w-0 truncate text-xs font-semibold text-ink/55">{label || (lang === "zh" ? "交付内容" : "Delivery content")}</span>
      <button type="button" className="btn-ghost shrink-0 !px-3 !py-2 text-xs" onClick={copy}>
        {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? (lang === "zh" ? "已复制" : "Copied") : (lang === "zh" ? "复制完整内容" : "Copy all")}
      </button>
    </div>
    <pre tabIndex={0} aria-label={label || (lang === "zh" ? "完整交付内容" : "Full delivery content")}
      className="m-0 max-h-[min(40dvh,20rem)] min-w-0 overflow-auto whitespace-pre-wrap break-all px-4 py-3 font-mono text-sm leading-relaxed text-ink [overflow-wrap:anywhere] select-text">{value}</pre>
    {error && <p role="status" className="px-4 pb-3 text-xs text-red-500">{lang === "zh" ? "复制失败，请选择上方内容手动复制。" : "Copy failed. Select the text above to copy manually."}</p>}
  </div>;
}
