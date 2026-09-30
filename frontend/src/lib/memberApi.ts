import axios from "axios";
import { ApiError, type OrderView } from "./api";

/**
 * 会员端 API 客户端:与管理端(api.ts)完全隔离的令牌体系(ka.m.*)。
 * - 携带会员 JWT(kind=member);未登录则不带头,公开接口照常可用
 * - 401 自动走 /api/member/auth/refresh 刷新一次
 */
const http = axios.create({ baseURL: "/api", timeout: 15000 });

let accessToken: string | null = localStorage.getItem("ka.m.access");
let refreshToken: string | null = localStorage.getItem("ka.m.refresh");

export interface MemberInfo {
  id: number;
  email: string;
  nickname: string;
  inviteCode: string;
  levelId?: number | null;
  totalRecharge?: string;
  totalSpend?: string;
  createdAt?: string;
}

export function setMemberTokens(access: string | null, refresh: string | null) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem("ka.m.access", access);
  else localStorage.removeItem("ka.m.access");
  if (refresh) localStorage.setItem("ka.m.refresh", refresh);
  else localStorage.removeItem("ka.m.refresh");
}

export function saveMemberInfo(m: MemberInfo | null) {
  if (m) localStorage.setItem("ka.m.user", JSON.stringify(m));
  else localStorage.removeItem("ka.m.user");
}

export function memberInfo(): MemberInfo | null {
  try {
    const raw = localStorage.getItem("ka.m.user");
    return raw ? (JSON.parse(raw) as MemberInfo) : null;
  } catch {
    return null;
  }
}

export function isMemberLoggedIn() {
  accessToken = localStorage.getItem("ka.m.access");
  refreshToken = localStorage.getItem("ka.m.refresh");
  return !!accessToken;
}

export function memberLogout() {
  setMemberTokens(null, null);
  saveMemberInfo(null);
}

