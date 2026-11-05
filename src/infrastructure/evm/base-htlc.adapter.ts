import { createHash, randomBytes } from 'node:crypto';
import {
  type Address,
  type Hex,
  parseAbi,
  encodeFunctionData,
} from 'viem';

export const CROSS_RAIL_HTLC_ABI = parseAbi([
  'function createSwap(bytes32 swapId, address recipient, address tokenContract, uint256 amount, bytes32 hashlock, uint256 timelock) external',
  'function redeem(bytes32 swapId, bytes32 preimage) external',
  'function refund(bytes32 swapId) external',
  'function getSwap(bytes32 swapId) external view returns ((bytes32 hashlock, bytes32 preimage, uint256 timelock, uint256 amount, address initiator, address recipient, address tokenContract, uint8 state))',
  'event SwapCreated(bytes32 indexed swapId, bytes32 indexed hashlock, address indexed initiator, address recipient, address tokenContract, uint256 amount, uint256 timelock)',
  'event SwapRedeemed(bytes32 indexed swapId, bytes32 indexed hashlock, bytes32 preimage, address indexed recipient)',
  'event SwapRefunded(bytes32 indexed swapId, bytes32 indexed hashlock, address indexed initiator)',
]);

export interface SwapSecretPair {
  preimageHex: string;   // 64-character hex without 0x or with 0x
  paymentHashHex: string; // SHA-256 of preimage
}

export class BaseHtlcAdapter {
  constructor(
    public readonly contractAddress: Address,
    public readonly baseRpcUrl: string = 'https://mainnet.base.org'
  ) {}

  /**
   * Generates a cryptographically secure 32-byte secret preimage and its SHA-256 payment hash.
   * Matches both EVM SHA-256 precompile (0x02) and Lightning Network BOLT-11 requirements.
   */
  static generateSecretPair(): SwapSecretPair {
    const preimage = randomBytes(32);
    const paymentHash = createHash('sha256').update(preimage).digest('hex');

    return {
      preimageHex: preimage.toString('hex'),
      paymentHashHex: paymentHash,
    };
  }

  /**
   * Validates if a preimage matches a payment hash
   */
  static verifyPreimage(preimageHex: string, expectedHashHex: string): boolean {
    const cleanPreimage = preimageHex.replace(/^0x/, '');
    const cleanHash = expectedHashHex.replace(/^0x/, '').toLowerCase();

    const computedHash = createHash('sha256')
      .update(Buffer.from(cleanPreimage, 'hex'))
      .digest('hex')
      .toLowerCase();

    return computedHash === cleanHash;
  }

  /**
   * Encodes calldata for createSwap transaction on Base L2
   */
  encodeCreateSwap(params: {
    swapId: Hex;
    recipient: Address;
    tokenContract: Address;
    amount: bigint;
    hashlock: Hex;
    timelock: bigint;
  }): Hex {
    return encodeFunctionData({
      abi: CROSS_RAIL_HTLC_ABI,
      functionName: 'createSwap',
      args: [
        params.swapId,
        params.recipient,
        params.tokenContract,
        params.amount,
        params.hashlock,
        params.timelock,
      ],
    });
  }

  /**
   * Encodes calldata for redeem transaction on Base L2 (releasing USDC by revealing preimage)
   */
  encodeRedeem(params: { swapId: Hex; preimage: Hex }): Hex {
    return encodeFunctionData({
      abi: CROSS_RAIL_HTLC_ABI,
      functionName: 'redeem',
      args: [params.swapId, params.preimage],
    });
  }

  /**
   * Encodes calldata for refund transaction on Base L2 after timelock expires
   */
  encodeRefund(params: { swapId: Hex }): Hex {
    return encodeFunctionData({
      abi: CROSS_RAIL_HTLC_ABI,
      functionName: 'refund',
      args: [params.swapId],
    });
  }
}
