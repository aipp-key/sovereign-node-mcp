export function renderEngineDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sovereign Node Engine — Bitcoin & Lightning Intelligence</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: #12151e;
      --border: #1f2433;
      --accent-orange: #f7931a;
      --accent-emerald: #10b981;
      --accent-blue: #3b82f6;
      --text: #f3f4f6;
      --muted: #9ca3af;
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      padding: 2.5rem 1.5rem;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .container {
      max-width: 860px;
      width: 100%;
    }
    header {
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .logo-icon {
      font-size: 2rem;
      background: rgba(247, 147, 26, 0.1);
      border: 1px solid rgba(247, 147, 26, 0.3);
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
    }
    h1 {
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .subtitle {
      font-size: 0.85rem;
      color: var(--muted);
    }
    .badge-live {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--accent-emerald);
      padding: 0.3rem 0.8rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.03em;
    }
    .badge-live::before {
      content: "";
      width: 6px;
      height: 6px;
      background: var(--accent-emerald);
      border-radius: 50%;
      box-shadow: 0 0 8px var(--accent-emerald);
    }
    .grid-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem 1.2rem;
    }
    .stat-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 0.25rem;
    }
    .stat-val {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--text);
    }
    .section-title {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .endpoints-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 2rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.85rem;
    }
    th {
      background: rgba(255, 255, 255, 0.02);
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    td {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255, 255, 255, 0.015); }
    .method {
      display: inline-block;
      font-family: var(--mono);
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      background: rgba(59, 130, 246, 0.15);
      color: var(--accent-blue);
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .endpoint-path {
      font-family: var(--mono);
      font-weight: 600;
      color: #e2e8f0;
    }
    .price-tag {
      font-family: var(--mono);
      font-weight: 700;
      color: var(--accent-orange);
      background: rgba(247, 147, 26, 0.1);
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      font-size: 0.75rem;
      display: inline-block;
    }
    .price-free {
      color: var(--accent-emerald);
      background: rgba(16, 185, 129, 0.1);
    }
    .desc {
      color: var(--muted);
      font-size: 0.8rem;
    }
    .terminal-box {
      background: #050608;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.2rem;
      font-family: var(--mono);
      font-size: 0.8rem;
      color: #cbd5e1;
      margin-bottom: 2rem;
      overflow-x: auto;
    }
    .terminal-box code { color: #38bdf8; }
    footer {
      border-top: 1px solid var(--border);
      padding-top: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      color: var(--muted);
      font-size: 0.8rem;
    }
    footer a {
      color: var(--accent-orange);
      text-decoration: none;
    }
    footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="logo-icon">⚡</div>
        <div>
          <h1>Sovereign Node Engine</h1>
          <p class="subtitle">Bare-Metal Bitcoin Core 31.1 & Phoenixd L402 Intelligence API</p>
        </div>
      </div>
      <div>
        <span class="badge-live">BARE-METAL ONLINE</span>
      </div>
    </header>

    <div class="grid-stats">
      <div class="stat-card">
        <div class="stat-label">Block Height</div>
        <div class="stat-val" style="color: var(--accent-orange);">Mainnet Tip</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Settlement Rail</div>
        <div class="stat-val">Native L402 (Sats)</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">In-Memory Cache</div>
        <div class="stat-val" style="color: var(--accent-emerald);">&lt; 0.05 ms</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">0-Conf Fraud Shield</div>
        <div class="stat-val">BIP-125 Full-RBF</div>
      </div>
    </div>

    <div class="section-title">📍 Live Pay-Per-Query Endpoints</div>
    <div class="endpoints-card">
      <table>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>Cost</th>
            <th>Capability</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <span class="method">GET</span> <span class="endpoint-path">/v1/truth/rbf-shield/:txid</span>
            </td>
            <td><span class="price-tag">5 sats</span></td>
            <td class="desc">🛡️ <strong>0-Conf Fraud Shield:</strong> Real-time BIP-125 double-spend risk oracle for unconfirmed Bitcoin payments.</td>
          </tr>
          <tr>
            <td>
              <span class="method">GET</span> <span class="endpoint-path">/v1/truth/mempool</span>
            </td>
            <td><span class="price-tag">2 sats</span></td>
            <td class="desc">⚡ <strong>Mempool Entropy:</strong> Live backlog, fee density, 60k+ tx pool analytics & dynamic congestion score.</td>
          </tr>
          <tr>
            <td>
              <span class="method">GET</span> <span class="endpoint-path">/v1/truth/fees</span>
            </td>
            <td><span class="price-tag">1 sat</span></td>
            <td class="desc">🎯 <strong>Smart Fee Oracle:</strong> Real-time estimatesmartfee sat/vB projections for 1, 3, 6 block targets.</td>
          </tr>
          <tr>
            <td>
              <span class="method">GET</span> <span class="endpoint-path">/v1/truth/block</span>
            </td>
            <td><span class="price-tag">1 sat</span></td>
            <td class="desc">🪙 <strong>Block Truth:</strong> Verified chain tip height, hash, difficulty, and consensus status.</td>
          </tr>
          <tr>
            <td>
              <span class="method">GET</span> <span class="endpoint-path">/health</span>
            </td>
            <td><span class="price-tag price-free">FREE</span></td>
            <td class="desc">🩺 Public synchronization and node health check.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="section-title">💻 AI Agent Quickstart (HTTP 402 Flow)</div>
    <div class="terminal-box">
      # 1. Probe endpoint & receive L402 challenge with Lightning invoice<br>
      <code>curl -i https://node.sovroute.com/v1/truth/fees</code><br><br>
      # 2. Pay invoice (1 sat) over Lightning (Alby, Phoenix, LND) to obtain preimage (R)<br><br>
      # 3. Request data with proof of payment<br>
      <code>curl -H "Authorization: L402 &lt;macaroon&gt;:&lt;preimage&gt;" https://node.sovroute.com/v1/truth/fees</code>
    </div>

    <footer>
      <div>Part of the <strong><a href="https://sovroute.com" target="_blank">SovRoute</a></strong> Infrastructure</div>
      <div>Agent Discovery: <a href="https://sovroute.com/llms.txt" target="_blank">llms.txt</a></div>
    </footer>
  </div>
</body>
</html>`;
}
