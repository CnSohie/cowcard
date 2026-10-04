import { useRef, useState } from "react";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { ApiError, uploadImage } from "../lib/api";
import { cropImage } from "../lib/cropImage";
import { siteIconUrl } from "../lib/site";

/** 站点设置里的图标上传。留空保存后回到内置图标。 */
export default function SiteIconField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const custom = value.trim().length > 0;
  const preview = siteIconUrl(value);

  async function handleFile(file?: File | null) {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择 PNG、JPG 或 WebP 图片");
      return;
    }
    setError("");
    setBusy(true);
    try {
      onChange(await uploadImage(await cropImage(file, "square")));
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "上传失败，请重试");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mb-4">
      <label className="label">站点图标</label>
      <div className="flex flex-wrap items-center gap-4">
        <img src={preview} alt="" className="h-14 w-14 rounded-2xl border border-ink/10 object-cover" />
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-5 text-ink/50">
            显示在浏览器标签、商城左上角和后台侧栏。上传后会居中裁成正方形，保存站点设置后生效。不上传则使用内置图标。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="选择站点图标" className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])} />
            <button type="button" className="btn-ghost !px-4 !py-2 text-xs" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {custom ? "更换图标" : "上传图标"}
            </button>
            {custom && (
              <button type="button" className="btn-ghost !px-4 !py-2 text-xs" disabled={busy} onClick={() => { setError(""); onChange(""); }}>
                <Trash2 size={13} /> 恢复默认
              </button>
            )}
          </div>
          {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}