http.interceptors.request.use((cfg) => {
  accessToken = localStorage.getItem("ka.m.access");
  refreshToken = localStorage.getItem("ka.m.refresh");
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  else delete cfg.headers.Authorization;
  return cfg;
});

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  const originalRefresh = localStorage.getItem("ka.m.refresh");
  if (!originalRefresh) return false;
  refreshing = axios.post("/api/member/auth/refresh", { refreshToken: originalRefresh }, { timeout: 15000 })
    .then((r) => {
      // Another tab may have signed out or switched accounts while this request was in flight.
      if (localStorage.getItem("ka.m.refresh") !== originalRefresh) {
        throw new ApiError(-1, "登录状态已变化，请重试");
      }
      if (r.data.code === 0) {
        setMemberTokens(r.data.data.accessToken, r.data.data.refreshToken);
        return true;
      }
      if ([401, 1003, 1004].includes(r.data.code)) return false;
      throw new ApiError(r.data.code ?? -1, r.data.message ?? "登录续期暂时失败，请重试");
    })
    .catch((error: unknown) => {
      if (error instanceof ApiError) throw error;
      if (axios.isAxiosError(error) && localStorage.getItem("ka.m.refresh") === originalRefresh
          && (error.response?.status === 401 || [1003, 1004].includes(error.response?.data?.code))) return false;
      // A timeout, rate limit or server outage does not revoke a valid session.
      throw new ApiError(-1, "登录续期暂时失败，请稍后重试");
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

// A delayed 401 may belong to the old access token after another request refreshed it.
async function recoverSession(sentAuthorization: unknown): Promise<boolean> {
  const current = localStorage.getItem("ka.m.access");
  if (current && sentAuthorization !== `Bearer ${current}`) return true;
  return tryRefresh();
}

http.interceptors.response.use(
  async (resp) => {
    const body = resp.data;
    if (body && typeof body.code === "number" && body.code !== 0) {
      if (body.code === 1003) memberLogout();
      if (body.code === 401) {
        const cfg = resp.config as typeof resp.config & { _memberRetried?: boolean };
        if (!cfg._memberRetried && (await recoverSession(cfg.headers?.Authorization))) {
          cfg._memberRetried = true;
          return http.request(cfg);
        }
        memberLogout();
      }
      throw new ApiError(body.code, body.message ?? "请求失败");
    }
    return resp;
  },
  async (err) => {
    const resp = err.response;
    if (resp?.status === 401) {
      const cfg = err.config as typeof err.config & { _memberRetried?: boolean };
      if (!cfg?._memberRetried && (await recoverSession(cfg.headers?.Authorization))) {
        cfg._memberRetried = true;
        return http.request(cfg);
      }
    }
    if (resp?.status === 401) {
      memberLogout();
      throw new ApiError(401, "登录已过期,请重新登录");
    }
    if (resp?.status === 403 && resp.data?.code === 1003) {
      memberLogout();
      throw new ApiError(1003, resp.data?.message ?? "账户已被禁用");
    }
    if (resp?.status === 429) throw new ApiError(429, resp.data?.message ?? "请求过于频繁,请稍后再试");
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

export async function mGet<T>(url: string, params?: object): Promise<T> {
  const r = await http.get(url, { params });
  return r.data.data as T;
}

export async function mPost<T>(url: string, data?: object, options?: { headers?: Record<string, string> }): Promise<T> {
  const r = await http.post(url, data, options);
  return r.data.data as T;
}

// ---------- 认证 ----------

export interface MemberTokenResponse {
  accessToken: string;
  refreshToken: string;
  member: MemberInfo;
}

export async function memberLogin(email: string, password: string, captchaToken?: string) {
  const r = await mPost<MemberTokenResponse>("/member/auth/login", { email, password },
    captchaToken ? { headers: { "X-Captcha-Token": captchaToken } } : undefined);
  setMemberTokens(r.accessToken, r.refreshToken);
  saveMemberInfo(r.member);
  return r.member;
}

export async function memberRegister(email: string, password: string, nickname?: string, ref?: string, captchaToken?: string) {
  const r = await mPost<MemberTokenResponse>("/member/auth/register", {
    email, password,
    nickname: nickname || undefined,
    ref: ref || undefined,
  }, captchaToken ? { headers: { "X-Captcha-Token": captchaToken } } : undefined);
  setMemberTokens(r.accessToken, r.refreshToken);
  saveMemberInfo(r.member);
  return r.member;
}

// ---------- 类型 ----------

export interface PageResult<T> { items: T[]; total: number; page: number; size: number; }

export interface MemberMe {
  member: MemberInfo;
  level: {
    id: number;
    name: string;
    icon: string | null;
    discountRate: string;
    rechargeThreshold: string;
    spendThreshold: string;
  } | null;
  balance: string;
  frozen: string;
  shoppingBalance: string;
  withdrawableBalance: string;
  shoppingFrozen: string;
  withdrawableFrozen: string;
  withdrawalFrozen: string;
  invitedCount: number;
  commissionTotal: string;
}

export interface WalletSummary {
  balance: string;
  frozen: string;
  shoppingBalance: string;
  withdrawableBalance: string;
  shoppingFrozen: string;
  withdrawableFrozen: string;
  withdrawalFrozen: string;
  totalCommission: string;
  minWithdraw: string;
  commissionRate: string;
  freezeReason: string | null;
  withdrawMethods: WithdrawMethod[];
}

export interface WithdrawMethod {
  code: string; label: string; accountLabel: string; accountPlaceholder: string;
  accountNameRequired: boolean; bankNameRequired: boolean; warning: string; feeRate: string; feeFixed: string;
}

export interface TxnView {
  shoppingAmount: string | null;
  withdrawableAmount: string | null;
  id: number;
  type: "RECHARGE" | "PURCHASE" | "COMMISSION" | "WITHDRAW_FREEZE" | "WITHDRAW_REJECT"
    | "ADMIN_FREEZE" | "ADMIN_UNFREEZE" | "RECHARGE_REVERSAL" | "WALLET_ORDER_REFUND"
    | "ADMIN_REFUND" | "GIFT_CARD" | "ADJUST";
  amount: string;
  balanceAfter: string;
  remark: string | null;
  createdAt: string;
}

export interface WithdrawView {
  withdrawableSource: boolean;
  payoutAmount: string | null;
  payoutCurrency: string | null;
  payoutFxRate: string | null;
  id: number;
  amount: string;
  feeAmount: string;
  netAmount: string;
  channel: string;
  account: string;
  accountName: string | null;
  bankName: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface PresaleVoucherView {
  workNo: string;
  orderNo: string;
  productName: string;
  quantity: number;
  status: string;
  tokenHint: string;
  redeemContact: string | null;
  fulfillmentNote: string | null;
  presaleStartAt: string | null;
  presaleEndAt: string | null;
  redeemedAt: string | null;
  fulfilledAt: string | null;
  cards: string[];
}

export interface SupportTicketView {
  id: number;
  subject: string;
  category: string | null;
  relatedOrderNo: string | null;
  message: string;
  reply: string | null;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  repliedAt: string | null;
  messages: {
    id: number;
    senderType: "MEMBER" | "STAFF";
    senderName: string | null;
    content: string;
    createdAt: string | null;
  }[];
  canFollowUp: boolean;
}

export interface ArticleCard {
  id: number; slug: string; title: string; category: string | null; tags: string | null;
  coverImage: string | null; summary: string | null; price: string; pinned: boolean;
  views: number; purchaseCount: number; publishedAt: string | null;
}

export interface ArticleDetail {
  id: number; slug: string; title: string; category: string | null; tags: string | null;
  coverImage: string | null; summary: string | null; price: string; pinned: boolean;
  views: number; publishedAt: string | null;
  content: string; locked: boolean; purchased: boolean;
}

export interface PurchaseView {
  id: number; articleId: number; title: string; slug: string | null;
  price: string; createdAt: string;
}

export type MemberOrderView = OrderView;
