import { PhoenixdPayerAdapter } from '../src/infrastructure/lightning/phoenixd-payer.adapter.js';

const PHOENIXD_URL = process.env.PHOENIXD_URL || 'http://100.95.119.88:9740';
const PHOENIXD_PASSWORD = process.env.PHOENIXD_PASSWORD || '__G3mE5-OJwzyIdNmMMxNQRnjqb-uK-w';
const SATRING_API_URL = 'https://satring.com/api/v1/services';

const SERVICE_PAYLOAD = {
  name: 'Sovereign Node Engine',
  url: 'https://node.sovroute.com/v1/chain/btc/next-block-xray',
  description:
    'Zero-trust Bitcoin Core v31.1 candidate block template X-Ray, 0-conf BIP-125 RBF double-spend fraud shield, zero-broadcast consensus simulator, and deep mempool entropy for autonomous AI agents.',
  protocol: 'L402+x402',
  pricing_sats: 3,
  pricing_model: 'per-request',
  pricing_usd: '0.003',
  x402_network: 'eip155:8453',
  x402_asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  x402_pay_to: '0x488cbDad29E60d8Bae53FFF4c4252C9711dF9784',
  category_ids: [2, 3], // 2 = data, 3 = finance
  owner_name: 'Faruk (SovRoute)',
  owner_contact: 'contact@sovroute.com',
  logo_url: 'https://sovroute.com/assets/sovroute-logo.png',
};

async function submitToSatring() {
  console.log('================================================================');
  console.log('🚀 SUBMITTING SOVEREIGN NODE ENGINE TO SATRING.COM DIRECTORY');
  console.log('================================================================\n');

  console.log('📦 Service Payload:');
  console.log(JSON.stringify(SERVICE_PAYLOAD, null, 2));
  console.log('\n📡 Step 1: Sending initial unauthenticated POST to satring.com...');

  const initialRes = await fetch(SATRING_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(SERVICE_PAYLOAD),
  });

  console.log(`HTTP Status: ${initialRes.status}`);

  if (initialRes.status !== 402) {
    const text = await initialRes.text();
    throw new Error(`Expected 402 Payment Required from Satring, got ${initialRes.status}: ${text}`);
  }

  // Parse L402 challenge
  const wwwAuth = initialRes.headers.get('www-authenticate');
  if (!wwwAuth) {
    throw new Error('Missing WWW-Authenticate header in 402 response');
  }

  const macaroonMatch = wwwAuth.match(/macaroon="([^"]+)"/);
  const invoiceMatch = wwwAuth.match(/invoice="([^"]+)"/);

  if (!macaroonMatch || !invoiceMatch) {
    throw new Error(`Failed to extract macaroon or invoice from: ${wwwAuth}`);
  }

  const macaroon = macaroonMatch[1];
  const invoice = invoiceMatch[1];

  console.log('✅ Received L402 Challenge from Satring!');
  console.log(`  Macaroon length: ${macaroon.length}`);
  console.log(`  BOLT-11 Invoice: ${invoice.substring(0, 35)}...`);

  // Step 2: Pay the 1,000 sats invoice via Phoenixd
  console.log('\n⚡ Step 2: Paying 1,000 sats listing fee via Phoenixd Lightning Node...');
  const payer = new PhoenixdPayerAdapter({
    baseUrl: PHOENIXD_URL,
    httpPassword: PHOENIXD_PASSWORD,
  });

  const payment = await payer.payInvoice(invoice);
  console.log(`✅ Payment Confirmed!`);
  console.log(`  Preimage (R): ${payment.preimage}`);
  console.log(`  Payment Hash: ${payment.paymentHash}`);

  // Step 3: Resend POST with L402 authorization
  console.log('\n🚀 Step 3: Resending service submission with L402 Credentials...');
  const authorizedRes = await fetch(SATRING_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `L402 ${macaroon}:${payment.preimage}`,
    },
    body: JSON.stringify(SERVICE_PAYLOAD),
  });

  const responseText = await authorizedRes.text();
  console.log(`HTTP Status: ${authorizedRes.status}`);
  console.log('Response Body:');
  console.log(responseText);

  if (!authorizedRes.ok) {
    throw new Error(`Satring submission failed (${authorizedRes.status}): ${responseText}`);
  }

  const result = JSON.parse(responseText);
  console.log('\n================================================================');
  console.log('🎉 SUCCESSFULLY LISTED ON SATRING.COM!');
  console.log(`  Service ID: ${result.id}`);
  console.log(`  Slug: ${result.slug}`);
  console.log(`  Public URL: https://satring.com/services/${result.slug}`);
  console.log(`  Edit Token: ${result.edit_token}`);
  console.log('================================================================\n');

  return result;
}

submitToSatring().catch((err) => {
  console.error('\n❌ Submission Failed:', err);
  process.exit(1);
});
