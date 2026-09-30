import { localOrders } from "./orderHistory";

const KEY = "ka.contact";
const validEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

export function recalledContact(): string {
  try {
    const stored = document.cookie.split("; ").find((part) => part.startsWith(`${KEY}=`));
    const email = stored ? decodeURIComponent(stored.slice(KEY.length + 1)) : "";
    if (validEmail(email)) return email;
  } catch { /* Cookie 不可用时回落本机订单历史。 */ }
  return localOrders().find((order) => validEmail(order.contact))?.contact ?? "";
}

export function rememberContact(value: string): void {
  const email = value.trim();
  if (!validEmail(email)) return;
  try {
    document.cookie = `${KEY}=${encodeURIComponent(email)}; Path=/; Max-Age=15552000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  } catch { /* 禁用 Cookie 不影响下单。 */ }
}
