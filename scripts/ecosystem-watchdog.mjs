import fs from 'fs';

// Load .env
if (fs.existsSync('.env')) {
  const envText = fs.readFileSync('.env', 'utf-8');
  envText.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  });
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing in .env');
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });
    const data = await res.json();
    return data.ok;
  } catch (err) {
    console.error('Telegram send error:', err.message);
    return false;
  }
}

async function probeUrl(url, expectedStatus) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'SovRoute-Ecosystem-Watchdog/1.0' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    const latency = Date.now() - start;
    const ok = Array.isArray(expectedStatus)
      ? expectedStatus.includes(res.status)
      : res.status === expectedStatus;
    return { ok, status: res.status, latency, error: null };
  } catch (err) {
    return { ok: false, status: 0, latency: Date.now() - start, error: err.message };
  }
}

async function runHealthCheck() {
  const checks = [
    // 1. Core Endpoints
    { name: 'node.sovroute.com (Health)', url: 'https://node.sovroute.com/health', expected: 200, category: 'Node Uçları' },
    { name: 'Next-Block X-Ray (L402/x402)', url: 'https://node.sovroute.com/v1/chain/btc/next-block-xray', expected: 402, category: 'Node Uçları' },
    { name: '0-Conf RBF Shield (L402/x402)', url: 'https://node.sovroute.com/v1/chain/btc/rbf-shield/1abeb730a0000000000000000000000000000000000000000000000000000000', expected: 402, category: 'Node Uçları' },
    { name: 'Bitcoin Smart Fees (L402/x402)', url: 'https://node.sovroute.com/v1/chain/btc/fees', expected: 402, category: 'Node Uçları' },
    { name: 'Mempool Entropy (L402/x402)', url: 'https://node.sovroute.com/v1/chain/btc/mempool', expected: 402, category: 'Node Uçları' },
    
    // 2. Discovery & Marketplaces
    { name: 'OpenAPI 3.1 Spec', url: 'https://node.sovroute.com/openapi.json', expected: 200, category: 'Pazar Yerleri' },
    { name: 'Satring Domain Verification', url: 'https://node.sovroute.com/.well-known/satring-verify', expected: 200, category: 'Pazar Yerleri' },
    { name: 'Satring Directory Page', url: 'https://satring.com/services/sovereign-node-engine', expected: 200, category: 'Pazar Yerleri' },
    { name: 'Agentic Market Exchange', url: 'https://agenticmarket.exchange/', expected: 200, category: 'Pazar Yerleri' },
    
    // 3. NPM & GitHub
    { name: 'npm: @aipp/sovereign-node-mcp', url: 'https://registry.npmjs.org/@aipp/sovereign-node-mcp', expected: 200, category: 'Ekosistem' },
    { name: 'GitHub Public Repo', url: 'https://api.github.com/repos/aipp-key/sovereign-node-mcp', expected: 200, category: 'Ekosistem' },
  ];

  const results = [];
  let allHealthy = true;

  for (const check of checks) {
    const res = await probeUrl(check.url, check.expected);
    results.push({ ...check, ...res });
    if (!res.ok) allHealthy = false;
  }

  // Get NPM Latest Version & GitHub Issues info
  let npmVersion = 'unknown';
  try {
    const npmRes = await fetch('https://registry.npmjs.org/@aipp/sovereign-node-mcp');
    const npmJson = await npmRes.json();
    npmVersion = npmJson['dist-tags']?.latest || '1.0.2';
  } catch (_) {}

  let ghOpenIssues = 0;
  try {
    const ghRes = await fetch('https://api.github.com/repos/aipp-key/sovereign-node-mcp', {
      headers: { 'User-Agent': 'SovRoute-Watchdog' }
    });
    const ghJson = await ghRes.json();
    ghOpenIssues = ghJson.open_issues_count || 0;
  } catch (_) {}

  return { allHealthy, results, npmVersion, ghOpenIssues };
}

async function main() {
  const isAlertOnly = process.argv.includes('--alert-only');
  console.log('[SovRoute Watchdog] Running ecosystem health scan...');
  
  const { allHealthy, results, npmVersion, ghOpenIssues } = await runHealthCheck();

  console.log(`Scan complete. All healthy: ${allHealthy}`);

  if (isAlertOnly && allHealthy) {
    console.log('All systems healthy. No alert needed.');
    return;
  }

  // Format Telegram Message
  const now = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  const statusIcon = allHealthy ? '🟢' : '🚨';
  const statusTitle = allHealthy ? 'Tüm Ekosistem Sağlıklı' : 'DİKKAT: Aksama Algılandı!';

  let msg = `${statusIcon} *[SovRoute Ekosistem Gözetleme]*\n`;
  msg += `📊 *Durum:* ${statusTitle}\n`;
  msg += `🕒 *Zaman:* ${now}\n\n`;

  msg += `🌐 *Düğüm Uçları (node.sovroute.com):*\n`;
  for (const r of results.filter(x => x.category === 'Node Uçları')) {
    const icon = r.ok ? '✅' : '❌';
    msg += `${icon} \`${r.name}\`: ${r.status} (${r.latency}ms)\n`;
  }

  msg += `\n🏛️ *Pazar Yerleri & Doğrulama:*\n`;
  for (const r of results.filter(x => x.category === 'Pazar Yerleri')) {
    const icon = r.ok ? '✅' : '❌';
    msg += `${icon} \`${r.name}\`: ${r.status} (${r.latency}ms)\n`;
  }

  msg += `\n📦 *npm & GitHub Takibi:*\n`;
  for (const r of results.filter(x => x.category === 'Ekosistem')) {
    const icon = r.ok ? '✅' : '❌';
    msg += `${icon} \`${r.name}\`: ${r.status}\n`;
  }
  msg += `  ▫️ *npm Sürüm:* \`v${npmVersion}\`\n`;
  msg += `  ▫️ *GitHub Açık Sorun (Issue):* \`${ghOpenIssues}\`\n`;

  console.log(msg);
  const sent = await sendTelegram(msg);
  console.log('Telegram dispatch result:', sent ? 'SUCCESS' : 'FAILED');
}

main().catch(err => {
  console.error('Fatal watchdog error:', err);
  process.exit(1);
});
