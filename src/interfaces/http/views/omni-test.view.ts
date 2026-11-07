import { BASE_PAY_TO_ADDRESS } from '../middleware/l402.middleware.js';
import { SOLANA_PAY_TO_ADDRESS } from '../middleware/omni-rail.middleware.js';

export function renderOmniTestHtml(): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SovRoute Quad-Rail — Canlı Cüzdan Test Konsolu</title>
  <style>
    :root {
      --bg: #070b14;
      --card: #0d1424;
      --border: #1e293b;
      --accent: #f59e0b;
      --green: #10b981;
      --blue: #3b82f6;
      --purple: #8b5cf6;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 32px 20px;
      max-width: 1080px;
      margin: 0 auto;
      line-height: 1.5;
    }
    h1 { font-size: 26px; margin-bottom: 6px; display: flex; align-items: center; gap: 10px; }
    .sub { color: var(--muted); font-size: 14px; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 18px; margin-bottom: 24px; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      width: fit-content;
      text-transform: uppercase;
    }
    .b-evm { background: rgba(59,130,246,0.18); color: #60a5fa; border: 1px solid rgba(59,130,246,0.35); }
    .b-sol { background: rgba(139,92,246,0.18); color: #c084fc; border: 1px solid rgba(139,92,246,0.35); }
    .b-ln { background: rgba(245,158,11,0.18); color: #fbbf24; border: 1px solid rgba(245,158,11,0.35); }
    .addr {
      font-family: monospace;
      font-size: 12px;
      background: #050811;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--border);
      word-break: break-all;
      color: #cbd5e1;
    }
    button {
      cursor: pointer;
      border: none;
      border-radius: 8px;
      padding: 11px 14px;
      font-weight: 600;
      font-size: 13px;
      transition: all 0.15s;
      color: #fff;
    }
    .btn-evm { background: var(--blue); }
    .btn-evm:hover { background: #2563eb; }
    .btn-linea { background: #0284c7; }
    .btn-sol { background: var(--purple); }
    .btn-sol:hover { background: #7c3aed; }
    .btn-ln { background: var(--accent); color: #000; }
    input {
      background: #050811;
      border: 1px solid var(--border);
      color: var(--text);
      padding: 9px 12px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      width: 100%;
    }
    pre {
      background: #050811;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      font-size: 12.5px;
      overflow-x: auto;
      color: #a7f3d0;
      min-height: 180px;
      white-space: pre-wrap;
    }
    .status { font-size: 13px; color: #fbbf24; margin-bottom: 10px; font-weight: 500; }
  </style>
</head>
<body>
  <h1>⚡🌐 SovRoute 4-Rail (Quad-Rail) Canlı Cüzdan Test Konsolu</h1>
  <p class="sub">Hedef Uç: <code>GET /v1/omni/btc/mempool</code> (Bitcoin Core v31.1 Canlı Mempool Entropisi) — Gerçek On-Chain RPC Doğrulaması Aktif</p>

  <div class="grid">
    <!-- RAIL 2 & 4: MetaMask EVM -->
    <div class="card">
      <span class="badge b-evm">Ray 2 & 4 • MetaMask EVM (Base / Linea ETH)</span>
      <h3>🦊 MetaMask ile Gerçek On-Chain Öde</h3>
      <p style="font-size:12.5px;color:var(--muted);">
        MetaMask cüzdanınızdan (<code>0xB30DeD...F30fa</code>) kasamıza <strong>0.0000004 ETH (~$0.001)</strong> gönderir ve gerçek blokzincir RPC'si üzerinden doğrulayarak veriyi açar.
      </p>
      <div class="addr">Kasa: ${BASE_PAY_TO_ADDRESS}</div>
      <button class="btn-evm" onclick="payWithMetaMask('0x2105', 'eip155:8453', 'Base Mainnet')">
        🔵 Base ETH ile Öde & Doğrula (~$0.001)
      </button>
      <button class="btn-linea" onclick="payWithMetaMask('0xe708', 'eip155:59144', 'Linea Mainnet')">
        ⚫ Linea ETH ile Öde & Doğrula (~$0.001)
      </button>
    </div>

    <!-- RAIL 3: Solana Mainnet -->
    <div class="card">
      <span class="badge b-sol">Ray 3 • Solana Mainnet (SOL / USDC)</span>
      <h3>🟣 Solana Cüzdanı ile Doğrula</h3>
      <p style="font-size:12.5px;color:var(--muted);">
        Solana cüzdanınızın (<code>${SOLANA_PAY_TO_ADDRESS.slice(0, 10)}...</code>) gerçek Solana Mainnet RPC üzerindeki onaylı işlem imzasını (<code>txSignature</code>) doğrular.
      </p>
      <div class="addr">Solana Kasa: ${SOLANA_PAY_TO_ADDRESS}</div>
      <button class="btn-sol" onclick="verifyLatestSolanaTx()">
        🟣 Cüzdanımın Son On-Chain Solana İşlemiyle Doğrula
      </button>
      <input id="solSigInput" placeholder="Veya Solana Tx Signature yapıştırın..." />
      <button style="background:#334155;" onclick="verifyCustomSolanaSig()">
        İmzayı Solana Mainnet RPC'de Doğrula
      </button>
    </div>

    <!-- RAIL 1: Lightning L402 -->
    <div class="card">
      <span class="badge b-ln">Ray 1 • Bitcoin Lightning (L402)</span>
      <h3>⚡ 402 Challenge & BOLT-11 Fatura</h3>
      <p style="font-size:12.5px;color:var(--muted);">
        <code>/v1/omni/btc/mempool</code> ucuna ödemesiz istek atarak dönen canlı 4-Raylı HTTP 402 yanıtını ve Phoenixd Lightning faturasını inceler.
      </p>
      <button class="btn-ln" onclick="trigger402Challenge()">
        ⚡ 4-Raylı HTTP 402 Yanıtını Getir
      </button>
    </div>
  </div>

  <div class="status" id="statusBox">Hazır — Yukarıdaki cüzdan butonlarından birine tıklayın.</div>
  <pre id="outputBox">// Canlı RPC ve Bitcoin Core v31.1 yanıtı burada görünecek...</pre>

  <script>
    const PAY_TO_EVM = "${BASE_PAY_TO_ADDRESS}";
    const PAY_TO_SOL = "${SOLANA_PAY_TO_ADDRESS}";

    function setStatus(msg) {
      document.getElementById('statusBox').textContent = msg;
    }
    function setOutput(obj) {
      document.getElementById('outputBox').textContent =
        typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    }

    async function trigger402Challenge() {
      setStatus('⏳ /v1/omni/btc/mempool çağrılıyor (Ödemesiz -> 402 Challenge)...');
      const res = await fetch('/v1/omni/btc/mempool');
      const data = await res.json();
      setStatus('✅ HTTP ' + res.status + ' — 4 Ödeme Rayı (Lightning, Base, Solana, Multi-EVM) Döndü!');
      setOutput(data);
    }

    async function payWithMetaMask(hexChainId, caipChainId, chainName) {
      if (!window.ethereum) {
        setStatus('❌ MetaMask bulunamadı! Lütfen bu sayfayı MetaMask kurulu tarayıcıda açın.');
        return;
      }
      try {
        setStatus('🦊 MetaMask bağlanıyor (' + chainName + ')...');
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const from = accounts[0];

        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: hexChainId }],
        });

        setStatus('✍️ MetaMask üzerinden 0.0000004 ETH (~$0.001) işlemi onaylayın...');
        // 400000000000 wei = 0x5d21dba000 (400 Gwei ~ $0.001)
        const txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            from,
            to: PAY_TO_EVM,
            value: '0x5d21dba000',
          }],
        });

        setStatus('⛓️ İşlem gönderildi (' + txHash.slice(0, 14) + '...). Blok onayı için 4 saniye bekleniyor...');
        setOutput({ step: 'ONCHAIN_TX_BROADCASTED', chain: chainName, txHash, from, to: PAY_TO_EVM });

        for (let attempt = 1; attempt <= 6; attempt++) {
          await new Promise(r => setTimeout(r, 3500));
          setStatus('🔍 Sunucu ' + chainName + ' RPC üzerinden işlemi doğruluyor (Deneme ' + attempt + '/6)...');

          const headerPayload = btoa(JSON.stringify({
            network: caipChainId,
            verifyOnChain: true,
            txHash,
          }));

          const apiRes = await fetch('/v1/omni/btc/mempool', {
            headers: { 'X-EVM-Payment': headerPayload },
          });
          const apiData = await apiRes.json();

          if (apiRes.status === 200) {
            setStatus('🎉 BAŞARILI! Gerçek ' + chainName + ' işlemi doğrulandı ve Bitcoin Core v31.1 verisi açıldı!');
            setOutput({
              onChainTxHash: txHash,
              verifiedPaymentRail: apiRes.headers.get('x-payment-rail'),
              response: apiData,
            });
            return;
          }
        }
        setStatus('⚠️ İşlem henüz RPC düğümüne yayılmadı, birkaç saniye sonra tekrar deneyin.');
      } catch (err) {
        setStatus('❌ Hata: ' + (err.message || String(err)));
      }
    }

    async function verifyLatestSolanaTx() {
      try {
        setStatus('🔍 Solana Mainnet RPC üzerinden ' + PAY_TO_SOL.slice(0, 10) + '... cüzdanının son işlemi sorgulanıyor...');
        const latestRes = await fetch('/v1/omni/solana-latest-tx');
        const latestData = await latestRes.json();
        if (!latestData.signature) {
          setStatus('❌ Cüzdanda onaylı Solana işlemi bulunamadı: ' + (latestData.error || ''));
          setOutput(latestData);
          return;
        }
        document.getElementById('solSigInput').value = latestData.signature;
        await submitSolanaSig(latestData.signature);
      } catch (err) {
        setStatus('❌ Hata: ' + err.message);
      }
    }

    async function verifyCustomSolanaSig() {
      const sig = document.getElementById('solSigInput').value.trim();
      if (!sig) {
        setStatus('❌ Lütfen bir Solana işlem imzası (txSignature) girin.');
        return;
      }
      await submitSolanaSig(sig);
    }

    async function submitSolanaSig(signature) {
      setStatus('🟣 Solana Mainnet RPC üzerinde txSignature doğrulanıyor (' + signature.slice(0, 14) + '...)...');
      const headerPayload = btoa(JSON.stringify({
        network: 'solana:mainnet',
        verifyOnChain: true,
        to: PAY_TO_SOL,
        signature,
      }));

      const res = await fetch('/v1/omni/btc/mempool', {
        headers: { 'X-Solana-Payment': headerPayload },
      });
      const data = await res.json();
      if (res.status === 200) {
        setStatus('🎉 BAŞARILI! Gerçek Solana Mainnet işlemi doğrulandı ve Bitcoin Core v31.1 verisi açıldı!');
      } else {
        setStatus('⚠️ Doğrulama yanıtı (HTTP ' + res.status + '): ' + (data.details || data.error));
      }
      setOutput({
        solanaTxSignature: signature,
        verifiedPaymentRail: res.headers.get('x-payment-rail'),
        httpStatus: res.status,
        response: data,
      });
    }
  </script>
</body>
</html>`;
}
