import { ILightningPayer } from '../interfaces/lightning-payer.interface.js';

export interface AgentRequestOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  maxPriceSatsAllowed?: number; // Budget guardrail to protect agent
  maxRetriesOn500?: number;
}

export class AutonomousL402Agent {
  constructor(private readonly payer: ILightningPayer) {}

  /**
   * Autonomous HTTP fetch with automatic L402 Payment Negotiation
   */
  async fetch(url: string, options: AgentRequestOptions = {}): Promise<any> {
    const headers = { ...(options.headers || {}) };
    const method = options.method || 'GET';
    const body = options.body;

    // 1. First probe request (unauthenticated)
    const initialRes = await fetch(url, { method, headers, body });

    // If endpoint is public or already authenticated, return response
    if (initialRes.status !== 402) {
      if (!initialRes.ok) {
        throw new Error(`HTTP Error ${initialRes.status}: ${await initialRes.text()}`);
      }
      return initialRes.json();
    }

    // 2. Parse 402 Challenge
    const wwwAuth = initialRes.headers.get('www-authenticate');
    if (!wwwAuth || !wwwAuth.includes('L402 ')) {
      throw new Error('Received 402 but missing or malformed L402 WWW-Authenticate header');
    }

    const macaroonMatch = wwwAuth.match(/macaroon="([^"]+)"/);
    const invoiceMatch = wwwAuth.match(/invoice="([^"]+)"/);

    if (!macaroonMatch || !invoiceMatch) {
      throw new Error('Failed to parse macaroon or BOLT-11 invoice from L402 challenge');
    }

    const macaroon = macaroonMatch[1];
    const invoice = invoiceMatch[1];

    const challengeBody = await initialRes.json().catch(() => ({}));
    const priceSats = challengeBody?.challenge?.priceSats;

    // Budget guardrail check
    if (options.maxPriceSatsAllowed && priceSats && priceSats > options.maxPriceSatsAllowed) {
      throw new Error(
        `Agent Budget Guardrail Exceeded: Requested price (${priceSats} sats) > Allowed budget (${options.maxPriceSatsAllowed} sats)`
      );
    }

    console.log(`[Autonomous Agent] ⚡ L402 Challenge detected! Paying ${priceSats || '?'} satoshis via Lightning...`);

    // 3. Autonomous payment execution via Lightning
    const payment = await this.payer.payInvoice(invoice);
    console.log(`[Autonomous Agent] 🔑 Payment confirmed! Preimage received: ${payment.preimage.substring(0, 16)}...`);

    // 4. Retry request with L402 credentials
    const authorizedHeaders = {
      ...headers,
      Authorization: `L402 ${macaroon}:${payment.preimage}`,
    };

    let finalRes = await fetch(url, { method, headers: authorizedHeaders, body });
    const maxRetriesOn500 = options.maxRetriesOn500 ?? 1;

    for (let attempt = 0; attempt < maxRetriesOn500 && finalRes.status >= 500; attempt++) {
      const retryVoucher = finalRes.headers.get('x-payment-retry-voucher');
      if (!retryVoucher) break;
      finalRes = await fetch(url, {
        method,
        headers: {
          ...headers,
          'X-Payment-Retry-Voucher': retryVoucher,
        },
        body,
      });
    }

    if (!finalRes.ok) {
      throw new Error(`L402 Access Failed (${finalRes.status}): ${await finalRes.text()}`);
    }

    return finalRes.json();
  }
}
