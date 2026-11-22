const KNOWN_CALL_SELECTORS: Record<string, string> = {
  '095ea7b3': 'approve(address,uint256)',
  '39509351': 'increaseAllowance(address,uint256)',
  a22cb465: 'setApprovalForAll(address,bool)',
  a9059cbb: 'transfer(address,uint256)',
  '23b872dd': 'transferFrom(address,address,uint256)',
  d505accf: 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
  '2b67b570': 'permit2.permit(address,PermitSingle,bytes)',
  ac9650d8: 'multicall(bytes[])',
  '5ae401dc': 'multicall(uint256,bytes[])',
  '38ed1739': 'swapExactTokensForTokens(...)',
  '7ff36ab5': 'swapExactETHForTokens(...)',
  '3593564c': 'UniversalRouter.execute(bytes,bytes[],uint256)',
  b61d27f6: 'execute(address,uint256,bytes)',
};

const TOKEN_RISK_SELECTORS: Record<string, string> = {
  '40c10f19': 'mint(address,uint256)',
  a0712d68: 'mint(uint256)',
  '44337ea1': 'blacklist(address)',
  f9f92be4: 'addBlackList(address)',
  '8456cb59': 'pause()',
  '69fe0e2d': 'setFee(uint256)',
  '8da5cb5b': 'owner()',
  f2fde38b: 'transferOwnership(address)',
};

const PANIC_CODES: Record<number, string> = {
  0x01: 'Assertion failed',
  0x11: 'Arithmetic overflow/underflow',
  0x12: 'Division or modulo by zero',
  0x21: 'Invalid enum conversion',
  0x31: 'Pop on empty array',
  0x32: 'Array index out of bounds',
  0x41: 'Out of memory',
  0x51: 'Zero-initialized function pointer call',
};

// Threshold for unlimited approval: >= 2^250 (covers uint256.max and near-max values)
const UNLIMITED_APPROVAL_THRESHOLD = 1n << 250n;

export interface CalldataAnalysis {
  selector: string | null;
  action: string;
  isApproval: boolean;
  isUnlimitedApproval: boolean;
  spender: string | null;
  amountRaw: string | null;
}

export function analyzeCalldata(dataHex: string): CalldataAnalysis {
  const clean = (dataHex.startsWith('0x') ? dataHex.slice(2) : dataHex).toLowerCase();
  if (clean.length < 8) {
    return {
      selector: null,
      action: clean.length === 0 ? 'NATIVE_TRANSFER' : 'RAW_CALLDATA',
      isApproval: false,
      isUnlimitedApproval: false,
      spender: null,
      amountRaw: null,
    };
  }

  const sel = clean.slice(0, 8);
  const action = KNOWN_CALL_SELECTORS[sel] ?? `unknown(0x${sel})`;
  const args = clean.slice(8);

  if ((sel === '095ea7b3' || sel === '39509351') && args.length >= 128) {
    const spender = `0x${args.slice(24, 64)}`;
    const amount = BigInt(`0x${args.slice(64, 128)}`);
    return {
      selector: `0x${sel}`,
      action,
      isApproval: true,
      isUnlimitedApproval: amount >= UNLIMITED_APPROVAL_THRESHOLD,
      spender,
      amountRaw: amount.toString(10),
    };
  }

  if (sel === 'a22cb465' && args.length >= 128) {
    const operator = `0x${args.slice(24, 64)}`;
    const approved = BigInt(`0x${args.slice(64, 128)}`) !== 0n;
    return {
      selector: `0x${sel}`,
      action,
      isApproval: approved,
      isUnlimitedApproval: approved,
      spender: operator,
      amountRaw: approved ? 'ALL_TOKENS' : '0',
    };
  }

  if (sel === 'd505accf' && args.length >= 192) {
    const spender = `0x${args.slice(88, 128)}`;
    const value = BigInt(`0x${args.slice(128, 192)}`);
    return {
      selector: `0x${sel}`,
      action,
      isApproval: true,
      isUnlimitedApproval: value >= UNLIMITED_APPROVAL_THRESHOLD,
      spender,
      amountRaw: value.toString(10),
    };
  }

  return {
    selector: `0x${sel}`,
    action,
    isApproval: false,
    isUnlimitedApproval: false,
    spender: null,
    amountRaw: null,
  };
}

