import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import AvailabilityPanel, { type AvailabilityStatus } from "./AvailabilityPanel";
import { get } from "../lib/api";
import { useI18n } from "../lib/i18n";

const StoreBootContext = createContext<(path: string) => void>(() => {});

/** 页面第一次数据请求结束时上报。营业状态和页面加载共用同一张状态卡，避免两条「加载中」。 */
export function useStorePageLoading(loading: boolean) {
  const report = useContext(StoreBootContext);
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    if (!loading) report(pathname);
  }, [loading, pathname, report]);
}

export function StoreLoadingCard({ label }: { label: string }) {
  return <div className="card min-h-64 animate-pulse p-8 text-center" role="status">{label}</div>;
}

export default function StoreAvailability({ children }: { children: ReactNode }) {
  const { lang, copy } = useI18n();
  const { pathname } = useLocation();
  const [status, setStatus] = useState<AvailabilityStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [bootPath, setBootPath] = useState<string | null>(null);
  const reportReady = useCallback((path: string) => {
    setBootPath((prev) => (prev === path ? prev : path));
  }, []);

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
  const closed = status != null && status.state !== "OPEN";
  // 营业状态未返回，或当前页第一次数据还没好：只显示一张加载卡。页面挂在隐藏层里继续请求。
  const cover = !existingService && !closed && (status == null || bootPath !== pathname);
  const hideChildren = cover || (closed && !existingService);
  const pendingLabel = failed && status == null
    ? (lang === "zh" ? "暂时无法获取营业状态，正在重试…" : "Store status is unavailable. Retrying…")
    : copy.common.loading;

  return (
    <StoreBootContext.Provider value={reportReady}>
      {cover && <StoreLoadingCard label={pendingLabel} />}
      {status && status.state !== "OPEN" && <AvailabilityPanel status={status} compact={existingService} />}
      {/* 必须是真实盒子。display:contents 会让 Turnstile 的跨域 iframe 失去布局，切到提货等页面时整页空白。 */}
      <div hidden={hideChildren || undefined}>
        {children}
      </div>
    </StoreBootContext.Provider>
  );
}
