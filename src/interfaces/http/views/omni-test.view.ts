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
      <span class="badge b-evm">Ray 2 & 4 • MetaMask EVM (Base & Arbitrum ETH)</span>
      <h3>🦊 MetaMask ile Gerçek On-Chain Öde</h3>
      <p style="font-size:12.5px;color:var(--muted);">
        MetaMask cüzdanınızdan (<code>0xB30DeD...F30fa</code>) kasamıza <strong>0.0000004 ETH (~$0.001)</strong> gönderir ve gerçek blokzincir RPC'si üzerinden doğrulayarak veriyi açar.
      </p>
      <div class="addr">Kasa: ${BASE_PAY_TO_ADDRESS}</div>
      <button class="btn-evm" onclick="payWithMetaMask('0x2105', 'eip155:8453', 'Base Mainnet')">
        🔵 Base ETH ile Öde & Doğrula (~$0.001)
      </button>
      <button class="btn-linea" onclick="payWithMetaMask('0xa4b1', 'eip155:42161', 'Arbitrum One')">
        🔷 Arbitrum One ETH ile Öde & Doğrula (~$0.001)
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

    <!-- X402 BASE USDC: Forensics Endpoints via MetaMask EIP-3009 -->
    <div class="card">
      <span class="badge b-evm">x402 Base USDC • MetaMask EIP-3009 (0 Gas)</span>
      <h3>💵 Base USDC ile 3 Adli Bilişim Ucunu Test Et</h3>
      <p style="font-size:12.5px;color:var(--muted);">
        MetaMask üzerinden Base Mainnet USDC (<code>TransferWithAuthorization</code>) imzalayarak <code>rbf-shield</code> ($0.005), <code>next-block-xray</code> ($0.003) ve <code>simulate-tx</code> ($0.005) uçlarını gerçek kripto ile test eder.
      </p>
      <div class="addr">USDC Kasa: ${BASE_PAY_TO_ADDRESS}</div>
      <button class="btn-evm" onclick="payBaseUsdcX402('rbf-shield', '5000')">
        🛡️ rbf-shield ($0.005 Base USDC)
      </button>
      <button class="btn-evm" onclick="payBaseUsdcX402('next-block-xray', '3000')">
        🩻 next-block-xray ($0.003 Base USDC)
      </button>
      <button class="btn-evm" onclick="payBaseUsdcX402('simulate-tx', '5000')">
        🧪 simulate-tx ($0.005 Base USDC)
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

    async function payBaseUsdcX402(endpoint, amountAtomic) {
      if (!window.ethereum) {
        setStatus('❌ MetaMask bulunamadı! Lütfen bu sayfayı MetaMask kurulu tarayıcıda açın.');
        return;
      }
      try {
        setStatus('🦊 [1/4] MetaMask hesap izni kontrol ediliyor...');
        let accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (!accounts || !accounts.length) {
          accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        }
        const from = accounts[0];

        const currentChain = await window.ethereum.request({ method: 'eth_chainId' });
        if (currentChain !== '0x2105') {
          setStatus('🦊 [2/4] Base Mainnet (0x2105) ağına geçiliyor...');
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x2105' }],
          });
        }

        let targetUrl = '/v1/chain/btc/' + endpoint;
        let fetchOpts = { method: 'GET', headers: {} };

        if (endpoint === 'rbf-shield' || endpoint === 'simulate-tx') {
          setStatus('📡 Canlı Bitcoin mempool işlemi alınıyor...');
          const recentRes = await fetch('https://mempool.space/api/mempool/recent');
          const recent = await recentRes.json();
          const liveTxid = recent[0].txid;
          if (endpoint === 'rbf-shield') {
            targetUrl = '/v1/chain/btc/rbf-shield/' + liveTxid;
          } else {
            const hexRes = await fetch('https://mempool.space/api/tx/' + liveTxid + '/hex');
            const rawTxHex = await hexRes.text();
            fetchOpts.method = 'POST';
            fetchOpts.headers['Content-Type'] = 'application/json';
            fetchOpts.body = JSON.stringify({ rawTxHex });
          }
        }

        const randBytes = new Uint8Array(32);
        crypto.getRandomValues(randBytes);
        const nonce = '0x' + Array.from(randBytes, b => b.toString(16).padStart(2, '0')).join('');
        const validBefore = String(Math.floor(Date.now() / 1000) + 300);

        const message = {
          from,
          to: PAY_TO_EVM,
          value: amountAtomic,
          validAfter: '0',
          validBefore,
          nonce,
        };

        const typedData = {
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
              { name: 'chainId', type: 'uint256' },
              { name: 'verifyingContract', type: 'address' },
            ],
            TransferWithAuthorization: [
              { name: 'from', type: 'address' },
              { name: 'to', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'validAfter', type: 'uint256' },
              { name: 'validBefore', type: 'uint256' },
              { name: 'nonce', type: 'bytes32' },
            ],
          },
          primaryType: 'TransferWithAuthorization',
          domain: {
            name: 'USD Coin',
            version: '2',
            chainId: 8453,
            verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          },
          message,
        };

        setStatus('✍️ MetaMask üzerinden $' + (Number(amountAtomic) / 1e6).toFixed(3) + ' Base USDC (EIP-3009) imzalayın...');
        const signature = await window.ethereum.request({
          method: 'eth_signTypedData_v4',
          params: [from, JSON.stringify(typedData)],
        });

        const x402Payload = {
          x402Version: 2,
          scheme: 'exact',
          network: 'eip155:8453',
          payer: from,
          payload: { authorization: message, signature },
        };

        fetchOpts.headers['Payment-Signature'] = btoa(JSON.stringify(x402Payload));
        setStatus('🚀 ' + targetUrl + ' ucuna Base USDC imzasıyla istek gönderiliyor...');
        const res = await fetch(targetUrl, fetchOpts);
        const data = await res.json();

        if (res.status === 200) {
          setStatus('🎉 BAŞARILI! Base USDC (x402 EIP-3009) ile ' + endpoint + ' verisi açıldı!');
        } else {
          setStatus('⚠️ HTTP ' + res.status + ': ' + (data.details || data.error || 'Hata'));
        }
        setOutput({
          endpoint: targetUrl,
          payer: from,
          payTo: PAY_TO_EVM,
          amountUsdc: '$' + (Number(amountAtomic) / 1e6).toFixed(3),
          httpStatus: res.status,
          paymentResponse: res.headers.get('payment-response'),
          response: data,
        });
      } catch (err) {
        setStatus('❌ Hata: ' + (err.message || String(err)));
      }
    }
  </script>
</body>
</html>`;
}
