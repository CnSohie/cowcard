/** Crop to the upload frame before storing, without stretching the image. */
export type CropAspect = "square" | "video" | "wide";

/** 上传画框与前台渲染比例必须一致,否则卡片会二次裁掉商家在预览里看到的内容。 */
export const CROP_RATIOS: Record<CropAspect, number> = { square: 1, video: 16 / 9, wide: 16 / 10 };

export async function cropImage(file: File, aspect: CropAspect): Promise<File> {
  if (file.size > 5 * 1024 * 1024) throw new Error("图片不能超过 5MB");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ratio = CROP_RATIOS[aspect];
    const width = Math.min(image.naturalWidth, image.naturalHeight * ratio);
    const height = width / ratio;
    if (!width || !height) throw new Error("无法读取图片尺寸，请更换图片");
    const canvas = document.createElement("canvas");
    // Bound memory and upload size; avoid enlarging small originals.
    const unit = Math.max(1, Math.floor(aspect === "square" ? width : width / 16));
    canvas.width = Math.round(aspect === "square" ? unit : unit * 16);
    canvas.height = Math.round(canvas.width / ratio);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法处理图片，请更换浏览器后重试");
    context.imageSmoothingQuality = "high";
    context.drawImage(image, (image.naturalWidth - width) / 2, (image.naturalHeight - height) / 2,
      width, height, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("图片裁剪失败，请重试")), "image/webp", 0.9);
    });
    if (blob.size > 5 * 1024 * 1024) throw new Error("裁剪后的图片超过 5MB，请选择较小的图片");
    const extension = blob.type === "image/webp" ? "webp" : "png";
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-cropped.${extension}`, { type: blob.type });
  } catch (error) {
    if (error instanceof DOMException) throw new Error("无法读取图片，请选择有效的 PNG / JPG / WebP 图片");
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}