export function decodeRevertData(revertHex: string | null, fallbackMessage?: string): {
  revertReason: string | null;
  revertSelector: string | null;
} {
  if (!revertHex || revertHex === '0x' || revertHex.length < 10) {
    return {
      revertReason: fallbackMessage || 'Execution reverted without reason data',
      revertSelector: null,
    };
  }

  const clean = revertHex.slice(2).toLowerCase();
  const sel = clean.slice(0, 8);

  // Error(string) = 0x08c379a0
  if (sel === '08c379a0' && clean.length >= 136) {
    try {
      const strLen = Number(BigInt(`0x${clean.slice(72, 136)}`));
      const strHex = clean.slice(136, 136 + strLen * 2);
      const reason = Buffer.from(strHex, 'hex').toString('utf8').replace(/\0+$/, '');
      return { revertReason: reason || 'Empty Error(string)', revertSelector: '0x08c379a0' };
    } catch {
      return { revertReason: fallbackMessage || 'Error(string) decode failed', revertSelector: '0x08c379a0' };
    }
  }

  // Panic(uint256) = 0x4e487b71
  if (sel === '4e487b71' && clean.length >= 72) {
    const code = Number(BigInt(`0x${clean.slice(8, 72)}`));
    const desc = PANIC_CODES[code] ?? `Panic code 0x${code.toString(16)}`;
    return { revertReason: `Panic(0x${code.toString(16)}): ${desc}`, revertSelector: '0x4e487b71' };
  }

  return {
    revertReason: fallbackMessage || `CustomError(0x${sel})`,
    revertSelector: `0x${sel}`,
  };
}

export function extractTokenRiskSelectors(hexCode: string): string[] {
  const clean = (hexCode.startsWith('0x') ? hexCode.slice(2) : hexCode).toLowerCase();
  const byteLen = Math.floor(clean.length / 2);
  const found = new Set<string>();

  for (let pc = 0; pc < byteLen; pc++) {
    const op = Number.parseInt(clean.slice(pc * 2, pc * 2 + 2), 16);
    if (op === 0x63 && pc + 4 < byteLen) {
      const sel = clean.slice((pc + 1) * 2, (pc + 5) * 2);
      if (TOKEN_RISK_SELECTORS[sel]) {
        found.add(`${TOKEN_RISK_SELECTORS[sel]} [0x${sel}]`);
      }
    }
    if (op >= 0x60 && op <= 0x7f) {
      pc += op - 0x5f;
    }
  }

  return [...found];
}

export function parseEip7702DelegationDesignator(codeHex: string): string | null {
  const clean = (codeHex.startsWith('0x') ? codeHex.slice(2) : codeHex).toLowerCase();
  // EIP-7702 delegation designator is exactly 23 bytes: 0xef0100 + 20-byte address
  if (clean.length === 46 && clean.startsWith('ef0100')) {
    return `0x${clean.slice(6)}`;
  }
  return null;
}

export function decodeAbiString(hex: string | undefined): string | null {
  if (!hex || hex === '0x' || hex.length < 66) return null;
  const clean = hex.slice(2);
  try {
    if (clean.length === 64) {
      // bytes32 short string (e.g. MKR, USDT legacy)
      const text = Buffer.from(clean, 'hex').toString('utf8').replace(/\0+$/, '').trim();
      return text || null;
    }
    if (clean.length >= 128) {
      const offsetBytes = Number(BigInt(`0x${clean.slice(0, 64)}`));
      const lenPos = offsetBytes * 2;
      if (lenPos + 64 <= clean.length) {
        const strLen = Number(BigInt(`0x${clean.slice(lenPos, lenPos + 64)}`));
        if (strLen > 0 && strLen <= 128 && lenPos + 64 + strLen * 2 <= clean.length) {
          const text = Buffer.from(clean.slice(lenPos + 64, lenPos + 64 + strLen * 2), 'hex')
            .toString('utf8')
            .replace(/\0+$/, '')
            .trim();
          return text || null;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function decodeAbiAddress(hex: string | undefined): string | null {
  if (!hex || !/^0x[0-9a-fA-F]{64}$/.test(hex)) return null;
  const addr = `0x${hex.slice(26).toLowerCase()}`;
  return addr === '0x0000000000000000000000000000000000000000' ? null : addr;
}
