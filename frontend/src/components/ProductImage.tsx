import { useState } from "react";
import { Package } from "lucide-react";
import { matchProductBrand } from "../lib/productBrand";

/** Custom cover > locally bundled brand mark > generic product icon. */
export default function ProductImage({ name, coverImage, className = "" }: {
  name: string;
  coverImage?: string | null;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const brand = matchProductBrand(name);
  const hasCover = !!coverImage && failedUrl !== coverImage;
  return (
    <span className={`product-image${!hasCover && brand ? " product-image-brand" : ""} ${className}`}>
      {hasCover
        ? <img src={coverImage} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(coverImage)} />
        : brand
          ? <svg viewBox={brand.viewBox ?? "0 0 24 24"} aria-hidden="true" className={`product-brand-mark${brand.slug === "giffgaff" ? " product-brand-wordmark" : ""}`}><path fill="currentColor" d={brand.path} /></svg>
          : <Package size={22} aria-hidden="true" />}
    </span>
  );
}
