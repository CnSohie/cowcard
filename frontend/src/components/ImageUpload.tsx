import { useRef, useState, type DragEvent } from "react";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { ApiError, uploadImage } from "../lib/api";

/**
 * 图片上传(拖拽 / 点选):上传至 /api/admin/files,返回 /files/** URL。
 * 用于商品封面与文章封面/配图。
 */
export default function ImageUpload({
  value,
  onChange,
  hint = "PNG / JPG / WebP · ≤5MB",
  aspect = "video",
}: {
  value: string;
  onChange: (url: string) => void;
  hint?: string;
  aspect?: "video" | "square";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file?: File | null) {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) {
      setError("仅支持图片文件");
      return;
    }
    setError("");
    setBusy(true);
    try {
      onChange(await uploadImage(file));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "上传失败,请重试");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  const ratio = aspect === "square" ? "aspect-square" : "aspect-video";

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])} />

      {value ? (
        <div className={`group relative overflow-hidden rounded-2xl border border-ink/10 ${ratio}`}>
          <img src={value} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-ink/50 opacity-0 backdrop-blur-[2px] transition group-hover:opacity-100">
            <button type="button" onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-xs font-semibold text-ink shadow-lg">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} 更换
            </button>
            <button type="button" onClick={() => onChange("")}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-xs font-semibold text-red-500 shadow-lg">
              <Trash2 size={13} /> 移除
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={`grid w-full place-items-center rounded-2xl border-2 border-dashed transition ${ratio} ${
            drag ? "border-primary bg-accent-soft/60" : "border-ink/15 bg-ink/[0.02] hover:border-primary/60 hover:bg-accent-soft/30"
          }`}>
          <span className="flex flex-col items-center gap-2 px-4 py-6 text-center">
            {busy
              ? <Loader2 size={22} className="animate-spin text-primary" />
              : <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft"><ImagePlus size={19} className="text-primary" /></span>}
            <span className="text-sm font-medium text-ink/70">{busy ? "上传中…" : "点击或拖拽图片到此处"}</span>
            <span className="text-[11px] text-ink/35">{hint}</span>
          </span>
        </button>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
