import {
  CrewVerifiedRun,
  DEFAULT_VERIFIED_CREW_RUNS,
} from '../../../domain/schemas/crewai-status.schema.js';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderFlowPanel(opts: {
  id: string;
  title: string;
  subtitle: string;
  requiredInputs: string[];
  run: CrewVerifiedRun;
  active: boolean;
}): string {
  const shortTx = `${opts.run.txid.slice(0, 10)}...${opts.run.txid.slice(-8)}`;
  const rows = opts.run.tools
    .map(
      (t) =>
        `<tr><td><code>${esc(t.tool)}</code></td><td><span class="crew-pass-pill">${esc(t.status)}</span></td><td><code>${esc(t.metric)}</code></td></tr>`
    )
    .join('');

  return `<div class="crew-panel${opts.active ? ' active' : ''}" id="crew-panel-${esc(opts.id)}" role="tabpanel">
    <div class="crew-panel-head">
      <div>
        <div class="crew-panel-title">${esc(opts.title)}</div>
        <div class="crew-panel-sub">${esc(opts.subtitle)}</div>
      </div>
      <span class="crew-summary-pill">${esc(opts.run.summary)}</span>
    </div>
    <div class="crew-meta-strip">
      <span class="crew-meta-item">Status: <strong class="crew-flow-status" id="crew-status-${esc(opts.id)}">Verified Snapshot</strong></span>
      <span class="crew-meta-item">Run ID: <code>${esc(opts.run.kickoffId)}</code></span>
      <span class="crew-meta-item">Mainnet TX: <a href="https://mempool.space/tx/${esc(opts.run.txid)}" target="_blank" rel="noopener noreferrer"><code>${esc(shortTx)}</code> &nearr;</a></span>
      <span class="crew-meta-item">Verified: <code>${esc(opts.run.verifiedAt)}</code></span>
      <span class="crew-meta-item">Inputs: <code id="crew-inputs-${esc(opts.id)}">${esc(opts.requiredInputs.join(', '))}</code></span>
    </div>
    <div class="crew-table-wrap">
      <table class="crew-table">
        <thead><tr><th>MCP Tool</th><th>Result</th><th>Live Mainnet Output</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

export function renderCrewAiLiveStyles(): string {
  return `
        /* CrewAI Cloud Live Verification */
        .crew-badge-partial { color: #b45309; background: #fffbeb; border-color: #fde68a; }
        .status-dot.dot-amber { background-color: #f59e0b; box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.25); animation: none; }
        .crew-panel { display: none; border: 1px solid var(--border-light); border-radius: 10px; background: var(--surface-subtle); padding: 16px; }
        .crew-panel.active { display: block; }
        .crew-panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
        .crew-panel-title { font-size: 0.95rem; font-weight: 700; color: var(--text-main); }
        .crew-panel-sub { font-size: 0.8rem; color: var(--text-muted); margin-top: 2px; }
        .crew-summary-pill { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.72rem; font-weight: 700; color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
        .crew-meta-strip { display: flex; flex-wrap: wrap; gap: 8px 16px; padding: 10px 12px; background: #ffffff; border: 1px solid var(--border-light); border-radius: 8px; margin-bottom: 12px; font-size: 0.75rem; color: var(--text-muted); }
        .crew-meta-item code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text-main); font-size: 0.73rem; }
        .crew-meta-item a { color: var(--accent-blue); text-decoration: none; font-weight: 600; }
        .crew-meta-item a:hover { text-decoration: underline; }
        .crew-flow-status { color: var(--text-main); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.73rem; }
        .crew-flow-status.is-online { color: #047857; }
        .crew-flow-status.is-degraded { color: #b45309; }
        .crew-table-wrap { overflow-x: auto; background: #ffffff; border: 1px solid var(--border-light); border-radius: 8px; }
        .crew-table { width: 100%; border-collapse: collapse; font-size: 0.79rem; text-align: left; }
        .crew-table th { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.69rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); background: #f8fafc; padding: 9px 12px; border-bottom: 1px solid var(--border-light); }
        .crew-table td { padding: 8px 12px; border-bottom: 1px solid var(--border-light); color: var(--text-main); vertical-align: middle; }
        .crew-table tr:last-child td { border-bottom: none; }
        .crew-table code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.74rem; color: #0f172a; }
        .crew-pass-pill { display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.68rem; font-weight: 700; color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 2px 7px; border-radius: 4px; }
        .crew-ext-link { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: 7px; border: 1px solid var(--border-light); background: #ffffff; color: var(--text-main); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.72rem; font-weight: 600; text-decoration: none; transition: all 0.15s ease; }
        .crew-ext-link:hover { border-color: var(--accent-blue-border); color: var(--accent-blue); }
        @media (max-width: 780px) { .crew-table th, .crew-table td { padding: 7px 8px; font-size: 0.73rem; } }`;
}

export function renderCrewAiLiveSectionHtml(): string {
  const fullPanel = renderFlowPanel({
    id: 'full-stack-diagnostic',
    title: 'SovRoute Full Stack Diagnostic-v1',
    subtitle: 'End-to-end diagnostic crew executing all 7 deterministic Bitcoin L1 and EVM EIP-7702 tools over Streamable HTTP MCP.',
    requiredInputs: ['txid', 'delegate_address', 'raw_tx_hex'],
    run: DEFAULT_VERIFIED_CREW_RUNS['full-stack-diagnostic'],
    active: true,
  });

  const preflightPanel = renderFlowPanel({
    id: 'preflight-security-check',
    title: 'Bitcoin Pre-Flight Security Check-v1',
    subtitle: 'Autonomous payment guardrail crew verifying smart fees, mempool entropy, next-block template rank, and BIP-125 RBF risk.',
    requiredInputs: ['txid'],
    run: DEFAULT_VERIFIED_CREW_RUNS['preflight-security-check'],
    active: false,
  });

  return `<section id="crewai">
                <div class="app-teaser-card">
                    <div class="teaser-header">
                        <div class="teaser-badge" id="crewai-live-badge">
                            <span class="status-dot" id="crewai-live-dot"></span>
                            <span id="crewai-live-text">CREWAI CLOUD &middot; VERIFYING HEARTBEAT</span>
                        </div>
                        <span class="teaser-rate" id="crewai-checked-text">Read-Only Heartbeat &middot; Zero Public Triggers</span>
                    </div>

                    <h2 class="teaser-title">CrewAI Cloud Live Verification &middot; Verified Mainnet Runs</h2>
                    <p class="teaser-desc">
                        Read-only deployment liveness check against <code>https://node.sovroute.com/mcp</code> paired with authentic mainnet execution evidence. Public web triggers remain disabled to prevent unauthorized quota consumption.
                    </p>

                    <div class="filter-tabs" role="tablist" aria-label="CrewAI verified workflows">
                        <button type="button" role="tab" aria-selected="true" class="filter-tab active" data-crew-tab="full-stack-diagnostic">Full Stack Diagnostic (7/7 Tools)</button>
                        <button type="button" role="tab" aria-selected="false" class="filter-tab" data-crew-tab="preflight-security-check">Pre-Flight Security Check (4/4 Tools)</button>
                    </div>

                    ${fullPanel}
                    ${preflightPanel}

                    <div class="agent-copy-bar">
                        <span class="agent-copy-label">Run in your own CrewAI agent:</span>
                        <div class="agent-copy-actions">
                            <button type="button" class="agent-copy-pill" data-default-label="Copy CrewAI 1-Liner" data-copy="Agent(role=&quot;Security Analyst&quot;, mcps=[&quot;https://node.sovroute.com/mcp&quot;])" title="Copy CrewAI 1-Liner"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">Copy CrewAI 1-Liner</span></button>
                            <a href="https://github.com/sovroutecore/sovroute-crewai-guardrail" target="_blank" rel="noopener noreferrer" class="crew-ext-link">CrewAI Repo &nearr;</a>
                            <a href="https://github.com/crewAIInc/crewAI-quickstarts/pull/10" target="_blank" rel="noopener noreferrer" class="crew-ext-link">CrewAI Quickstarts PR #10 &nearr;</a>
                        </div>
                    </div>
                    <div class="agent-copy-bar" style="margin-top: 10px; padding-top: 10px;">
                        <span class="agent-copy-label">Verified in LangGraph &amp; LangSmith:</span>
                        <div class="agent-copy-actions">
                            <a href="https://smith.langchain.com/public/012d9240-a232-414a-8a6d-20297cf3aafd/r" target="_blank" rel="noopener noreferrer" class="crew-ext-link">Live LangSmith Trace &nearr;</a>
                            <a href="https://github.com/sovroutecore/sovroute-langchain-guardrail" target="_blank" rel="noopener noreferrer" class="crew-ext-link">LangGraph Guardrail Repo &nearr;</a>
                        </div>
                    </div>
                    <div class="agent-copy-bar" style="margin-top: 10px; padding-top: 10px;">
                        <span class="agent-copy-label">OpenAI Agents SDK (Python):</span>
                        <div class="agent-copy-actions">
                            <button type="button" class="agent-copy-pill" data-default-label="Copy OpenAI Agents 1-Liner" data-copy="Agent(name=&quot;SovRoute Guardrail&quot;, mcp_servers=[MCPServerStreamableHttp(url=&quot;https://node.sovroute.com/mcp&quot;)])" title="Copy OpenAI Agents 1-Liner"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">Copy OpenAI Agents 1-Liner</span></button>
                            <a href="https://github.com/sovroutecore/sovroute-openai-agents-guardrail" target="_blank" rel="noopener noreferrer" class="crew-ext-link">OpenAI Agents Repo &nearr;</a>
                        </div>
                    </div>
                    <div class="agent-copy-bar" style="margin-top: 10px; padding-top: 10px;">
                        <span class="agent-copy-label">Vercel AI SDK (TypeScript / Next.js):</span>
                        <div class="agent-copy-actions">
                            <button type="button" class="agent-copy-pill" data-default-label="Copy Vercel AI 1-Liner" data-copy="generateText({ model: openai(&quot;gpt-4o&quot;), maxSteps: 5, tools: sovrouteMcpTools })" title="Copy Vercel AI 1-Liner"><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span class="copy-label">Copy Vercel AI 1-Liner</span></button>
                            <a href="https://github.com/sovroutecore/sovroute-vercel-ai-guardrail" target="_blank" rel="noopener noreferrer" class="crew-ext-link">Vercel AI Repo &nearr;</a>
                        </div>
                    </div>
                </div>
            </section>`;
}

export function renderCrewAiLiveScript(): string {
  return `
            const crewTabs = document.querySelectorAll('[data-crew-tab]');
            const crewPanels = document.querySelectorAll('.crew-panel');
            crewTabs.forEach((tab) => {
                tab.addEventListener('click', () => {
                    crewTabs.forEach((t) => {
                        t.classList.remove('active');
                        t.setAttribute('aria-selected', 'false');
                    });
                    crewPanels.forEach((p) => p.classList.remove('active'));
                    tab.classList.add('active');
                    tab.setAttribute('aria-selected', 'true');
                    const target = document.getElementById('crew-panel-' + tab.getAttribute('data-crew-tab'));
                    if (target) target.classList.add('active');
                });
            });

            async function probeCrewAiStatus() {
                const t0 = performance.now();
                try {
                    const res = await fetch('/crewai-status', { cache: 'no-store' });
                    if (!res.ok) return;
                    const ms = Math.round(performance.now() - t0);
                    const data = await res.json();
                    const badge = document.getElementById('crewai-live-badge');
                    const dot = document.getElementById('crewai-live-dot');
                    const liveTxt = document.getElementById('crewai-live-text');
                    const checkedTxt = document.getElementById('crewai-checked-text');
                    if (data && liveTxt) {
                        if (data.status === 'ONLINE') {
                            liveTxt.textContent = data.onlineCount + '/' + data.totalCount + ' CREWAI CLOUD CREWS ONLINE \\u00B7 7/7 MCP TOOLS';
                        } else if (data.status === 'PARTIAL') {
                            liveTxt.textContent = data.onlineCount + '/' + data.totalCount + ' CREWAI CLOUD CREWS ONLINE (PARTIAL)';
                            if (badge) badge.classList.add('crew-badge-partial');
                            if (dot) dot.classList.add('dot-amber');
                        } else {
                            liveTxt.textContent = 'VERIFIED MAINNET SNAPSHOT \\u00B7 7/7 MCP TOOLS';
                            if (badge) badge.classList.add('crew-badge-partial');
                            if (dot) dot.classList.add('dot-amber');
                        }
                    }
                    if (checkedTxt) {
                        const mode = data && data.cached ? 'Cached Ping' : 'Live Ping';
                        checkedTxt.textContent = 'Read-Only ' + mode + ' \\u00B7 ' + ms + 'ms \\u00B7 Zero Triggers';
                    }
                    if (data && Array.isArray(data.flows)) {
                        data.flows.forEach((f) => {
                            const statusEl = document.getElementById('crew-status-' + f.id);
                            if (statusEl) {
                                statusEl.classList.remove('is-online', 'is-degraded');
                                if (f.online) {
                                    statusEl.textContent = 'Online (' + (f.latencyMs !== null ? f.latencyMs + 'ms' : 'OK') + ')';
                                    statusEl.classList.add('is-online');
                                } else {
                                    statusEl.textContent = f.statusLabel || 'Verified Snapshot';
                                    if (f.probeConfigured) statusEl.classList.add('is-degraded');
                                }
                            }
                            const inputsEl = document.getElementById('crew-inputs-' + f.id);
                            if (inputsEl && Array.isArray(f.requiredInputs) && f.requiredInputs.length > 0) {
                                inputsEl.textContent = f.requiredInputs.join(', ');
                            }
                        });
                    }
                } catch {}
            }
            probeCrewAiStatus();`;
}
