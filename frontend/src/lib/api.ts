import axios from "axios";

/** 统一 API 客户端:自动附带 JWT、401 时尝试刷新令牌、业务码非 0 抛错。 */
const http = axios.create({ baseURL: "/api", timeout: 15000 });

let accessToken: string | null = localStorage.getItem("ka.access");
let refreshToken: string | null = localStorage.getItem("ka.refresh");

export function setTokens(access: string | null, refresh: string | null) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem("ka.access", access);
  else localStorage.removeItem("ka.access");
  if (refresh) localStorage.setItem("ka.refresh", refresh);
  else localStorage.removeItem("ka.refresh");
}

export function isLoggedIn() {
  return !!accessToken;
}

http.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  refreshing = refreshing ?? axios
    .post("/api/auth/refresh", { refreshToken })
    .then((r) => {
      if (r.data.code === 0) {
        setTokens(r.data.data.accessToken, r.data.data.refreshToken);
        return true;
      }
      return false;
    })
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing ?? false;
}

http.interceptors.response.use(
  async (resp) => {
    const body = resp.data;
    if (body && typeof body.code === "number" && body.code !== 0) {
      if (body.code === 401 && (await tryRefresh())) return http.request(resp.config);
      throw new ApiError(body.code, body.message ?? "请求失败");
    }
    return resp;
  },
  async (err) => {
    const resp = err.response;
    if (resp?.status === 401 && (await tryRefresh())) {
      return http.request(err.config);
    }
    if (resp?.status === 401) {
      setTokens(null, null);
      throw new ApiError(401, "登录已过期,请重新登录");
    }
    if (resp?.status === 429) throw new ApiError(429, resp.data?.message ?? "请求过于频繁,请稍后再试");
    // 以下三种都是"后端没答上来",给出可操作的提示而非含糊的"网络异常"
    if (!resp) {
      throw new ApiError(-1, "连不上后端服务:请确认后端已启动(IntelliJ 控制台出现 Started KaApplication)");
    }
    if (typeof resp.data === "string" && [500, 502, 504].includes(resp.status)) {
      throw new ApiError(resp.status, "后端服务未响应:可能正在启动或已停止,请查看 IntelliJ 控制台");
    }
    if (resp.status === 404 && !resp.data?.message) {
      throw new ApiError(404, "接口不存在:后端可能还是旧版本,请重启后端使新接口生效");
    }
    throw new ApiError(resp.status, resp.data?.message ?? `请求失败(HTTP ${resp.status})`);
  },
);

export class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export async function get<T>(url: string, params?: object): Promise<T> {
  const r = await http.get(url, { params });
  return r.data.data as T;
}

export async function post<T>(url: string, data?: object, options?: { headers?: Record<string, string> }): Promise<T> {
  const r = await http.post(url, data, options);
  return r.data.data as T;
}

export async function put<T>(url: string, data?: object): Promise<T> {
  const r = await http.put(url, data);
  return r.data.data as T;
}

export async function del<T>(url: string): Promise<T> {
  const r = await http.delete(url);
  return r.data.data as T;
}

/** 管理端图片上传(商品封面 / 文章配图),返回 /files/** 公开 URL。 */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const r = await http.post("/admin/files", form, { timeout: 60000 });
  return (r.data.data as { url: string }).url;
}

// ---------- 类型 ----------
export interface ProductCard {
  id: number; categoryId: number; name: string; brief: string | null;
  coverImage: string | null; price: string; minOrderAmount: string; stock: number; minBuy: number; maxBuy: number;
  deliveryMode: "AUTO_CARD" | "MANUAL" | "PRESALE_VOUCHER";
  presaleSaleEndAt: string | null; presaleStartAt: string | null; presaleEndAt: string | null;
}
export interface ProductDetail extends ProductCard {
  description: string | null; manualPrompt: string | null; manualFormSchema: string | null;
  presaleSettlementMode: "SINK" | "REFUND" | "BALANCE" | null;
}
export interface Category { id: number; name: string; sortOrder: number; visible: boolean; }
export interface Channel { code: string; displayName: string; feeRate: string; feeFixed: string; }
export interface ChainOption {
  chainCode: string; chainId: number; confirmations: number;
  tokens: { symbol: string; contract: string; decimals: number }[];
}
export interface CryptoIntent {
  status: "WAITING" | "CONFIRMING" | "CONFIRMED" | "EXPIRED";
  chainCode: string; chainId: number; tokenSymbol: string; tokenContract: string;
  decimals: number; amount: string; amountMinor: string; address: string;
  confirmations: number; requiredConfirmations: number; expireAt: string;
  txHash: string | null; eip681: string;
}
export interface OrderView {
  orderNo: string; productName: string; unitPrice: string; quantity: number; amount: string;
  discountAmount: string; walletPaidAmount: string;
  status: string; paidChannel: string | null; createdAt: string; expireAt: string;
  paidAt: string | null; cards: string[]; usageNote: string | null;
  deliveryMode: "AUTO_CARD" | "MANUAL" | "PRESALE_VOUCHER"; buyerNote: string | null; deliveryContent: string | null;
  presaleVoucherHint: string | null; presaleVoucherStatus: string | null; presaleFulfillmentNote: string | null;
  presaleStartAt: string | null; presaleEndAt: string | null;
}
export interface CreateOrderResponse {
  orderNo: string; amount: string; expireAt: string; queryToken: string;
  walletPaidAmount: string; memberDiscountAmount: string; presaleVoucherToken: string | null;
}
export interface PayCreation { kind: "QRCODE" | "REDIRECT" | "HTML_FORM" | "CRYPTO" | "BALANCE"; data: Record<string, unknown>; }
export interface PaySummary {
  orderNo: string; orderType: "GOODS" | "RECHARGE"; productName: string;
  amount: string; status: string; expireAt: string; walletPaidAmount: string; deliveryMode: "AUTO_CARD" | "MANUAL" | "PRESALE_VOUCHER";
}
