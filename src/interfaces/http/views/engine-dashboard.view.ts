export function renderEngineDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sovereign Node Engine — Bare-Metal Bitcoin &amp; Lightning Core</title>
    <meta name="description" content="Bare-Metal Bitcoin Core 31.1 and Phoenixd L402 intelligence engine for autonomous AI agents.">
    <link rel="icon" type="image/png" sizes="32x32" href="https://sovroute.com/assets/favicon.png">
    <link rel="icon" type="image/x-icon" href="https://sovroute.com/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="https://sovroute.com/assets/apple-touch-icon.png">

    <style>
        :root {
            --bg-color: #ffffff;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --text-mono: #94a3b8;
            --border-light: #e2e8f0;
            --accent-blue: #2563eb;
            --accent-blue-hover: #1d4ed8;
            --accent-blue-border: #bfdbfe;
            --accent-orange: #f7931a;
            --content-max-width: 860px;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            font-size: 16px;
            position: relative;
            min-height: 100vh;
        }

        /* Subtle Technical Dot Grid Background (Identical to sovroute.com) */
        body::before {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background-image: radial-gradient(var(--text-mono) 1px, transparent 1px);
            background-size: 24px 24px;
            opacity: 0.40;
            z-index: -1;
            pointer-events: none;
        }

        .container {
            max-width: var(--content-max-width);
            margin: 0 auto;
            padding: 0 24px;
        }

        /* Header / Hero */
        header {
            text-align: center;
            padding-top: 56px;
            padding-bottom: 40px;
        }

        .hero-brand {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            margin-bottom: 10px;
        }

        .hero-brand-logo {
            height: 42px;
            width: auto;
            object-fit: contain;
            filter: drop-shadow(0 4px 12px rgba(37, 99, 235, 0.16)) drop-shadow(0 2px 6px rgba(247, 147, 26, 0.2));
            display: block;
            transition: transform 0.2s ease;
        }

        .hero-brand-logo:hover {
            transform: scale(1.05);
        }

        h1.logo {
            font-size: 2.125rem;
            font-weight: 700;
            margin: 0;
            line-height: 1;
            letter-spacing: -0.03em;
            color: var(--text-main);
        }

        .eyebrow {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 0.75rem;
            color: var(--text-mono);
            margin-bottom: 16px;
            display: block;
            letter-spacing: 0.02em;
        }

        .hero-desc {
            font-size: 1.05rem;
            color: var(--text-muted);
            margin: 0 auto 14px auto;
            max-width: 680px;
            line-height: 1.5;
        }

        .hero-sub {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 0.75rem;
            color: var(--text-mono);
            margin-bottom: 28px;
            letter-spacing: 0.01em;
        }

        .cta-group {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            height: 40px;
            padding: 0 16px;
            font-size: 0.875rem;
            font-weight: 500;
            text-decoration: none;
            border-radius: 8px;
            transition: border-color 0.15s ease, background-color 0.15s ease;
        }

        .btn-primary {
            background-color: var(--accent-blue);
            color: white;
            border: 1px solid var(--accent-blue);
        }

        .btn-primary:hover { 
            background-color: var(--accent-blue-hover); 
            border-color: var(--accent-blue-hover); 
        }

        .btn-secondary {
            background-color: white;
            color: var(--text-main);
            border: 1px solid var(--border-light);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
        }

        .btn-secondary:hover { 
            background-color: #f8fafc; 
            border-color: #cbd5e1; 
        }

        /* App Teaser Card Styles (Exact sovroute.com DNA) */
        .app-teaser-card {
            max-width: 860px;
            width: 100%;
            margin: 0 auto 40px auto;
            background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
            border: 1px solid var(--border-light);
            border-radius: 20px;
            padding: 36px 32px;
            box-shadow: 0 10px 30px -5px rgba(15, 23, 42, 0.06), 0 4px 6px -2px rgba(15, 23, 42, 0.02);
            text-align: center;
        }

        .teaser-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
            flex-wrap: wrap;
            gap: 12px;
        }

        .teaser-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-family: ui-monospace, SFMono-Regular, monospace;
            font-size: 0.6875rem;
            font-weight: 700;
            color: #059669;
            background-color: #ecfdf5;
            border: 1px solid #a7f3d0;
            padding: 4px 10px;
            border-radius: 9999px;
            letter-spacing: 0.04em;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #10b981;
            box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
            animation: pulse-dot 2s infinite ease-in-out;
        }

        @keyframes pulse-dot {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.7; }
        }

        .teaser-rate {
            font-family: ui-monospace, SFMono-Regular, monospace;
            font-size: 0.75rem;
            color: var(--text-muted);
            background: #ffffff;
            border: 1px solid var(--border-light);
            padding: 4px 12px;
            border-radius: 9999px;
        }

        .teaser-title {
            font-size: 1.375rem;
            font-weight: 700;
            letter-spacing: -0.02em;
            color: var(--text-main);
            margin-bottom: 10px;
        }

        .teaser-desc {
            font-size: 0.9375rem;
            color: var(--text-muted);
            line-height: 1.55;
            max-width: 640px;
            margin: 0 auto 28px auto;
        }

        .teaser-metrics-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 14px;
            margin-bottom: 30px;
            text-align: left;
        }

        @media (min-width: 640px) {
            .teaser-metrics-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }

        @media (min-width: 768px) {
            .teaser-metrics-grid {
                grid-template-columns: repeat(4, 1fr);
            }
        }

        .teaser-metric {
            background-color: #ffffff;
            border: 1px solid var(--border-light);
            border-radius: 12px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            transition: all 0.15s ease;
        }

        .teaser-metric:hover {
            border-color: #cbd5e1;
            box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
            transform: translateY(-1px);
        }

        .metric-icon {
            width: 36px;
            height: 36px;
            border-radius: 8px;
            background-color: #f1f5f9;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 4px;
            color: var(--text-main);
        }

        .metric-title {
            font-family: ui-monospace, SFMono-Regular, monospace;
            font-size: 0.75rem;
            font-weight: 700;
            color: var(--text-main);
            word-break: break-all;
        }

        .metric-sub {
            font-size: 0.7rem;
            color: var(--text-muted);
            line-height: 1.4;
        }

        .price-badge {
            display: inline-block;
            margin-top: 4px;
            font-family: ui-monospace, SFMono-Regular, monospace;
            font-size: 0.6875rem;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 6px;
            background-color: rgba(247, 147, 26, 0.1);
            color: #d97706;
            border: 1px solid rgba(247, 147, 26, 0.25);
            width: fit-content;
        }

        .price-free {
            background-color: #ecfdf5;
            color: #059669;
            border-color: #a7f3d0;
        }

        /* Terminal Window Inside Showcase (Exact sovroute.com DNA) */
        .terminal-box {
            max-width: 860px;
            margin: 0 auto 48px auto;
            background-color: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 14px;
            overflow: hidden;
            box-shadow: 0 12px 28px -6px rgba(15, 23, 42, 0.18);
            text-align: left;
        }

        .terminal-header {
            background-color: #1e293b;
            padding: 10px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #334155;
        }

        .terminal-dots {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .terminal-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }

        .dot-red { background-color: #ef4444; }
        .dot-yellow { background-color: #f59e0b; }
        .dot-green { background-color: #10b981; }

        .terminal-pill {
            font-family: ui-monospace, SFMono-Regular, monospace;
            font-size: 0.6875rem;
            color: #94a3b8;
            background: #0f172a;
            padding: 2px 10px;
            border-radius: 4px;
            border: 1px solid #334155;
        }

        .terminal-body {
            padding: 20px 24px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.8125rem;
            line-height: 1.6;
            color: #cbd5e1;
            overflow-x: auto;
        }

        .cmd-line {
            color: #38bdf8;
            font-weight: 600;
        }

        .cmd-comment {
            color: #64748b;
        }

        .cmd-val {
            color: #f59e0b;
        }

        /* Footer (Exact sovroute.com DNA) */
        footer {
            border-top: 1px solid var(--border-light);
            padding: 32px 0 48px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
            font-size: 0.8125rem;
            color: var(--text-muted);
        }

        .footer-brand {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            color: var(--text-main);
        }

        .footer-links {
            display: flex;
            gap: 16px;
        }

        .footer-links a {
            color: var(--text-muted);
            text-decoration: none;
            transition: color 0.15s ease;
        }

        .footer-links a:hover {
            color: var(--accent-blue);
        }
    </style>
</head>
<body>

    <div class="container">
        <header>
            <div class="hero-brand">
                <img src="https://sovroute.com/assets/sovroute-logo.png" alt="SovRoute Logo" class="hero-brand-logo">
                <h1 class="logo">Sovereign Node Engine</h1>
            </div>
            <span class="eyebrow">sovereign bitcoin mainnet &amp; lightning node infrastructure</span>
            <p class="hero-desc">Trust-minimized, direct-from-node blockchain intelligence. Real-time Bitcoin mempool fee recommendations, chain tip verification, and global Lightning Network topology queryable on-the-fly via HTTP 402.</p>
            <p class="hero-sub">direct bitcoind + phoenixd rpc &middot; pay-per-call (1-5 sats) &middot; native l402 lightning &middot; zero account requirement</p>
            
            <div class="cta-group">
                <a href="#endpoints" class="btn btn-primary">Explore Endpoints &rarr;</a>
                <a href="#quickstart" class="btn btn-secondary">cURL &amp; Agent Quickstart</a>
                <a href="https://sovroute.com" class="btn btn-secondary" target="_blank">Main Gateway (sovroute.com) &rarr;</a>
            </div>
        </header>

        <main>
            <!-- Node Status & Live Capability Grid (Exact SovRoute Card Style) -->
            <section id="endpoints">
                <div class="app-teaser-card">
                    <div class="teaser-header">
                        <div class="teaser-badge">
                            <span class="status-dot"></span>
                            LIVE MAINNET &middot; BLOCK TIP SYNCED
                        </div>
                        <span class="teaser-rate">Bitcoind 31.1 &amp; Phoenixd Synced (&lt;0.05 ms cache)</span>
                    </div>

                    <h2 class="teaser-title">Verified On-Chain &amp; Lightning Intelligence</h2>
                    <p class="teaser-desc">
                        Built for autonomous AI agents requiring instantaneous Bitcoin fee estimates, 0-conf fraud screening, and deep mempool entropy without subscriptions.
                    </p>

                    <div class="teaser-metrics-grid">
                        <!-- Metric 1: RBF Shield -->
                        <div class="teaser-metric">
                            <div class="metric-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            </div>
                            <div class="metric-title">/v1/truth/rbf-shield</div>
                            <div class="metric-sub">0-Conf double-spend fraud shield (BIP-125)</div>
                            <span class="price-badge">5 sats</span>
                        </div>

                        <!-- Metric 2: Mempool Entropy -->
                        <div class="teaser-metric">
                            <div class="metric-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" style="fill: #f59e0b;"/></svg>
                            </div>
                            <div class="metric-title">/v1/truth/mempool</div>
                            <div class="metric-sub">Live 60k+ pool backlog &amp; dynamic congestion</div>
                            <span class="price-badge">2 sats</span>
                        </div>

                        <!-- Metric 3: Fees -->
                        <div class="teaser-metric">
                            <div class="metric-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M8 10h8"/></svg>
                            </div>
                            <div class="metric-title">/v1/truth/fees</div>
                            <div class="metric-sub">Real-time estimatesmartfee (1, 3, 6 blocks)</div>
                            <span class="price-badge">1 sat</span>
                        </div>

                        <!-- Metric 4: Health / Tip -->
                        <div class="teaser-metric">
                            <div class="metric-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                            </div>
                            <div class="metric-title">/health</div>
                            <div class="metric-sub">Public node sync, height &amp; tip validation</div>
                            <span class="price-badge price-free">FREE</span>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Architecture Terminal Block (Exact SovRoute Terminal DNA) -->
            <section id="quickstart">
                <div class="terminal-box">
                    <div class="terminal-header">
                        <div class="terminal-dots">
                            <span class="terminal-dot dot-red"></span>
                            <span class="terminal-dot dot-yellow"></span>
                            <span class="terminal-dot dot-green"></span>
                        </div>
                        <span class="terminal-pill">HTTP 402 &middot; L402 Lightning Protocol</span>
                    </div>
                    <div class="terminal-body">
                        <div class="cmd-comment"># 1. Probe protected endpoint — receive L402 challenge with Lightning invoice</div>
                        <span class="cmd-line">curl</span> -i https://node.sovroute.com/v1/truth/fees<br><br>
                        <div class="cmd-comment"># HTTP/1.1 402 Payment Required</div>
                        <div class="cmd-comment"># Www-Authenticate: L402 macaroon="...", invoice="lnbc10n..."</div><br>
                        <div class="cmd-comment"># 2. Pay 1 sat invoice via Alby, Phoenix or NWC to obtain preimage (R)</div>
                        <div class="cmd-comment"># 3. Retrieve verified data using cryptographic token</div>
                        <span class="cmd-line">curl</span> -H <span class="cmd-val">"Authorization: L402 &lt;macaroon&gt;:&lt;preimage&gt;"</span> https://node.sovroute.com/v1/truth/fees
                    </div>
                </div>
            </section>
        </main>

        <footer>
            <div class="footer-brand">
                <img src="https://sovroute.com/assets/sovroute-logo.png" alt="SovRoute" style="height: 20px; width: auto;">
                <span>SovRoute Infrastructure &middot; Node Cluster</span>
            </div>
            <div class="footer-links">
                <a href="https://sovroute.com" target="_blank">Main Gateway</a>
                <a href="https://sovroute.com/swap" target="_blank">Cross-Rail Swap</a>
                <a href="https://sovroute.com/llms.txt" target="_blank">llms.txt</a>
                <a href="https://github.com/sovroutecore/sovroute" target="_blank">GitHub</a>
            </div>
        </footer>
    </div>

</body>
</html>`;
}
