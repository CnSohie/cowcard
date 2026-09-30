import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { rememberOrder, type LocalOrder } from "../../lib/orderHistory";

/** Explicit exchange button prevents link previews and StrictMode from consuming a one-time ticket. */
export default function TelegramOrderPage() {
  const navigate = useNavigate();
  const [ticket] = useState(() => window.location.hash.slice(1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);

  async function openOrder() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/telegram/ticket", {
        method: "POST", credentials: "omit", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket }),
      });
      const result = await response.json() as { code: number; message: string; data: LocalOrder };
      if (!response.ok || result.code !== 0) throw new Error(result.message || "无法打开订单");
      rememberOrder(result.data);
      navigate("/order", { replace: true, state: {
        orderNo: result.data.orderNo, contact: result.data.contact, queryToken: result.data.queryToken,
      } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败，请返回 Bot 重新获取链接。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-lg px-5 py-20">
    <p className="mb-4 text-sm font-semibold tracking-widest text-primary">TELEGRAM · KA</p>
    <h1 className="text-4xl font-bold tracking-tight text-ink">你的订单，随时可查。</h1>
    <div className="mt-8 rounded-3xl bg-surface p-8">
      <p className="leading-7 text-ink/65">确认后查看订单进度与已交付的卡密。订单凭证将保存在当前浏览器，请在自己的设备上打开。</p>
      <p className="mt-3 text-sm text-ink/50">链接 5 分钟内有效，仅可使用一次。过期后可在 Bot 的「我的订单」中获取新链接。</p>
      {error && <p role="alert" className="mt-5 text-sm text-ink">{error}</p>}
      {!/^[A-Za-z0-9_-]{43}$/.test(ticket)
        ? <p role="alert" className="mt-5 text-ink">缺少有效凭证，请从 Bot 重新打开订单。</p>
        : <button type="button" className="btn-primary mt-6 w-full" disabled={busy} onClick={openOrder}>
            {busy ? "正在验证…" : "安全查看订单"}
          </button>}
      <Link className="mt-5 block text-center text-sm text-ink/60" to="/">返回商城</Link>
    </div>
  </main>;
}
