import {
  renderCrewAiLiveSectionHtml,
  renderCrewAiLiveScript,
  renderCrewAiLiveStyles,
} from './crewai-live-section.view.js';

export function renderEngineDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SovRoute Node Engine — Bitcoin Core v31.1 &amp; EVM Forensics</title>
    <meta name="description" content="Bare-Metal Bitcoin Core v31.1 forensics, zero-broadcast consensus simulation, and EIP-7702 security scanner via Triple-Rail HTTP 402 &amp; MPP (MPP + L402 + x402).">
    <link rel="icon" type="image/png" sizes="32x32" href="https://sovroute.com/assets/favicon.png">
    <link rel="icon" type="image/x-icon" href="https://sovroute.com/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="https://sovroute.com/assets/apple-touch-icon.png">

    <!-- AI Agent & LLM Machine Discovery -->
    <link rel="alternate" type="text/plain" href="https://node.sovroute.com/llms.txt" title="Sovereign Node Forensics LLMs.txt">
    <link rel="alternate" type="text/plain" href="https://sovroute.com/llms.txt" title="SovRoute Core LLMs.txt">

    <style>
        :root {
            --bg-color: #ffffff;
            --surface-subtle: #f8fafc;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --text-mono: #94a3b8;
            --border-light: #e2e8f0;
            --accent-blue: #2563eb;
            --accent-blue-hover: #1d4ed8;
            --accent-blue-border: #bfdbfe;
            --accent-orange: #f7931a;
            --content-max-width: 980px;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            line-height: 1.55;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            font-size: 16px;
            position: relative;
            min-height: 100vh;
        }

        body::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image: radial-gradient(var(--text-mono) 1px, transparent 1px);
            background-size: 24px 24px;
            opacity: 0.35;
            z-index: -1;
            pointer-events: none;
        }

        .container { max-width: var(--content-max-width); margin: 0 auto; padding: 0 24px; }

        /* Top Navigation */
        .topbar {
            border-bottom: 1px solid var(--border-light);
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(8px);
            position: sticky;
            top: 0;
            z-index: 40;
        }
        .topbar-inner {
            max-width: var(--content-max-width);
            margin: 0 auto;
            padding: 12px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
        }
        .nav-brand {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            text-decoration: none;
            color: var(--text-main);
            font-weight: 700;
            font-size: 0.95rem;
            letter-spacing: -0.02em;
            white-space: nowrap;
            flex-shrink: 0;
        }
        .nav-brand img { height: 26px; width: auto; }
        .nav-pill {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.6875rem;
            font-weight: 600;
            color: var(--accent-blue);
            background: #eff6ff;
            border: 1px solid var(--accent-blue-border);
            padding: 2px 7px;
            border-radius: 999px;
            white-space: nowrap;
            flex-shrink: 0;
        }
        .nav-links {
            display: flex;
            align-items: center;
            flex-wrap: nowrap;
            gap: 20px;
            font-size: 0.8125rem;
            font-weight: 500;
        }
        .nav-links a {
            color: var(--text-muted);
            text-decoration: none;
            white-space: nowrap;
            transition: color 0.15s ease;
        }
        .nav-links a:hover { color: var(--text-main); }
        .nav-status {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.6875rem;
            font-weight: 600;
            color: #047857;
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
            padding: 4px 10px;
            border-radius: 999px;
            white-space: nowrap;
            flex-shrink: 0;
        }

        /* Hero */
        header {
            text-align: center;
            padding-top: 52px;
            padding-bottom: 36px;
        }
        .eyebrow {
            display: inline-block;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.75rem;
            font-weight: 600;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--accent-blue);
            margin-bottom: 12px;
        }
        h1.hero-title {
            font-size: 2.35rem;
            font-weight: 700;
            line-height: 1.15;
            letter-spacing: -0.03em;
            color: var(--text-main);
            margin-bottom: 14px;
        }
        .hero-desc {
            font-size: 1.02rem;
            color: var(--text-muted);
            max-width: 680px;
            margin: 0 auto 14px auto;
        }
        .hero-sub {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.78rem;
            color: var(--text-mono);
            margin-bottom: 26px;
        }
        .cta-group {
            display: flex;
            justify-content: center;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
            margin-bottom: 18px;
        }
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 10px 20px;
            font-size: 0.875rem;
            font-weight: 600;
            text-decoration: none;
            border-radius: 8px;
            transition: all 0.15s ease;
            cursor: pointer;
        }
        .btn-primary {
            background-color: var(--text-main);
            color: #ffffff;
            border: 1px solid var(--text-main);
        }
        .btn-primary:hover {
            background-color: #1e293b;
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(15, 23, 42, 0.14);
        }
        .btn-secondary {
            background-color: #ffffff;
            color: var(--text-main);
            border: 1px solid var(--border-light);
        }
        .btn-secondary:hover {
            border-color: #cbd5e1;
            background-color: var(--surface-subtle);
            transform: translateY(-1px);
        }
        .spec-strip {
            display: flex;
            justify-content: center;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px 18px;
            font-size: 0.78rem;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            color: var(--text-muted);
        }
        .spec-strip a {
            color: var(--text-muted);
            text-decoration: underline dashed #cbd5e1;
            text-underline-offset: 3px;
        }
        .spec-strip a:hover { color: var(--accent-blue); text-decoration-color: var(--accent-blue); }

        /* Status & Capability Card */
        .app-teaser-card {
            background: #ffffff;
            border: 1px solid var(--border-light);
            border-radius: 14px;
            padding: 28px;
            margin-bottom: 28px;
            box-shadow: 0 12px 32px rgba(15, 23, 42, 0.04);
        }
        .teaser-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            flex-wrap: wrap;
            gap: 10px;
        }
        .teaser-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 0.72rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #047857;
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
            padding: 4px 10px;
            border-radius: 999px;
        }
        .status-dot {
            width: 7px;
            height: 7px;
            background-color: #10b981;
            border-radius: 50%;
            box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
            animation: pulse 2.2s infinite;
        }
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.45); }
            70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
            100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .teaser-rate {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.78rem;
            font-weight: 600;
            color: var(--text-muted);
            background: var(--surface-subtle);
            padding: 4px 10px;
            border-radius: 6px;
            border: 1px solid var(--border-light);
        }
        .teaser-title {
            font-size: 1.35rem;
            font-weight: 700;
            letter-spacing: -0.02em;
            color: var(--text-main);
            margin-bottom: 8px;
        }
        .teaser-desc {
            font-size: 0.92rem;
            color: var(--text-muted);
            margin-bottom: 22px;
        }
        .teaser-metrics-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 14px;
        }
        .teaser-metric {
            background: var(--surface-subtle);
            border: 1px solid var(--border-light);
            border-radius: 10px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            transition: border-color 0.15s ease, transform 0.15s ease;
        }
        .teaser-metric:hover {
            border-color: #cbd5e1;
            transform: translateY(-2px);
        }
        .metric-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }
        .metric-top-right {
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .copy-icon-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            min-inline-size: 24px;
            min-block-size: 26px;
            padding: 3px 8px;
            border-radius: 6px;
            border: 1px solid #cbd5e1;
            background: #ffffff;
            color: #334155;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.6875rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .copy-icon-btn:hover {
            color: var(--text-main);
            border-color: #94a3b8;
            background: #f1f5f9;
        }
        .copy-icon-btn.copied {
            color: #047857;
            border-color: #a7f3d0;
            background: #ecfdf5;
        }
        .filter-tabs {
            display: flex;
            align-items: center;
            overflow-x: auto;
            scrollbar-width: none;
            gap: 8px;
            margin-bottom: 18px;
        }
        .filter-tabs::-webkit-scrollbar,
        .terminal-tabs::-webkit-scrollbar { display: none; }
        .filter-tab {
            position: relative;
            flex: none;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.75rem;
            font-weight: 600;
            padding: 6px 12px;
            border-radius: 7px;
            border: 1px solid var(--border-light);
            background: var(--surface-subtle);
            color: var(--text-muted);
            cursor: pointer;
            transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
        }
        .filter-tab:hover {
            color: var(--text-main);
            border-color: #cbd5e1;
        }
        .filter-tab.active,
        .filter-tab[aria-selected="true"] {
            background: var(--text-main);
            color: #ffffff;
            border-color: var(--text-main);
        }
        .filter-tab[aria-selected="true"]::after {
            content: "";
            position: absolute;
            inset: auto 8px 0;
            border-block-end: 2px solid #38bdf8;
        }
        .agent-copy-bar {
            margin-top: 18px;
            padding-top: 16px;
            border-top: 1px solid var(--border-light);
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 10px;
        }
        .agent-copy-label {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.75rem;
            color: var(--text-muted);
            font-weight: 600;
        }
        .agent-copy-actions {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 8px;
        }
        .agent-copy-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 11px;
            border-radius: 7px;
            border: 1px solid var(--border-light);
            background: var(--surface-subtle);
            color: var(--text-main);
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.72rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .agent-copy-pill:hover {
            border-color: #cbd5e1;
            background: #ffffff;
        }
        .agent-copy-pill.copied {
            color: #047857;
            border-color: #a7f3d0;
            background: #ecfdf5;
        }
        .method-tag {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.6875rem;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: 5px;
            letter-spacing: 0.03em;
        }
        .method-get { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
        .method-post { background: #f5f3ff; color: #6d28d9; border: 1px solid #ddd6fe; }
        .metric-title {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.78rem;
            letter-spacing: -0.02em;
            font-weight: 700;
            color: var(--text-main);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            padding-bottom: 6px;
            border-bottom: 1px solid var(--border-light);
        }
        .metric-sub {
            font-size: 0.84rem;
            color: #475569;
            line-height: 1.5;
            flex-grow: 1;
        }
        .price-badge-group {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            margin-top: 4px;
        }
        .price-badge {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.74rem;
            font-weight: 600;
            padding: 3px 8px;
            border-radius: 4px;
        }
        .price-ln { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
        .price-usdc { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
        .price-free { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }

        /* Engineering Guarantees Grid */
        .guarantees-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 28px;
        }
        .guarantee-card {
            background: #ffffff;
            border: 1px solid var(--border-light);
            border-radius: 10px;
            padding: 16px;
        }
        .guarantee-label {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.7rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--accent-blue);
            margin-bottom: 6px;
        }
        .guarantee-title {
            font-size: 0.9rem;
            font-weight: 700;
            color: var(--text-main);
            margin-bottom: 4px;
        }
        .guarantee-desc {
            font-size: 0.78rem;
            color: var(--text-muted);
            line-height: 1.45;
        }

        /* Tabbed Terminal Block */
        .terminal-box {
            background: #0f172a;
            border-radius: 12px;
            overflow: hidden;
            margin-bottom: 40px;
            box-shadow: 0 14px 36px rgba(15, 23, 42, 0.14);
            border: 1px solid #1e293b;
        }
        .terminal-header {
            background: #1e293b;
            padding: 10px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
        }
        .terminal-left { display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1; }
        .terminal-dots { display: flex; gap: 6px; flex: none; }
        .terminal-dot { width: 10px; height: 10px; border-radius: 50%; }
        .dot-red { background: #ef4444; }
        .dot-yellow { background: #f59e0b; }
        .dot-green { background: #10b981; }
        .terminal-tabs { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
        .term-tab {
            position: relative;
            flex: none;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.72rem;
            color: #94a3b8;
            background: transparent;
            border: 1px solid transparent;
            padding: 4px 10px;
            border-radius: 6px;
            cursor: pointer;
            transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
        }
        .term-tab:hover { color: #e2e8f0; background: rgba(255,255,255,0.05); }
        .term-tab.active,
        .term-tab[aria-selected="true"] {
            color: #f8fafc;
            background: #0f172a;
            border-color: #334155;
        }
        .term-tab[aria-selected="true"]::after {
            content: "";
            position: absolute;
            inset: auto 8px 0;
            border-block-end: 2px solid #38bdf8;
        }
        .copy-btn {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.7rem;
            color: #cbd5e1;
            background: #0f172a;
            border: 1px solid #334155;
            padding: 4px 10px;
            border-radius: 6px;
            cursor: pointer;
        }
        .copy-btn:hover { border-color: #64748b; color: #ffffff; }
        .terminal-body {
            padding: 20px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.8rem;
            color: #e2e8f0;
            line-height: 1.65;
            overflow-x: auto;
        }
        .term-panel { display: none; }
        .term-panel.active { display: block; }
        .cmd-comment { color: #64748b; }
        .cmd-line { color: #38bdf8; }
        .cmd-val { color: #a7f3d0; }

        /* Footer */
        footer {
            border-top: 1px solid var(--border-light);
            padding: 36px 0 48px 0;
            font-size: 0.8125rem;
            color: var(--text-muted);
        }
        .footer-grid {
            display: grid;
            grid-template-columns: 1.5fr 1fr 1fr;
            gap: 28px;
            margin-bottom: 24px;
        }
        .footer-brand {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 700;
            color: var(--text-main);
            margin-bottom: 8px;
        }
        .footer-col-title {
            font-size: 0.72rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--text-main);
            margin-bottom: 10px;
        }
        .footer-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
        .footer-list a { color: var(--text-muted); text-decoration: none; }
        .footer-list a:hover { color: var(--accent-blue); }
        .footer-bottom {
            padding-top: 18px;
            border-top: 1px solid var(--border-light);
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 12px;
            font-size: 0.75rem;
            color: var(--text-mono);
        }

        @media (max-width: 860px) {
            .nav-links { display: none; }
        }
        @media (max-width: 780px) {
            .teaser-metrics-grid { grid-template-columns: 1fr; }
            .guarantees-grid { grid-template-columns: repeat(2, 1fr); }
            .footer-grid { grid-template-columns: 1fr; }
            h1.hero-title { font-size: 1.85rem; }
        }
        @media (max-width: 480px) {
            .guarantees-grid { grid-template-columns: 1fr; }
        }${renderCrewAiLiveStyles()}
    </style>
</head>
<body>
    <nav class="topbar">
        <div class="topbar-inner">
            <a href="/" class="nav-brand">
                <img src="https://sovroute.com/assets/sovroute-logo.png" alt="SovRoute">
                <span>SovRoute</span>
                <span class="nav-pill">Node Engine</span>
            </a>
            <div class="nav-links">
                <a href="#endpoints">Endpoints</a>
                <a href="#crewai">CrewAI Live</a>
                <a href="#architecture">Architecture</a>
                <a href="#quickstart">Quickstart</a>
                <a href="https://sovroute.com" target="_blank" rel="noopener">Core Gateway &rarr;</a>
            </div>
            <div class="nav-status" id="nav-health-pill">
                <span class="status-dot"></span>
                <span id="nav-health-text">MAINNET &middot; SYNCED</span>
            </div>
        </div>
    </nav>

    <div class="container">
        <header>
            <span class="eyebrow">Bare-Metal Bitcoin Core v31.1 &amp; EVM Forensics &middot; HTTP 402</span>
            <h1 class="hero-title">Sovereign Node Intelligence Engine</h1>
            <p class="hero-desc">
                Trust-minimized blockchain forensics and execution safety for autonomous AI agents. Real-time BIP-125 RBF screening, candidate block X-Ray, zero-broadcast consensus simulation, and EIP-7702 AuthTx scanning over Triple-Rail (MPP + L402 + x402).
            </p>
            <p class="hero-sub">direct bitcoind v31.1 + phoenixd &middot; MPP + L402 lightning + x402 base usdc &middot; &lt;0.05ms cache &middot; zero accounts</p>

            <div class="cta-group">
                <a href="#endpoints" class="btn btn-primary">Explore Endpoints &rarr;</a>
                <a href="#quickstart" class="btn btn-secondary">API Quickstart &amp; MCP</a>
            </div>

            <div class="spec-strip">
                <a href="/openapi.json" target="_blank">OpenAPI 3.1</a>
                <span>&middot;</span>
                <a href="/llms.txt" target="_blank">llms.txt</a>
                <span>&middot;</span>
                <a href="/.well-known/x402.json" target="_blank">x402 Bazaar</a>
                <span>&middot;</span>
                <a href="/mcp-config.json" target="_blank">mcp-config.json</a>
                <span>&middot;</span>
                <a href="https://www.npmjs.com/package/@aipp/sovereign-node-mcp" target="_blank">@aipp/sovereign-node-mcp</a>
            </div>
        </header>

        <main>
            <section id="endpoints">
                <div class="app-teaser-card">
                    <div class="teaser-header">
                        <div class="teaser-badge" id="card-health-badge">
                            <span class="status-dot"></span>
                            <span id="card-health-text">LIVE MAINNET &middot; NODE SYNCED</span>
                        </div>
                        <span class="teaser-rate" id="card-latency-text">Bitcoind 31.1 &amp; Phoenixd (&lt;0.05 ms cache)</span>
                    </div>

                    <h2 class="teaser-title">Verified Bitcoin &amp; EVM Forensics &middot; Triple-Rail Intelligence</h2>
                    <p class="teaser-desc">
                        Pay-per-call cryptographic endpoints backed directly by our bare-metal Bitcoin Core v31.1 fullnode and EVM bytecode scanner. All endpoints settle atomically via MPP (Machine Payments Protocol), L402 Lightning, or Base USDC x402 v2.
                    </p>

                    <div class="filter-tabs" role="tablist" aria-label="Endpoint categories">
                        <button type="button" role="tab" aria-selected="true" class="filter-tab active" data-filter="all">All Endpoints (15)</button>
                        <button type="button" role="tab" aria-selected="false" class="filter-tab" data-filter="btc">Bitcoin Intelligence (6)</button>
                        <button type="button" role="tab" aria-selected="false" class="filter-tab" data-filter="evm">EVM Security (2)</button>
                        <button type="button" role="tab" aria-selected="false" class="filter-tab" data-filter="intel">Market Oracles (4)</button>
                        <button type="button" role="tab" aria-selected="false" class="filter-tab" data-filter="bridge">Cross-Chain Bridge (1)</button>
                        <button type="button" role="tab" aria-selected="false" class="filter-tab" data-filter="sys">MCP &amp; System (2)</button>
                    </div>

                    <div class="teaser-metrics-grid">
                        <div class="teaser-metric" data-cat="btc">
                            <div class="metric-top">
                                <span class="method-tag method-get">GET</span>
                                <button type="button" class="copy-icon-btn" title="Copy full endpoint URL" aria-label="Copy full URL for rbf-shield" data-copy="https://node.sovroute.com/v1/chain/btc/rbf-shield/{txid}"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">URL</span></button>
                            </div>
                            <div class="metric-title">/v1/chain/btc/rbf-shield/:txid</div>
                            <div class="metric-sub">Detects 0-conf double-spend risk, BIP-125 replaceability, and UTXO confirmation status.</div>
                            <div class="price-badge-group">
                                <span class="price-badge price-ln">5 sats L402</span>
                                <span class="price-badge price-usdc">$0.005 Base USDC</span>
                            </div>
                        </div>

                        <div class="teaser-metric" data-cat="btc">
                            <div class="metric-top">
                                <span class="method-tag method-get">GET</span>
                                <button type="button" class="copy-icon-btn" title="Copy full endpoint URL" aria-label="Copy full URL for next-block-xray" data-copy="https://node.sovroute.com/v1/chain/btc/next-block-xray"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">URL</span></button>
                            </div>
                            <div class="metric-title">/v1/chain/btc/next-block-xray</div>
                            <div class="metric-sub">Inspects live miner block template for cutoff fee rate and exact queue rank.</div>
                            <div class="price-badge-group">
                                <span class="price-badge price-ln">3 sats L402</span>
                                <span class="price-badge price-usdc">$0.003 Base USDC</span>
                            </div>
                        </div>

                        <div class="teaser-metric" data-cat="btc">
                            <div class="metric-top">
                                <span class="method-tag method-post">POST</span>
                                <button type="button" class="copy-icon-btn" title="Copy full endpoint URL" aria-label="Copy full URL for simulate-tx" data-copy="https://node.sovroute.com/v1/chain/btc/simulate-tx"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">URL</span></button>
                            </div>
                            <div class="metric-title">/v1/chain/btc/simulate-tx</div>
                            <div class="metric-sub">Dry-runs raw transaction scripts against live UTXO state with 0% P2P broadcast.</div>
                            <div class="price-badge-group">
                                <span class="price-badge price-ln">5 sats L402</span>
                                <span class="price-badge price-usdc">$0.005 Base USDC</span>
                            </div>
                        </div>

                        <div class="teaser-metric" data-cat="btc">
                            <div class="metric-top">
                                <span class="method-tag method-get">GET</span>
                                <button type="button" class="copy-icon-btn" title="Copy full endpoint URL" aria-label="Copy full URL for mempool" data-copy="https://node.sovroute.com/v1/chain/btc/mempool"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">URL</span></button>
                            </div>
                            <div class="metric-title">/v1/chain/btc/mempool</div>
                            <div class="metric-sub">Real-time mempool backlog size, fee pressure tiers, and network congestion level.</div>
                            <div class="price-badge-group">
                                <span class="price-badge price-ln">2 sats L402</span>
                                <span class="price-badge price-usdc">$0.002 Base USDC</span>
                            </div>
                        </div>

                        <div class="teaser-metric" data-cat="btc">
                            <div class="metric-top">
                                <span class="method-tag method-get">GET</span>
                                <button type="button" class="copy-icon-btn" title="Copy full endpoint URL" aria-label="Copy full URL for fees" data-copy="https://node.sovroute.com/v1/chain/btc/fees"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">URL</span></button>
                            </div>
                            <div class="metric-title">/v1/chain/btc/fees</div>
                            <div class="metric-sub">Live Bitcoin Core smart fee estimates (sat/vB) for 1–2 block and 6 block targets.</div>
                            <div class="price-badge-group">
                                <span class="price-badge price-ln">1 sat L402</span>
                                <span class="price-badge price-usdc">$0.001 Base USDC</span>
                            </div>
                        </div>

                        <div class="teaser-metric" data-cat="btc">
                            <div class="metric-top">
                                <span class="method-tag method-get">GET</span>
                                <button type="button" class="copy-icon-btn" title="Copy full endpoint URL" aria-label="Copy full URL for block" data-copy="https://node.sovroute.com/v1/chain/btc/block"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">URL</span></button>
                            </div>
                            <div class="metric-title">/v1/chain/btc/block</div>
                            <div class="metric-sub">Verified Bitcoin Mainnet chain tip height, block hash, difficulty, and timestamp.</div>
                            <div class="price-badge-group">
                                <span class="price-badge price-ln">1 sat L402</span>
                                <span class="price-badge price-usdc">$0.001 Base USDC</span>
                            </div>
                        </div>

                        <div class="teaser-metric" data-cat="evm">
                            <div class="metric-top">
                                <span class="method-tag method-post">POST</span>
                                <button type="button" class="copy-icon-btn" title="Copy full endpoint URL" aria-label="Copy full URL for eip7702-shield" data-copy="https://node.sovroute.com/v1/chain/evm/eip7702-shield"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">URL</span></button>
                            </div>
                            <div class="metric-title">/v1/chain/evm/eip7702-shield</div>
                            <div class="metric-sub">Scans Pectra EIP-7702 delegations for drainer opcodes and cross-chain replay risk.</div>
                            <div class="price-badge-group">
                                <span class="price-badge price-ln">5 sats L402</span>
                                <span class="price-badge price-usdc">$0.005 Base USDC</span>
                            </div>
                        </div>

                        <div class="teaser-metric" data-cat="evm">
                            <div class="metric-top">
                                <span class="method-tag method-post">POST</span>
                                <button type="button" class="copy-icon-btn" title="Copy full endpoint URL" aria-label="Copy full URL for bytecode-risk-ml" data-copy="https://node.sovroute.com/v1/chain/evm/bytecode-risk-ml"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">URL</span></button>
                            </div>
                            <div class="metric-title">/v1/chain/evm/bytecode-risk-ml</div>
                            <div class="metric-sub">PyTorch ONNX neural network classifier scoring EVM bytecode or contract addresses for drainer patterns.</div>
                            <div class="price-badge-group">
                                <span class="price-badge price-ln">5 sats L402</span>
                                <span class="price-badge price-usdc">$0.005 Base USDC</span>
                            </div>
                        </div>

                        <div class="teaser-metric" data-cat="bridge">
                            <div class="metric-top">
                                <span class="method-tag method-post">POST</span>
                                <button type="button" class="copy-icon-btn" title="Copy full endpoint URL" aria-label="Copy full URL for pay-lightning" data-copy="https://node.sovroute.com/v1/omni/pay-lightning"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">URL</span></button>
                            </div>
                            <div class="metric-title">/v1/omni/pay-lightning</div>
                            <div class="metric-sub">SUB-LIG cross-chain bridge settling BOLT-11 Lightning invoices via Solana (SOL/USDC) or EVM (Base/Arbitrum).</div>
                            <div class="price-badge-group">
                                <span class="price-badge price-ln">25 sats L402</span>
                                <span class="price-badge price-usdc">$0.025 Omni-Rail</span>
                            </div>
                        </div>

                        <div class="teaser-metric" data-cat="intel">
                            <div class="metric-top">
                                <span class="method-tag method-get">GET</span>
                                <button type="button" class="copy-icon-btn" title="Copy full endpoint URL" aria-label="Copy full URL for microstructure" data-copy="https://node.sovroute.com/v1/intel/microstructure?symbol=BTC"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">URL</span></button>
                            </div>
                            <div class="metric-title">/v1/intel/microstructure</div>
                            <div class="metric-sub">Zero-wait in-memory orderbook imbalance, cross-exchange spread (bps), 1m/5m CVD, funding and liquidation cascade score across Binance, Bybit, OKX &amp; Hyperliquid.</div>
                            <div class="price-badge-group">
                                <span class="price-badge price-ln">3 sats L402</span>
                                <span class="price-badge price-usdc">$0.003 Base USDC</span>
                            </div>
                        </div>

                        <div class="teaser-metric" data-cat="intel">
                            <div class="metric-top">
                                <span class="method-tag method-get">GET</span>
                                <button type="button" class="copy-icon-btn" title="Copy full endpoint URL" aria-label="Copy full URL for polymarket-edge" data-copy="https://node.sovroute.com/v1/intel/polymarket-edge?asset=BTC"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">URL</span></button>
                            </div>
                            <div class="metric-title">/v1/intel/polymarket-edge</div>
                            <div class="metric-sub">Live Polymarket CLOB orderbook probabilities and Gamma 24h volume paired with real-time 4-exchange spot price and orderbook imbalance.</div>
                            <div class="price-badge-group">
                                <span class="price-badge price-ln">4 sats L402</span>
                                <span class="price-badge price-usdc">$0.004 Base USDC</span>
                            </div>
                        </div>

                        <div class="teaser-metric" data-cat="intel">
                            <div class="metric-top">
                                <span class="method-tag method-get">GET</span>
                                <button type="button" class="copy-icon-btn" title="Copy full endpoint URL" aria-label="Copy full URL for funding-arb" data-copy="https://node.sovroute.com/v1/intel/funding-arb?symbol=BTC"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">URL</span></button>
                            </div>
                            <div class="metric-title">/v1/intel/funding-arb</div>
                            <div class="metric-sub">Cross-exchange funding rate carry (APR) and Binance spot-to-perp basis across Binance, Bybit &amp; OKX in RAM.</div>
                            <div class="price-badge-group">
                                <span class="price-badge price-ln">3 sats L402</span>
                                <span class="price-badge price-usdc">$0.003 Base USDC</span>
                            </div>
                        </div>

                        <div class="teaser-metric" data-cat="intel">
                            <div class="metric-top">
                                <span class="method-tag method-get">GET</span>
                                <button type="button" class="copy-icon-btn" title="Copy full endpoint URL" aria-label="Copy full URL for options-skew" data-copy="https://node.sovroute.com/v1/intel/options-skew?asset=BTC"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">URL</span></button>
                            </div>
                            <div class="metric-title">/v1/intel/options-skew</div>
                            <div class="metric-sub">Live Deribit DVOL index, CALM/ELEVATED/PANIC regime, ATM IV, OTM put-call skew and options OI ratio.</div>
                            <div class="price-badge-group">
                                <span class="price-badge price-ln">4 sats L402</span>
                                <span class="price-badge price-usdc">$0.004 Base USDC</span>
                            </div>
                        </div>

                        <div class="teaser-metric" data-cat="sys">
                            <div class="metric-top">
                                <span class="method-tag method-post">POST</span>
                                <button type="button" class="copy-icon-btn" title="Copy full endpoint URL" aria-label="Copy full URL for Remote MCP" data-copy="https://node.sovroute.com/mcp"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">URL</span></button>
                            </div>
                            <div class="metric-title">/mcp</div>
                            <div class="metric-sub">Remote Streamable HTTP MCP: 8 deterministic pre-flight guardrails for CrewAI, Claude &amp; Cursor.</div>
                            <div class="price-badge-group">
                                <span class="price-badge price-free">15 FREE/DAY</span>
                                <span class="price-badge price-ln">1-5 sats L402</span>
                                <span class="price-badge price-usdc">$0.001-$0.005 x402</span>
                            </div>
                        </div>

                        <div class="teaser-metric" data-cat="sys">
                            <div class="metric-top">
                                <span class="method-tag method-get">GET</span>
                                <button type="button" class="copy-icon-btn" title="Copy full endpoint URL" aria-label="Copy full URL for health" data-copy="https://node.sovroute.com/health"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">URL</span></button>
                            </div>
                            <div class="metric-title">/health</div>
                            <div class="metric-sub">Public bare-metal node synchronization, liveness, and Triple-Rail gateway status.</div>
                            <div class="price-badge-group">
                                <span class="price-badge price-free">FREE</span>
                            </div>
                        </div>
                    </div>

                    <div class="agent-copy-bar">
                        <span class="agent-copy-label">Give to your AI agent:</span>
                        <div class="agent-copy-actions">
                            <button type="button" class="agent-copy-pill" data-copy="https://node.sovroute.com/llms.txt" title="Copy llms.txt URL"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>llms.txt</span></button>
                            <button type="button" class="agent-copy-pill" data-copy="https://node.sovroute.com/openapi.json" title="Copy OpenAPI 3.1 URL"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>OpenAPI 3.1</span></button>
                            <button type="button" class="agent-copy-pill" data-copy="https://node.sovroute.com/.well-known/x402.json" title="Copy x402 Bazaar Manifest URL"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>x402.json</span></button>
                            <button type="button" class="agent-copy-pill" data-copy="https://node.sovroute.com/mcp" title="Copy Remote Streamable HTTP MCP URL"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Remote MCP</span></button>
                            <button type="button" class="agent-copy-pill" data-copy="npx -y @aipp/sovereign-node-mcp" title="Copy MCP command"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>MCP (npx)</span></button>
                        </div>
                    </div>
                </div>
            </section>

            ${renderCrewAiLiveSectionHtml()}

            <section id="architecture">
                <div class="guarantees-grid">
                    <div class="guarantee-card">
                        <div class="guarantee-label">Ground Truth</div>
                        <div class="guarantee-title">Bare-Metal Core v31.1</div>
                        <div class="guarantee-desc">Zero third-party RPC middlemen. Queries served straight from NVMe fullnode with &lt;0.05ms cache.</div>
                    </div>
                    <div class="guarantee-card">
                        <div class="guarantee-label">Zero-Leak</div>
                        <div class="guarantee-title">0% P2P Broadcast</div>
                        <div class="guarantee-desc"><code>simulate-tx</code> validates scripts against live UTXO state without leaking transactions to mempool.</div>
                    </div>
                    <div class="guarantee-card">
                        <div class="guarantee-label">Fault Tolerant</div>
                        <div class="guarantee-title">500 Retry Voucher</div>
                        <div class="guarantee-desc">HMAC-signed <code>X-Payment-Retry-Voucher</code> &amp; idempotent nonce recovery protect every paid request.</div>
                    </div>
                    <div class="guarantee-card">
                        <div class="guarantee-label">EVM Pectra</div>
                        <div class="guarantee-title">EIP-7702 Disassembler</div>
                        <div class="guarantee-desc">Detects <code>SELFDESTRUCT</code>, unverified <code>DELEGATECALL</code>, drain selectors, and <code>chainId=0</code> replay.</div>
                    </div>
                </div>
            </section>

            <section id="quickstart">
                <div class="terminal-box">
                    <div class="terminal-header">
                        <div class="terminal-left">
                            <div class="terminal-dots">
                                <span class="terminal-dot dot-red"></span>
                                <span class="terminal-dot dot-yellow"></span>
                                <span class="terminal-dot dot-green"></span>
                            </div>
                            <div class="terminal-tabs" role="tablist" aria-label="Code examples">
                                <button type="button" role="tab" aria-selected="true" class="term-tab active" data-tab="xray">Next-Block X-Ray (GET)</button>
                                <button type="button" role="tab" aria-selected="false" class="term-tab" data-tab="eip7702">EIP-7702 Shield (POST)</button>
                                <button type="button" role="tab" aria-selected="false" class="term-tab" data-tab="mcp">MCP Server (HTTP / npx)</button>
                            </div>
                        </div>
                        <button type="button" class="copy-btn" id="copy-term-btn">Copy</button>
                    </div>
                    <div class="terminal-body">
                        <div class="term-panel active" id="panel-xray">
<div class="cmd-comment"># 1. Probe protected forensics endpoint (returns HTTP 402 with MPP + L402 + x402 challenges)</div>
<span class="cmd-line">curl</span> -i https://node.sovroute.com/v1/chain/btc/next-block-xray<br><br>
<div class="cmd-comment"># 2A. Settle via Machine Payments Protocol (MPP draft-lightning-charge-00)</div>
<span class="cmd-line">curl</span> -H <span class="cmd-val">"Authorization: Payment &lt;base64url_mpp_token&gt;"</span> https://node.sovroute.com/v1/chain/btc/next-block-xray<br><br>
<div class="cmd-comment"># 2B. Settle via Lightning L402</div>
<span class="cmd-line">curl</span> -H <span class="cmd-val">"Authorization: L402 &lt;macaroon&gt;:&lt;preimage&gt;"</span> https://node.sovroute.com/v1/chain/btc/next-block-xray<br><br>
<div class="cmd-comment"># 2C. Settle via Base L2 USDC (x402 / MPP draft-usdc-charge-00)</div>
<span class="cmd-line">curl</span> -H <span class="cmd-val">"Payment-Signature: &lt;base64_eip3009_payload&gt;"</span> https://node.sovroute.com/v1/chain/btc/next-block-xray
                        </div>
                        <div class="term-panel" id="panel-eip7702">
<div class="cmd-comment"># Inspect EIP-7702 authorization_list for drainer opcodes &amp; chainId=0 cross-chain replay</div>
<span class="cmd-line">curl</span> -X POST https://node.sovroute.com/v1/chain/evm/eip7702-shield \\<br>
&nbsp;&nbsp;-H <span class="cmd-val">"Content-Type: application/json"</span> \\<br>
&nbsp;&nbsp;-H <span class="cmd-val">"Payment-Signature: &lt;base64_eip3009_payload&gt;"</span> \\<br>
&nbsp;&nbsp;-d <span class="cmd-val">'{"executionChainId":8453,"authorizationList":[{"chainId":8453,"address":"0x63c0c19a282a1b52b07dd5a65b58948a07dae32b","nonce":0}]}'</span>
                        </div>
                        <div class="term-panel" id="panel-mcp">
<div class="cmd-comment"># Option A: CrewAI 1.x Native 1-Line Remote Streamable HTTP MCP (Zero Wallet Setup)</div>
<span class="cmd-line">Agent</span>(role=<span class="cmd-val">"Security Analyst"</span>, mcps=[<span class="cmd-val">"https://node.sovroute.com/mcp"</span>])<br><br>
<div class="cmd-comment"># Option B: Local Stdio MCP for Claude Desktop, Cursor IDE &amp; AI Agents</div>
<span class="cmd-line">npx</span> -y @aipp/sovereign-node-mcp<br><br>
<div class="cmd-comment"># 8 deterministic tools: inspect_eip7702_authorization, check_rbf_fraud_shield, get_next_block_xray,</div>
<div class="cmd-comment"># simulate_raw_transaction, get_bitcoin_smart_fees, get_mempool_entropy, verify_block_header, pay_lightning_invoice</div>
                        </div>
                    </div>
                </div>
            </section>
        </main>

        <footer>
            <div class="footer-grid">
                <div>
                    <div class="footer-brand">
                        <img src="https://sovroute.com/assets/sovroute-logo.png" alt="SovRoute" style="height: 20px; width: auto;">
                        <span>SovRoute Node Engine</span>
                    </div>
                    <p style="font-size: 0.8rem; line-height: 1.5; max-width: 300px;">
                        Independent bare-metal Bitcoin Core v31.1 &amp; EVM security oracle for autonomous AI agents.
                    </p>
                </div>
                <div>
                    <div class="footer-col-title">Specifications</div>
                    <ul class="footer-list">
                        <li><a href="/openapi.json" target="_blank">OpenAPI 3.1 Spec</a></li>
                        <li><a href="/llms.txt" target="_blank">llms.txt</a></li>
                        <li><a href="/.well-known/x402.json" target="_blank">x402 Bazaar Manifest</a></li>
                        <li><a href="/mcp-config.json" target="_blank">MCP Config JSON</a></li>
                    </ul>
                </div>
                <div>
                    <div class="footer-col-title">Ecosystem</div>
                    <ul class="footer-list">
                        <li><a href="https://sovroute.com" target="_blank">SovRoute Core (sovroute.com)</a></li>
                        <li><a href="https://www.npmjs.com/package/@aipp/sovereign-node-mcp" target="_blank">npm: @aipp/sovereign-node-mcp</a></li>
                        <li><a href="https://github.com/aipp-key/sovereign-node-mcp" target="_blank">GitHub</a></li>
                        <li><a href="mailto:contact@sovroute.com">contact@sovroute.com</a></li>
                    </ul>
                </div>
            </div>
            <div class="footer-bottom">
                <span>&copy; 2026 SovRoute Protocol &middot; Non-Custodial &middot; HTTP-402 Native</span>
                <span>Multi-Rail Settlement: L402 Lightning &middot; Machine Payments Protocol (MPP) &middot; Base USDC x402</span>
            </div>
        </footer>
    </div>

    <script>
        (function () {
            const tabs = document.querySelectorAll('.term-tab');
            const panels = document.querySelectorAll('.term-panel');
            tabs.forEach((btn) => {
                btn.addEventListener('click', () => {
                    tabs.forEach((b) => {
                        b.classList.remove('active');
                        b.setAttribute('aria-selected', 'false');
                    });
                    panels.forEach((p) => p.classList.remove('active'));
                    btn.classList.add('active');
                    btn.setAttribute('aria-selected', 'true');
                    btn.scrollIntoView({ block: 'nearest', inline: 'nearest', container: 'nearest' });
                    const target = document.getElementById('panel-' + btn.dataset.tab);
                    if (target) target.classList.add('active');
                });
            });

            const timers = new WeakMap();
            const copyBtn = document.getElementById('copy-term-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', async () => {
                    const active = document.querySelector('.term-panel.active');
                    if (!active) return;
                    clearTimeout(timers.get(copyBtn));
                    try {
                        await navigator.clipboard.writeText(active.innerText);
                        copyBtn.textContent = 'Copied!';
                    } catch {
                        copyBtn.textContent = 'Copy failed';
                    }
                    timers.set(copyBtn, setTimeout(() => (copyBtn.textContent = 'Copy'), 1500));
                });
            }

            const filterTabs = document.querySelectorAll('.filter-tab');
            const endpointCards = document.querySelectorAll('.teaser-metric[data-cat]');
            filterTabs.forEach((tab) => {
                tab.addEventListener('click', () => {
                    filterTabs.forEach((t) => {
                        t.classList.remove('active');
                        t.setAttribute('aria-selected', 'false');
                    });
                    tab.classList.add('active');
                    tab.setAttribute('aria-selected', 'true');
                    tab.scrollIntoView({ block: 'nearest', inline: 'nearest', container: 'nearest' });
                    const filter = tab.getAttribute('data-filter');
                    endpointCards.forEach((card) => {
                        const show = filter === 'all' || card.getAttribute('data-cat') === filter;
                        card.style.display = show ? 'flex' : 'none';
                    });
                });
            });

            const copySvg = '<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            const checkSvg = '<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            document.querySelectorAll('[data-copy]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const text = btn.getAttribute('data-copy');
                    if (!text) return;
                    clearTimeout(timers.get(btn));
                    const svg = btn.querySelector('svg');
                    const labelEl = btn.querySelector('.copy-label');
                    const defaultLabel = btn.getAttribute('data-default-label') || 'URL';
                    try {
                        await navigator.clipboard.writeText(text);
                        if (svg) svg.outerHTML = checkSvg;
                        if (labelEl) labelEl.textContent = 'Copied';
                        btn.classList.add('copied');
                        timers.set(btn, setTimeout(() => {
                            const cur = btn.querySelector('svg');
                            if (cur) cur.outerHTML = copySvg;
                            if (labelEl) labelEl.textContent = defaultLabel;
                            btn.classList.remove('copied');
                        }, 1400));
                    } catch {
                        if (labelEl) {
                            labelEl.textContent = 'Failed';
                            timers.set(btn, setTimeout(() => {
                                labelEl.textContent = defaultLabel;
                            }, 1400));
                        }
                    }
                });
            });

            async function probeHealth() {
                const t0 = performance.now();
                try {
                    const res = await fetch('/health', { cache: 'no-store' });
                    const ms = Math.round(performance.now() - t0);
                    const data = await res.json();
                    if (data && data.status === 'UP') {
                        const navTxt = document.getElementById('nav-health-text');
                        const cardTxt = document.getElementById('card-health-text');
                        const latTxt = document.getElementById('card-latency-text');
                        if (navTxt) navTxt.textContent = 'MAINNET · LIVE (' + ms + 'ms)';
                        if (cardTxt) cardTxt.textContent = data.nodeSynced ? 'LIVE MAINNET · NODE SYNCED' : 'LIVE MAINNET · SYNCING';
                        if (latTxt) latTxt.textContent = 'Bitcoind 31.1 & Phoenixd (' + ms + 'ms probe)';
                    }
                } catch {}
            }
            probeHealth();${renderCrewAiLiveScript()}
        })();
    </script>
</body>
</html>`;
}
