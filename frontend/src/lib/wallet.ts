/**
 * 钱包直付(模式 B):
 * - EIP-6963 多钱包发现(MetaMask / OKX / Rabby / Coinbase … 浏览器原生标准,零依赖),买家自选;
 * - 兼容旧式 window.ethereum 单注入;
 * - ERC-20 transfer calldata 手工 ABI 编码(选择器 a9059cbb + 32字节地址 + 32字节金额)。
 * 「桌面无插件 × 手机 App 钱包」场景由 EIP-681 收款二维码覆盖(手机钱包扫码自动带链/币/金额);
 * 升级点:接 Reown AppKit(WalletConnect v2,需在 cloud.reown.com 注册 projectId)可再补远程签名场景。
 */
export interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, cb: (...args: unknown[]) => void): void;
}

declare global {
  interface Window { ethereum?: EthereumProvider; }
}

export interface WalletOption {
  uuid: string;
  name: string;
  icon: string; // data: URI(钱包自报图标)
  provider: EthereumProvider;
}

const discovered = new Map<string, WalletOption>();

if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (e) => {
    const detail = (e as CustomEvent<{
      info?: { uuid?: string; name?: string; icon?: string };
      provider?: EthereumProvider;
    }>).detail;
    if (detail?.info?.uuid && detail.provider) {
      discovered.set(detail.info.uuid, {
        uuid: detail.info.uuid,
        name: detail.info.name ?? "Wallet",
        icon: detail.info.icon ?? "",
        provider: detail.provider,
      });
    }
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

/** 重新广播发现请求并返回已发现钱包;无 EIP-6963 响应时回落 window.ethereum。 */
export function discoverWallets(): WalletOption[] {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const list = [...discovered.values()];
    if (list.length > 0) return list;
    if (window.ethereum) {
      return [{ uuid: "injected", name: "浏览器钱包", icon: "", provider: window.ethereum }];
    }
  }
  return [];
}

export function hasWallet(): boolean {
  return typeof window !== "undefined" && (discovered.size > 0 || !!window.ethereum);
}

export async function connectWallet(provider?: EthereumProvider): Promise<string> {
  const p = provider ?? window.ethereum;
  if (!p) throw new Error("未检测到浏览器钱包,可用手机钱包扫码支付");
  const accounts = (await p.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.length) throw new Error("钱包未授权");
  return accounts[0];
}

export async function ensureChain(chainId: number, provider?: EthereumProvider): Promise<void> {
  const p = provider ?? window.ethereum;
  if (!p) throw new Error("未检测到钱包");
  const hex = "0x" + chainId.toString(16);
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch {
    throw new Error("请在钱包中切换到目标网络后重试");
  }
}

/** 发起 ERC-20 transfer,返回 txHash。amountMinor 为最小单位十进制字符串。 */
export async function sendToken(params: {
  from: string; tokenContract: string; to: string; amountMinor: string; provider?: EthereumProvider;
}): Promise<string> {
  const p = params.provider ?? window.ethereum;
  if (!p) throw new Error("未检测到钱包");
  const addr = params.to.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const value = BigInt(params.amountMinor).toString(16).padStart(64, "0");
  const data = "0xa9059cbb" + addr + value;
  return (await p.request({
    method: "eth_sendTransaction",
    params: [{ from: params.from, to: params.tokenContract, data }],
  })) as string;
}
