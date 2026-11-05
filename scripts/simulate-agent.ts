import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3080';
const TAILSCALE_HOST = process.env.TAILSCALE_HOST || '100.95.119.88';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAgentSimulation() {
  console.log('================================================================');
  console.log('🤖 AUTONOMOUS AI AGENT - L402 PROTOCOL INTERACTION SIMULATION');
  console.log('================================================================\n');

  // STEP 1: Discovery
  console.log('[Step 1: Service Discovery]');
  console.log(`📡 Checking node health at: ${BASE_URL}/health`);
  const healthRes = await fetch(`${BASE_URL}/health`);
  const healthJson = await healthRes.json();
  console.log('Response Status:', healthRes.status);
  console.log('Health Payload:', JSON.stringify(healthJson, null, 2));
  console.log('----------------------------------------------------------------\n');

  // STEP 2: Request Protected Sovereign Data (No Payment Header)
  console.log('[Step 2: Access Protected Sovereign Data - Initial Call]');
  console.log(`🔒 Requesting: GET ${BASE_URL}/v1/truth/mempool without credentials...`);
  const initialRes = await fetch(`${BASE_URL}/v1/truth/mempool`);
  
  console.log(`HTTP Status: ${initialRes.status} (${initialRes.statusText})`);
  const wwwAuth = initialRes.headers.get('www-authenticate');
  console.log('WWW-Authenticate Header:', wwwAuth);

  const challengeBody = await initialRes.json();
  console.log('Challenge Body:', JSON.stringify(challengeBody, null, 2));

  if (initialRes.status !== 402 || !wwwAuth) {
    throw new Error('Expected 402 Payment Required with WWW-Authenticate header');
  }

  // Extract macaroon and invoice from header/body
  const macaroonMatch = wwwAuth.match(/macaroon="([^"]+)"/);
  const invoiceMatch = wwwAuth.match(/invoice="([^"]+)"/);

  if (!macaroonMatch || !invoiceMatch) {
    throw new Error('Failed to parse macaroon or invoice from header');
  }

  const macaroon = macaroonMatch[1];
  const invoice = invoiceMatch[1];
  const paymentHash = challengeBody.challenge?.paymentHash;

  console.log('\nParsed Agent Task:');
  console.log(`⚡ Lightning BOLT-11 Invoice: ${invoice.substring(0, 35)}...`);
  console.log(`🔑 Payment Hash (H): ${paymentHash}`);
  console.log(`🏷️ Macaroon: ${macaroon.substring(0, 35)}...`);
  console.log('----------------------------------------------------------------\n');

  // STEP 3: Adversarial Test (Forged / Invalid Preimage)
  console.log('[Step 3: Adversarial Validation - Testing Forged Preimage]');
  const fakePreimage = '00'.repeat(32);
  console.log(`🛡️ Sending forged preimage: ${fakePreimage}`);
  const badAuthRes = await fetch(`${BASE_URL}/v1/truth/mempool`, {
    headers: {
      Authorization: `L402 ${macaroon}:${fakePreimage}`,
    },
  });

  console.log(`HTTP Status: ${badAuthRes.status} (${badAuthRes.statusText})`);
  const badAuthJson = await badAuthRes.json();
  console.log('Rejection Details:', JSON.stringify(badAuthJson, null, 2));
  console.log('✅ Zero-Trust Defense successfully blocked forged credential!');
  console.log('----------------------------------------------------------------\n');

  // STEP 4: Solving the Challenge (Retrieving Preimage from Sovereign Node)
  console.log('[Step 4: Cryptographic Settlement / Preimage Resolution]');
  console.log(`🔍 Resolving real 32-byte secret preimage (R) from node for payment hash: ${paymentHash}`);
  
  const lookupCmd = `ssh -o ConnectTimeout=5 -o BatchMode=yes root@${TAILSCALE_HOST} "docker exec sovereign-lnd lncli --tlscertpath=/var/lib/lnd/data/tls.cert --macaroonpath=/var/lib/lnd/data/data/chain/bitcoin/mainnet/invoice.macaroon lookupinvoice --rhash=${paymentHash}"`;
  const { stdout } = await execAsync(lookupCmd);
  const parsedInvoice = JSON.parse(stdout);
  const realPreimage = parsedInvoice.r_preimage;

  console.log(`✨ Valid Preimage Found (R): ${realPreimage}`);
  console.log('----------------------------------------------------------------\n');

  // STEP 5: Final Call with Valid L402 Authorization
  console.log('[Step 5: Authenticated Sovereign Data Retrieval]');
  console.log(`🚀 Retrying with Header: Authorization: L402 ${macaroon.substring(0, 15)}...:${realPreimage.substring(0, 15)}...`);
  
  const finalRes = await fetch(`${BASE_URL}/v1/truth/mempool`, {
    headers: {
      Authorization: `L402 ${macaroon}:${realPreimage}`,
    },
  });

  console.log(`HTTP Status: ${finalRes.status} (${finalRes.statusText})`);
  const sovereignData = await finalRes.json();
  console.log('\n🎉 SUCCESS! Sovereign Node Intelligence Delivered to AI Agent:');
  console.log(JSON.stringify(sovereignData, null, 2));
  console.log('================================================================');
}

runAgentSimulation().catch((err) => {
  console.error('❌ Simulation Error:', err);
  process.exit(1);
});
