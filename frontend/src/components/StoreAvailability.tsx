import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import AvailabilityPanel, { type AvailabilityStatus } from "./AvailabilityPanel";
import { get } from "../lib/api";

export default function StoreAvailability({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AvailabilityStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    let disposed = false;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const value = await get<AvailabilityStatus>("/store/availability");
        if (!disposed) { setStatus(value); setFailed(false); }
      } catch { if (!disposed) setFailed(true); }
      finally { running = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    window.addEventListener("focus", refresh);
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [pathname]);

  // 已有订单付款、查询、提货、会员售后保持可用。
  const existingService = /^\/(order|tg\/order|pay\/[^/]+|me|login|register|redeem|tos|about)\/?$/.test(pathname);
  if (!status && !existingService) return <div className="card p-10 text-center" role="status">{failed ? "暂时无法获取营业状态，正在重试…" : "正在获取营业状态…"}</div>;
  if (!status || status.state === "OPEN") return <>{children}</>;
  return <>
    <AvailabilityPanel status={status} compact={existingService} />
    {existingService && children}
  </>;
}
