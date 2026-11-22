export const EVM_CHAIN_RPCS: Record<number, string> = {
  1: process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com',
  10: process.env.OPTIMISM_RPC_URL || 'https://optimism-rpc.publicnode.com',
  137: process.env.POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
  8453: process.env.BASE_RPC_URL || 'https://base-rpc.publicnode.com',
  42161: process.env.ARBITRUM_RPC_URL || 'https://arbitrum-one-rpc.publicnode.com',
  11155111: process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
};

export interface JsonRpcResponse<T = unknown> {
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface EvmRpcClient {
  call(
    chainId: number,
    method: string,
    params: unknown[],
    timeoutMs?: number
  ): Promise<JsonRpcResponse>;
}

export function getRpcUrlForChain(chainId: number): string | null {
  return EVM_CHAIN_RPCS[chainId] ?? null;
}

export function toHexQuantity(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    const normalized = BigInt(trimmed);
    return `0x${normalized.toString(16)}`;
  }
  return `0x${BigInt(trimmed).toString(16)}`;
}

export function toDecimalWei(value: string): string {
  return BigInt(value.trim()).toString(10);
}

export function extractRevertDataHex(error: JsonRpcResponse['error']): string | null {
  if (!error) return null;
  if (typeof error.data === 'string' && /^0x[0-9a-fA-F]+$/.test(error.data)) {
    return error.data;
  }
  if (error.data && typeof error.data === 'object') {
    const nested = (error.data as Record<string, unknown>).data;
    if (typeof nested === 'string' && /^0x[0-9a-fA-F]+$/.test(nested)) {
      return nested;
    }
  }
  const match = error.message?.match(/0x[0-9a-fA-F]{8,}/);
  return match ? match[0] : null;
}

export const defaultEvmRpcClient: EvmRpcClient = {
  async call(
    chainId: number,
    method: string,
    params: unknown[],
    timeoutMs = 5000
  ): Promise<JsonRpcResponse> {
    const rpcUrl = getRpcUrlForChain(chainId);
    if (!rpcUrl) {
      return {
        error: {
          code: -32602,
          message: `Unsupported EVM chainId: ${chainId}`,
        },
      };
    }

    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      return {
        error: {
          code: -32000,
          message: `Upstream RPC HTTP ${res.status}`,
        },
      };
    }

    return (await res.json()) as JsonRpcResponse;
  },
};
