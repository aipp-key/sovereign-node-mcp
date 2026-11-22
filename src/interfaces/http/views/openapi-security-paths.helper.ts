type TripleRailFactory = (amountUsd: string, priceSats: number) => Record<string, unknown>;

export function buildSecurityAndWatchtowerPaths(
  tripleRail: TripleRailFactory,
  response402: Record<string, unknown>
): Record<string, unknown> {
  return {
    '/v1/chain/evm/simulate-tx': {
      post: {
        operationId: 'simulateEvmTransaction',
        summary: 'EVM Pre-Flight Transaction Simulator',
        description:
          'Dry-runs EVM transactions via eth_call & eth_estimateGas, decodes Error(string)/Panic(uint256) revert reasons, flags unlimited token approvals, EIP-7702 delegated targets, and ONNX drainer risk. Returns ALLOW/WARN/BLOCK. Price: 5 sats (L402) or $0.005 USDC (x402).',
        tags: ['Transaction Security'],
        'x-payment-info': tripleRail('0.005', 5),
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['chainId', 'from', 'to'],
                properties: {
                  chainId: { type: 'integer', example: 8453 },
                  from: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
                  to: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
                  data: { type: 'string', default: '0x' },
                  value: { type: 'string', default: '0x0' },
                  blockTag: { type: 'string', enum: ['latest', 'pending'], default: 'latest' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'EVM simulation report with ALLOW/WARN/BLOCK verdict' },
          '400': { description: 'Invalid simulation payload (rejected before payment)' },
          '402': response402,
        },
      },
    },
    '/v1/chain/evm/address-safety': {
      post: {
        operationId: 'inspectEvmAddressSafety',
        summary: 'EVM Address, Contract & Token Safety Scanner',
        description:
          'Classifies EOA, EIP-7702 delegated EOA, EIP-1967 proxy, or ERC-20 token; checks privileged mint/pause/blacklist controls, SELFDESTRUCT opcode, and ONNX drainer score. Price: 4 sats (L402) or $0.004 USDC (x402).',
        tags: ['Transaction Security'],
        'x-payment-info': tripleRail('0.004', 4),
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['chainId', 'address'],
                properties: {
                  chainId: { type: 'integer', example: 8453 },
                  address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Address, contract and token safety report' },
          '400': { description: 'Invalid address payload (rejected before payment)' },
          '402': response402,
        },
      },
    },
    '/v1/chain/evm/address-safety/batch': {
      post: {
        operationId: 'inspectEvmAddressSafetyBatch',
        summary: 'Batch EVM Address & Token Safety Scanner (up to 10 addresses)',
        description:
          'Screens up to 10 EVM addresses in parallel (token, router, spender, recipient) and returns an aggregate overallVerdict and per-address risk reports. Price: 15 sats (L402) or $0.015 USDC (x402).',
        tags: ['Transaction Security'],
        'x-payment-info': tripleRail('0.015', 15),
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['chainId', 'addresses'],
                properties: {
                  chainId: { type: 'integer', example: 8453 },
                  addresses: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 10,
                    items: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Batch safety report with overallVerdict and per-address breakdown' },
          '400': { description: 'Invalid batch payload (rejected before payment)' },
          '402': response402,
        },
      },
    },
    '/v1/guard/preflight': {
      post: {
        operationId: 'evaluatePreflightGuard',
        summary: 'Unified Pre-Flight Transaction Guard (ALLOW / WARN / BLOCK)',
        description:
          'Single-call decision engine combining EVM simulation + address/token safety + optional EIP-7702 or BTC consensus + RBF shield + optional stablecoin peg context into a single ALLOW/WARN/BLOCK verdict. Price: 10 sats (L402) or $0.010 USDC (x402).',
        tags: ['Transaction Security'],
        'x-payment-info': tripleRail('0.010', 10),
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['protocol'],
                properties: {
                  protocol: { type: 'string', enum: ['evm', 'btc'] },
                  chainId: { type: 'integer', example: 8453 },
                  from: { type: 'string' },
                  to: { type: 'string' },
                  data: { type: 'string' },
                  value: { type: 'string' },
                  rawTxHex: { type: 'string' },
                  txid: { type: 'string' },
                  stablecoinSymbol: { type: 'string', enum: ['USDC', 'USDT', 'USDe', 'DAI'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Unified pre-flight ALLOW/WARN/BLOCK decision report' },
          '400': { description: 'Invalid preflight payload (rejected before payment)' },
          '402': response402,
        },
      },
    },
    '/v1/watchtower/btc/watch': {
      post: {
        operationId: 'createBtcWatch',
        summary: 'BTC TX & RBF Watchtower (Prepaid TTL + HMAC Webhooks)',
        description:
          'Creates a prepaid TTL (1-72h) event-driven watch on bare-metal Bitcoin Core v31.1 for a Bitcoin txid. Emits HMAC-SHA256 signed webhooks on CONFIRMED, CONFLICT_DETECTED, or DROPPED_OR_REPLACED. Price: 10 sats (L402) or $0.010 USDC (x402).',
        tags: ['Agent Infrastructure'],
        'x-payment-info': tripleRail('0.010', 10),
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['txid'],
                properties: {
                  txid: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                  webhookUrl: { type: 'string', format: 'uri', description: 'Public HTTPS webhook URL (SSRF protected)' },
                  ttlHours: { type: 'integer', minimum: 1, maximum: 72, default: 24 },
                  confirmationsTarget: { type: 'integer', minimum: 1, maximum: 6, default: 1 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Watch created with watchId, readToken, webhookSecret and initial snapshot' },
          '400': { description: 'Invalid txid or SSRF-blocked webhookUrl (rejected before payment)' },
          '402': response402,
        },
      },
    },
    '/v1/watchtower/btc/{watchId}': {
      get: {
        operationId: 'getBtcWatchStatus',
        summary: 'Query BTC Watchtower Status & Event Timeline',
        description:
          'Returns live watch status, event timeline, and webhook delivery logs for a previously created watchId (authenticated via Bearer readToken or ?token=). Free once watch is created.',
        tags: ['Agent Infrastructure'],
        parameters: [
          {
            name: 'watchId',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^wt_[0-9a-f]{20}$' },
          },
        ],
        responses: {
          '200': { description: 'Current watch state and event timeline' },
          '400': { description: 'Invalid watchId format' },
          '404': { description: 'Watch not found or invalid readToken' },
        },
      },
    },
  };
}
