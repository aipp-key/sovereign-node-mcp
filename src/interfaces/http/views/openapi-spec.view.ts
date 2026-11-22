/**
 * OpenAPI 3.1.0 Specification with TaskFuel `x-payment-info` for Sovereign Node Engine (node.sovroute.com)
 */

const TRIPLE_RAIL_PAYMENT = (amountUsd: string, priceSats: number) => ({
  protocols: ['mpp', 'x402', 'l402'],
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
  description: 'Triple-Rail Payment Required (MPP Authorization: Payment + L402 Lightning BOLT-11 + Base USDC x402 v2)',
};

export function renderOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Sovereign Node Engine — Bare-Metal Bitcoin Core v31.1 & Triple-Rail (MPP + L402 + x402) Oracle',
      version: '1.0.0',
      summary:
        '0-Conf RBF Double-Spend Fraud Shield, Next-Block Miner Template X-Ray, Zero-Broadcast Consensus Simulator, and EIP-7702 AuthTx Scanner via Native Lightning (L402), Base USDC (x402), and Machine Payments Protocol (MPP).',
      description:
        'Zero-trust Bitcoin Mainnet intelligence and EVM Pectra security extracted directly from bare-metal Bitcoin Core v31.1 with 0.04ms in-memory caching. Supports Triple-Rail HTTP 402 & MPP settlement: pay in satoshis over Lightning Network (L402 / MPP), in USDC on Base L2 (x402 / MPP), or via Machine Payments Protocol (Authorization: Payment).',
      'x-guidance':
        'Autonomous AI agent guide for Sovereign Node Engine: Query real-time Bitcoin Core v31.1 mempool forensics, 0-confirmation RBF double-spend fraud screening, candidate miner templates, and EIP-7702 Pectra delegations. All paid endpoints support Triple-Rail settlement: 1. Machine Payments Protocol (MPP draft-lightning-charge-00 / draft-usdc-charge-00 via Authorization: Payment), 2. L402 Lightning Network (1-5 satoshis via BOLT-11 invoice or Alby NWC), and 3. x402 (EIP-3009 signed authorization in Base USDC, gas-free).',
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
        description: 'Sovereign Node Engine Production Gateway (Triple-Rail MPP + L402 + x402)',
      },
    ],
    paths: {
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
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.003', 3),
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
            '400': { description: 'Invalid optional 64-character hex transaction ID' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/chain/btc/rbf-shield/{txid}': {
        get: {
          operationId: 'checkRbfFraudShield',
          summary: '0-Conf BIP-125 RBF Double-Spend Fraud Shield',
          description:
            'Inspects an unconfirmed or recently mined Bitcoin transaction (64-char hex txid) directly against bare-metal Bitcoin Core v31.1 mempool and UTXO set. Detects BIP-125 replaceability signaling, active double-spend conflicts, unconfirmed ancestor chain depth, effective package fee rate, and block confirmations. Price: 5 sats (L402 Lightning) or $0.005 USDC (Base x402).',
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
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.005', 5),
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
            '400': { description: 'Invalid 64-character hex transaction ID' },
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
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.005', 5),
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
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.002', 2),
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
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.001', 1),
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
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.001', 1),
          responses: {
            '200': { description: 'Verified block header state' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/chain/evm/eip7702-shield': {
        post: {
          operationId: 'inspectEip7702Authorization',
          summary: 'EIP-7702 AuthTx Security Scanner (Drain & Replay Shield)',
          description:
            'Inspects EVM Pectra EIP-7702 authorization_list delegations for wallet drainer bytecode (SELFDESTRUCT, unverified DELEGATECALL, ERC-20 transfer/approve selectors), audited standard verification, and cross-chain replay risk (chainId=0). Price: 5 sats (L402 Lightning) or $0.005 USDC (Base x402).',
          tags: ['EVM Security & EIP-7702 Forensics'],
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.005', 5),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['authorizationList'],
                  properties: {
                    executionChainId: { type: 'integer', example: 8453 },
                    authorizationList: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['chainId', 'address', 'nonce'],
                        properties: {
                          chainId: { type: 'integer', example: 8453 },
                          address: { type: 'string', example: '0x63c0c19a282a1b52b07dd5a65b58948a07dae32b' },
                          nonce: { type: 'integer', example: 0 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'EIP-7702 security verdict (SAFE_VERIFIED | SUSPICIOUS_UNVERIFIED | CRITICAL_DRAIN_RISK)' },
            '400': { description: 'Invalid EIP-7702 authorizationList payload' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/chain/evm/bytecode-risk-ml': {
        post: {
          operationId: 'scoreEvmBytecodeRiskMl',
          summary: 'PyTorch ONNX Neural EVM Bytecode Risk Classifier',
          description:
            'Runs a PyTorch-trained ONNX neural network (32-dim EVM opcode/selector feature vector) via onnxruntime-node to score contract bytecode for obfuscated drainer or exploit patterns. Accepts raw bytecode hex or (chainId + address). Price: 5 sats (L402 Lightning) or $0.005 USDC (Base x402).',
          tags: ['EVM Security & EIP-7702 Forensics'],
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.005', 5),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    bytecode: { type: 'string', example: '0x6080604052...' },
                    chainId: { type: 'integer', example: 8453 },
                    address: { type: 'string', example: '0x63c0c19a282a1b52b07dd5a65b58948a07dae32b' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Neural risk score (0-1) and verdict (BENIGN_PATTERN | SUSPICIOUS_ML | DRAINER_ML_DETECTED)' },
            '400': { description: 'Invalid bytecode or (chainId, address) payload' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/omni/pay-lightning': {
        post: {
          operationId: 'payLightningInvoiceCrossChain',
          summary: 'SUB-LIG Cross-Chain Lightning Payment Bridge',
          description:
            'AI agents holding only Solana (SOL/USDC) or EVM (Base/Arbitrum USDC/ETH) pay over Quad-Rail and supply a BOLT-11 Lightning invoice (up to 25 sats). Sovereign Node Engine settles the invoice instantly via Phoenixd and returns the cryptographic paymentPreimage.',
          tags: ['Cross-Chain Bridge & Lightning'],
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.025', 25),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['invoice'],
                  properties: {
                    invoice: { type: 'string', example: 'lnbc250n1p...' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Cryptographic settlement with paymentPreimage' },
            '400': { description: 'Invalid or expired invoice (>25 sats or unpayable)' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/intel/microstructure': {
        get: {
          operationId: 'getCrossExchangeMicrostructure',
          summary: 'Zero-Wait 4-Exchange Microstructure & Liquidation Oracle',
          description:
            'Reads in-memory public WebSocket streams from Binance, Bybit, OKX and Hyperliquid to compute orderbook imbalance, cross-exchange spread (bps), 1m/5m CVD, funding rates and liquidation cascade score. Price: 3 sats (L402) or $0.003 USDC (x402).',
          tags: ['Data & Market Oracles'],
          parameters: [
            {
              name: 'symbol',
              in: 'query',
              required: false,
              description: 'Target perpetual symbol: BTC, ETH, or SOL (defaults to BTC)',
              schema: { type: 'string', enum: ['BTC', 'ETH', 'SOL'], default: 'BTC' },
            },
          ],
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.003', 3),
          responses: {
            '200': { description: 'In-memory cross-exchange microstructure snapshot' },
            '400': { description: 'Invalid symbol query parameter' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/intel/polymarket-edge': {
        get: {
          operationId: 'getPolymarketEdge',
          summary: 'Live Polymarket CLOB Probability vs 4-Exchange Spot Reference',
          description:
            'Combines active Polymarket CLOB WebSocket orderbook probabilities and Gamma 24h volume with live 4-exchange spot price and orderbook imbalance in RAM. Price: 4 sats (L402) or $0.004 USDC (x402).',
          tags: ['Data & Market Oracles'],
          parameters: [
            {
              name: 'asset',
              in: 'query',
              required: false,
              description: 'Optional asset filter across prediction markets: BTC, ETH, or SOL',
              schema: { type: 'string', enum: ['BTC', 'ETH', 'SOL'] },
            },
          ],
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.004', 4),
          responses: {
            '200': { description: 'Live Polymarket CLOB probability and spot reference snapshot' },
            '400': { description: 'Invalid asset query parameter' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/intel/funding-arb': {
        get: {
          operationId: 'getFundingBasisArbitrage',
          summary: 'Cross-Exchange Funding Carry & Spot-Perp Basis Oracle',
          description:
            'Compares live funding rates (bps and annualized APR) and Binance spot-perp basis across perpetual venues in RAM to surface the optimal delta-neutral carry spread. Price: 3 sats (L402) or $0.003 USDC (x402).',
          tags: ['Data & Market Oracles'],
          parameters: [
            {
              name: 'symbol',
              in: 'query',
              required: false,
              description: 'Target symbol: BTC, ETH, or SOL (defaults to BTC)',
              schema: { type: 'string', enum: ['BTC', 'ETH', 'SOL'], default: 'BTC' },
            },
          ],
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.003', 3),
          responses: {
            '200': { description: 'In-memory funding arbitrage and spot-perp basis snapshot' },
            '400': { description: 'Invalid symbol query parameter' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/intel/options-skew': {
        get: {
          operationId: 'getDeribitOptionsSkew',
          summary: 'Deribit DVOL Volatility Regime & Options Put/Call Skew',
          description:
            'Streams Deribit DVOL index via WebSocket and pairs it with live ATM IV, OTM put-call skew, and open interest ratio from the full Deribit options chain. Price: 4 sats (L402) or $0.004 USDC (x402).',
          tags: ['Data & Market Oracles'],
          parameters: [
            {
              name: 'asset',
              in: 'query',
              required: false,
              description: 'Target options asset: BTC or ETH (defaults to BTC)',
              schema: { type: 'string', enum: ['BTC', 'ETH'], default: 'BTC' },
            },
          ],
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.004', 4),
          responses: {
            '200': { description: 'In-memory Deribit DVOL and options skew snapshot' },
            '400': { description: 'Invalid asset query parameter' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/intel/stablecoin-peg': {
        get: {
          operationId: 'getStablecoinPeg',
          summary: 'Multi-Venue Stablecoin Peg & Depeg Risk Oracle',
          description:
            'Zero-wait USD peg oracle across Kraken, Coinbase and Binance Spot WebSockets tracking USDC, USDT, USDe and DAI deviation (bps) and depeg risk score. Price: 2 sats (L402) or $0.002 USDC (x402).',
          tags: ['Data & Market Oracles'],
          parameters: [
            {
              name: 'symbol',
              in: 'query',
              required: false,
              description: 'Optional stablecoin filter: USDC, USDT, USDE or DAI',
              schema: { type: 'string', enum: ['USDC', 'USDT', 'USDE', 'DAI'] },
            },
          ],
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.002', 2),
          responses: {
            '200': { description: 'In-memory multi-venue stablecoin peg snapshot' },
            '400': { description: 'Invalid stablecoin symbol query parameter' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/chain/evm/gas-pulse': {
        get: {
          operationId: 'getEvmGasPulse',
          summary: 'Multi-Chain EVM WebSocket Gas & Blob Base Fee Pulse',
          description:
            'Streams newHeads over PublicNode WebSockets for Ethereum, Base and Arbitrum to return live baseFeeGwei, EIP-4844 blobBaseFeeGwei, gas utilization and 12-block trend. Price: 2 sats (L402) or $0.002 USDC (x402).',
          tags: ['EVM Pre-Flight Security'],
          parameters: [
            {
              name: 'chain',
              in: 'query',
              required: false,
              description: 'Optional chain filter: ethereum, base or arbitrum',
              schema: { type: 'string', enum: ['ethereum', 'base', 'arbitrum'] },
            },
          ],
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.002', 2),
          responses: {
            '200': { description: 'Zero-wait EVM gas and blob fee snapshot' },
            '400': { description: 'Invalid chain query parameter' },
            '402': RESPONSE_402,
          },
        },
      },
      '/v1/chain/btc/whale-tape': {
        get: {
          operationId: 'getBtcWhaleTape',
          summary: 'Bare-Metal Bitcoin Core ZMQ rawtx Whale Transaction Tape',
          description:
            'Subscribes directly to bare-metal sovereign-bitcoind v31.1 ZMQ rawtx frames and decodes large unconfirmed transactions (>= minBtc, default 10 BTC) in a 24h rolling window. Price: 3 sats (L402) or $0.003 USDC (x402).',
          tags: ['Bitcoin Mainnet Intelligence'],
          parameters: [
            {
              name: 'minBtc',
              in: 'query',
              required: false,
              description: 'Minimum output BTC threshold (1..10000, default 10)',
              schema: { type: 'number', minimum: 1, maximum: 10000, default: 10 },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              description: 'Maximum whale transactions returned (1..100, default 25)',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
            },
          ],
          'x-payment-info': TRIPLE_RAIL_PAYMENT('0.003', 3),
          responses: {
            '200': { description: 'Bare-metal ZMQ rawtx whale tape snapshot' },
            '400': { description: 'Invalid whale-tape query parameters' },
            '402': RESPONSE_402,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        mppAuth: {
          type: 'http',
          scheme: 'payment',
          description: 'IETF Machine Payments Protocol (draft-lightning-charge-00 / draft-usdc-charge-00)',
        },
        l402Auth: {
          type: 'http',
          scheme: 'l402',
          description: 'L402 Macaroon & Preimage challenge (WWW-Authenticate: L402)',
        },
        x402Auth: {
          type: 'apiKey',
          in: 'header',
          name: 'Payment-Signature',
          description: 'Base L2 USDC EIP-3009 signed transfer authorization (x402 v2)',
        },
      },
    },
  };
}
