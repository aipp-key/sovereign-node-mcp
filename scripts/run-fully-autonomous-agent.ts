import { AutonomousL402Agent } from '../src/application/services/autonomous-agent-client.js';
import { PhoenixdPayerAdapter } from '../src/infrastructure/lightning/phoenixd-payer.adapter.js';

const PHOENIXD_URL = process.env.PHOENIXD_URL || 'http://100.95.119.88:9740';
const PHOENIXD_PASSWORD = process.env.PHOENIXD_PASSWORD || '__G3mE5-OJwzyIdNmMMxNQRnjqb-uK-w';
const NODE_ENGINE_URL = process.env.NODE_ENGINE_URL || 'http://100.95.119.88:3088';

async function runAutonomousAgent() {
  console.log('================================================================');
  console.log('🤖 FULLY AUTONOMOUS AI AGENT - 100% ZERO-HUMAN EXECUTION LOOP');
  console.log('================================================================\n');

  // 1. Setup Autonomous Payer (Agent Wallet)
  const payer = new PhoenixdPayerAdapter({
    baseUrl: PHOENIXD_URL,
    httpPassword: PHOENIXD_PASSWORD,
  });

  const agent = new AutonomousL402Agent(payer);

  // Task 1: Autonomous Fee Optimization
  console.log('[Task 1] AI Agent wants to optimize Bitcoin transaction fees:');
  console.log(`📡 Querying: ${NODE_ENGINE_URL}/v1/truth/fees (Budget Guardrail: max 10 sats)`);

  const startTime = Date.now();
  const feeReport = await agent.fetch(`${NODE_ENGINE_URL}/v1/truth/fees`, {
    maxPriceSatsAllowed: 10,
  });
  const duration1 = Date.now() - startTime;

  console.log(`⏱️ Autonomous Execution Time: ${duration1}ms`);
  console.log('📊 Result Delivered to Agent Context:');
  console.log(JSON.stringify(feeReport, null, 2));
  console.log('----------------------------------------------------------------\n');

  // Task 2: Autonomous Mempool Network Health Check
  console.log('[Task 2] AI Agent wants to evaluate global network congestion:');
  console.log(`📡 Querying: ${NODE_ENGINE_URL}/v1/truth/mempool (Budget Guardrail: max 10 sats)`);

  const startTime2 = Date.now();
  const mempoolReport = await agent.fetch(`${NODE_ENGINE_URL}/v1/truth/mempool`, {
    maxPriceSatsAllowed: 10,
  });
  const duration2 = Date.now() - startTime2;

  console.log(`⏱️ Autonomous Execution Time: ${duration2}ms`);
  console.log('📊 Result Delivered to Agent Context:');
  console.log(JSON.stringify(mempoolReport, null, 2));
  console.log('\n================================================================');
  console.log('🎉 MISSION ACCOMPLISHED: Both services purchased, paid, and verified with ZERO human intervention!');
  console.log('================================================================');
}

runAutonomousAgent().catch((err) => {
  console.error('❌ Autonomous Agent Error:', err);
  process.exit(1);
});
