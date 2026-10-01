import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { get, isLoggedIn, subscribeAdminSession } from "../lib/api";

/** 未确认会话前不挂载后台布局或子页面，避免首帧闪现和提前请求。 */
export default function AdminAuthGuard({ children }: { children: ReactNode }) {
  const loggedIn = useSyncExternalStore(subscribeAdminSession, isLoggedIn);
  const [status, setStatus] = useState<"checking" | "ready" | "failed">("checking");

  useEffect(() => {
    if (!loggedIn) return;
    let active = true;
    // 此接口仅允许管理员令牌访问，不要求额外业务权限。
    get("/auth/totp/status").then(
      () => { if (active) setStatus("ready"); },
      () => { if (active) setStatus("failed"); },
    );
    return () => { active = false; };
  }, [loggedIn]);

  if (!loggedIn || status === "failed") return <Navigate to="/admin/login" replace />;
  if (status !== "ready") {
    return <div className="grid min-h-screen place-items-center text-sm text-ink/50" role="status">正在验证登录状态…</div>;
  }
  return <>{children}</>;
}
