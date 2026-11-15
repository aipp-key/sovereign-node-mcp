/**
 * OpenAPI 3.1.0 Specification with TaskFuel `x-payment-info` for Sovereign Node Engine (node.sovroute.com)
 */

const DUAL_RAIL_PAYMENT = (amountUsd: string, priceSats: number) => ({
  protocols: ['x402', 'mpp', 'l402'],
  pricingMode: 'fixed',
  networks: ['eip155:8453', 'eip155:137', 'eip155:42161', 'eip155:1', 'lightning:mainnet'],
  price: {
    mode: 'fixed',
    currency: 'USDC',
    amount: amountUsd,
    priceSats,
  },
  circleGateway: true,
  nanopayments: {
    enabled: true,
    protocol: 'circle-gateway',
    minAmount: '0.000001',
    verifyingContract: '0x77777777dcc4d5a8b6e418fd04d8997ef11000ee',
  },
});

const RESPONSE_402 = {
  description: 'Dual-Rail Payment Required (L402 Lightning BOLT-11 + Base USDC x402 + Circle Gateway Nanopayments)',
};

export function renderOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Sovereign Node Engine — Bare-Metal Bitcoin Core v31.1 & Dual-Rail (L402 + x402) Oracle',
      version: '1.0.0',
      summary:
        '0-Conf RBF Double-Spend Fraud Shield, Next-Block Miner Template X-Ray, and Zero-Broadcast Consensus Simulator via Native Lightning (L402) & Base USDC (x402).',
      description:
        'Zero-trust Bitcoin Mainnet intelligence extracted directly from bare-metal Bitcoin Core v31.1 with 0.04ms in-memory caching. Supports Dual-Rail HTTP 402 settlement: pay in satoshis over Lightning Network (L402) or in USDC on Base L2 (x402) with Circle Gateway Nanopayments.',
      'x-guidance':
        'Autonomous AI agent guide for Sovereign Node Engine: Query real-time Bitcoin Core v31.1 mempool forensics, 0-confirmation RBF double-spend fraud screening, and next-block miner candidate templates. All paid endpoints support Dual-Rail settlement: L402 Lightning Network (1-5 satoshis via BOLT-11 invoice or Alby NWC) and x402 / Circle Gateway Nanopayments (EIP-3009 signed authorization in USDC, gas-free). To pay via x402 or Circle Gateway, make an initial request to obtain HTTP 402 with the PAYMENT-REQUIRED header, sign the EIP-3009 payment authorization with your EVM wallet, and repeat the request with PAYMENT-SIGNATURE: <base64>.',
      contact: {
        email: 'contact@sovroute.com',
        url: 'https://node.sovroute.com',
      },
    },
    externalDocs: {
      description: 'Sovereign Node Engine Documentation & LLM Guide',
      url: 'https://node.sovroute.com/llms.txt',
    },
    servers: [
      {
        url: 'https://node.sovroute.com',
        description: 'Sovereign Node Engine Production Gateway (Dual-Rail L402 + x402)',
      },
    ],
    paths: {
      '/v1/chain/btc/rbf-shield/{txid}': {
        get: {
          operationId: 'checkRbfFraudShield',
          summary: '0-Conf BIP-125 RBF Double-Spend Fraud Shield',
          description:
            'Inspects an unconfirmed or recently mined Bitcoin transaction (64-char hex txid) directly against bare-metal Bitcoin Core v31.1 mempool and UTXO set. Detects BIP-125 replaceability signaling, active double-spend conflicts, unconfirmed ancestor chain depth, effective package fee rate, and block confirmations. Invalid txid formats return 400 Bad Request before any payment challenge. Price: 5 sats (L402 Lightning) or $0.005 USDC (Base x402).',
          tags: ['Bitcoin Security & Mempool Forensics'],
          parameters: [
            {
              name: 'txid',
              in: 'path',
              required: true,
              description: '64-character hexadecimal Bitcoin transaction ID',
              schema: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            },
          ],
          'x-payment-info': DUAL_RAIL_PAYMENT('0.005', 5),
          responses: {
            '200': {
              description: '0-Conf RBF fraud shield assessment',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      source: { type: 'string', example: 'sovereign-bitcoind:31.1 (Full-RBF Mempool Inspector)' },
                      paymentRail: { type: 'string', example: 'L402-LIGHTNING' },
                      verification: { type: 'string', example: 'Cryptographic Dual-Rail Access' },
                      data: {
                        type: 'object',
                        properties: {
                          txid: { type: 'string' },
                          isInMempool: { type: 'boolean', example: true },
                          confirmations: { type: 'integer', example: 0 },
                          bip125Replaceable: { type: 'boolean', example: true },
                          vsize: { type: 'integer', example: 141 },
                          feeRateSatPerVb: { type: 'number', example: 12.5 },
                          ancestorCount: { type: 'integer', example: 1 },
                          hasConflicts: { type: 'boolean', example: false },
                          zeroConfRiskLevel: {
                            type: 'string',
                            enum: ['SAFE', 'MEDIUM_RISK', 'HIGH_RISK_RBF_ENABLED', 'NOT_FOUND'],
                          },
                          recommendation: { type: 'string' },
                          updatedAt: { type: 'integer', example: 1794064443 },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid 64-character hex transaction ID (checked prior to payment)' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/chain/btc/next-block-xray': {
        get: {
          operationId: 'getNextBlockXray',
          summary: 'Live Miner Candidate Block Template X-Ray & Queue Rank',
          description:
            'Queries getblocktemplate on bare-metal Bitcoin Core v31.1 to reveal the live candidate block transaction count, cutoff fee rate (sat/vB), median/top fee rates, block fill percentage, top whale transactions, and optional exact queue rank (rankInBlock, GUARANTEED_NEXT_BLOCK vs QUEUED_FOR_LATER_BLOCK) for a given txid query parameter. Price: 3 sats (L402 Lightning) or $0.003 USDC (Base x402).',
          tags: ['Bitcoin Security & Mempool Forensics'],
          parameters: [
            {
              name: 'txid',
              in: 'query',
              required: false,
              description: 'Optional 64-character hex Bitcoin txid to inspect for next-block inclusion rank',
              schema: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            },
          ],
          'x-payment-info': DUAL_RAIL_PAYMENT('0.003', 3),
          responses: {
            '200': {
              description: 'Live next-block miner candidate template X-Ray',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      source: { type: 'string', example: 'sovereign-bitcoind:31.1 (Live getblocktemplate Miner X-Ray)' },
                      paymentRail: { type: 'string', example: 'L402-LIGHTNING' },
                      verification: { type: 'string', example: 'Cryptographic Dual-Rail Access' },
                      data: {
                        type: 'object',
                        properties: {
                          candidateBlockHeight: { type: 'integer', example: 975580 },
                          previousBlockHash: { type: 'string' },
                          totalTransactions: { type: 'integer', example: 3500 },
                          totalWeight: { type: 'integer', example: 3992000 },
                          blockFillPercentage: { type: 'number', example: 99.8 },
                          totalFeeSats: { type: 'integer', example: 12500000 },
                          coinbaseRewardSats: { type: 'integer', example: 325000000 },
                          cutoffFeeRateSatPerVb: { type: 'number', example: 1.5 },
                          medianFeeRateSatPerVb: { type: 'number', example: 5.2 },
                          topFeeRateSatPerVb: { type: 'number', example: 120.0 },
                          updatedAt: { type: 'integer', example: 1794064443 },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid optional 64-character hex transaction ID (checked prior to payment)' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/chain/btc/simulate-tx': {
        post: {
          operationId: 'simulateRawTransaction',
          summary: 'Zero-Broadcast Bitcoin Core v31.1 Consensus & Script Dry-Run Simulator',
          description:
            'Executes testmempoolaccept and decoderawtransaction against the live Bitcoin Core v31.1 UTXO set without broadcasting to the P2P network (broadcastedToNetwork: false). Validates consensus rules, SegWit/Taproot scripts, BIP-125 signaling, and fee rates before broadcast. Invalid hex payloads return 400 Bad Request before payment. Price: 5 sats (L402 Lightning) or $0.005 USDC (Base x402).',
          tags: ['Bitcoin Security & Mempool Forensics'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['rawTxHex'],
                  properties: {
                    rawTxHex: {
                      type: 'string',
                      description: 'Even-length hexadecimal signed raw Bitcoin transaction (100-200000 chars)',
                      pattern: '^[0-9a-fA-F]{100,200000}$',
                    },
                  },
                },
              },
            },
          },
          'x-payment-info': DUAL_RAIL_PAYMENT('0.005', 5),
          responses: {
            '200': {
              description: 'Zero-broadcast consensus simulation result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      source: { type: 'string', example: 'sovereign-bitcoind:31.1 (Zero-Broadcast testmempoolaccept)' },
                      paymentRail: { type: 'string', example: 'L402-LIGHTNING' },
                      verification: { type: 'string', example: 'Cryptographic Dual-Rail Access' },
                      data: {
                        type: 'object',
                        properties: {
                          txid: { type: 'string' },
                          consensusAllowed: { type: 'boolean', example: true },
                          rejectReason: { type: ['string', 'null'] },
                          vsize: { type: 'integer', example: 140 },
                          feeSats: { type: ['integer', 'null'], example: 1400 },
                          feeRateSatPerVb: { type: ['number', 'null'], example: 10.0 },
                          bip125Replaceable: { type: 'boolean', example: true },
                          broadcastedToNetwork: { type: 'boolean', example: false },
                          simulatedAt: { type: 'integer', example: 1794064443 },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid rawTxHex in request body (checked prior to payment)' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/chain/btc/mempool': {
        get: {
          operationId: 'getMempoolEntropy',
          summary: 'Deep Mempool Entropy & Congestion Engine',
          description:
            'Returns real-time Bitcoin mempool depth from bare-metal Bitcoin Core v31.1: unconfirmed txCount, virtual backlog size in bytes (vsizeBytes), total pending miner fee pool in satoshis (totalFeeSats), floor/median/fastest fee rates (sat/vB), and dynamic congestion rating (LOW, MODERATE, HIGH, EXTREME). Price: 2 sats (L402 Lightning) or $0.002 USDC (Base x402).',
          tags: ['Bitcoin Security & Mempool Forensics'],
          'x-payment-info': DUAL_RAIL_PAYMENT('0.002', 2),
          responses: {
            '200': { description: 'Deep mempool entropy and congestion state' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/chain/btc/fees': {
        get: {
          operationId: 'getSmartFeeProjections',
          summary: 'Bitcoin Core v31.1 Smart Fee Projections',
          description:
            'Real-time estimatesmartfee projections in sat/vB for 1-2 block (fastest) and 6 block (economic) confirmation targets. Price: 1 sat (L402 Lightning) or $0.001 USDC (Base x402).',
          tags: ['Bitcoin Security & Mempool Forensics'],
          'x-payment-info': DUAL_RAIL_PAYMENT('0.001', 1),
          responses: {
            '200': { description: 'Smart fee rate projections in sat/vB' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/chain/btc/block': {
        get: {
          operationId: 'getBlockHeaderTruth',
          summary: 'Verified Bitcoin Mainnet Block Header Truth',
          description:
            'Returns latest verified block height, hash, difficulty, timestamp, and bits directly from bare-metal Bitcoin Core v31.1. Price: 1 sat (L402 Lightning) or $0.001 USDC (Base x402).',
          tags: ['Bitcoin Security & Mempool Forensics'],
          'x-payment-info': DUAL_RAIL_PAYMENT('0.001', 1),
          responses: {
            '200': { description: 'Verified block header state' },
            '402': RESPONSE_402,
          },
        },
      },
    },
  };
}
