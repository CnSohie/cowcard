import { useEffect, useState } from "react";
import { readSiteBranding, siteIconUrl, subscribeSiteIcon } from "../lib/site";

/** 站点图标。未上传时使用内置松绿标记。 */
export default function SiteMark({ className, alt = "" }: { className?: string; alt?: string }) {
  const [src, setSrc] = useState(() => siteIconUrl(readSiteBranding().icon));

  useEffect(() => subscribeSiteIcon(setSrc), []);

  return <img src={src} alt={alt} className={className ?? "h-9 w-9 rounded-2xl object-cover"} />;
}
