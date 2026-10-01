/**
 * 本机订单历史(localStorage):记录本浏览器上购买/查询过的订单凭证,
 * 游客无需翻邮箱即可一键再查询。保存订单查询凭证,不存查询密码。
 */
export interface LocalOrder {
  orderNo: string;
  contact: string;
  productName: string;
  amount: string;
  createdAt: string; // ISO
  queryToken?: string;
  historyToken?: string;
  historyExpiresAt?: string;
  presaleVoucherToken?: string;
}

const KEY = "ka.order.history";
const MAX = 20;

function orderKey(orderNo: string) {
  return orderNo.trim().toUpperCase();
}

function compact(list: LocalOrder[]): LocalOrder[] {
  const seen = new Set<string>();
  const result: LocalOrder[] = [];
  for (const item of list) {
    const key = orderKey(item.orderNo || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...item, orderNo: item.orderNo.trim() });
  }
  return result.slice(0, MAX);
}

export function localOrders(): LocalOrder[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as LocalOrder[]) : [];
    const cleaned = Array.isArray(list) ? compact(list) : [];
    if (Array.isArray(list) && cleaned.length !== list.length) {
      localStorage.setItem(KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return [];
  }
}

export function rememberOrder(o: LocalOrder, options: { bump?: boolean } = {}): void {
  try {
    const bump = options.bump ?? true;
    const key = orderKey(o.orderNo);
    const old = localOrders();
    const previous = old.find((x) => orderKey(x.orderNo) === key);
    const merged = {
      ...previous,
      ...o,
      orderNo: o.orderNo.trim(),
      queryToken: o.queryToken ?? previous?.queryToken,
      historyToken: o.historyToken ?? previous?.historyToken,
      historyExpiresAt: o.historyExpiresAt ?? previous?.historyExpiresAt,
      presaleVoucherToken: o.presaleVoucherToken ?? previous?.presaleVoucherToken,
    };
    const rest = old.filter((x) => orderKey(x.orderNo) !== key);
    const list = bump || !previous
      ? compact([merged, ...rest])
      : compact(old.map((x) => orderKey(x.orderNo) === key ? merged : x));
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 隐私模式等存储不可用:静默降级 */
  }
}

export function findLocalOrder(orderNo: string): LocalOrder | null {
  const key = orderKey(orderNo);
  return localOrders().find((x) => orderKey(x.orderNo) === key) ?? null;
}

export function forgetOrder(orderNo: string): void {
  try {
    const key = orderKey(orderNo);
    localStorage.setItem(KEY, JSON.stringify(localOrders().filter((x) => orderKey(x.orderNo) !== key)));
  } catch {
    /* ignore */
  }
}

export function consumePresaleVoucherToken(orderNo: string): void {
  try {
    const key = orderKey(orderNo);
    const list = localOrders().map((x) => {
      if (orderKey(x.orderNo) !== key) return x;
      const { presaleVoucherToken: _discard, ...rest } = x;
      return rest;
    });
    localStorage.setItem(KEY, JSON.stringify(compact(list)));
  } catch {
    /* ignore */
  }
}
