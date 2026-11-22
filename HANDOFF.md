# 🚀 SOVEREIGN NODE ENGINE — DEVİR TESLİM VE STRATEJİK YOL HARİTASI (HANDOFF)

> 🧭 **PROJE SINIRI (KARIŞTIRMA — 22 KASIM 2026 GÜNCELLEMESİ):**
> - **Bu repo (`C:\dev\sovereign-node-engine` / Hetzner `/srv/sovereign-node-engine`):** Bare-metal arka uç motorudur (`https://node.sovroute.com` — Bitcoin Core v31.1, LND v0.21.3, Phoenixd, ONNX EVM ML, EIP-7702, 4-borsa Market Oracles, Remote `/mcp`, `/crewai-status` ve `CORE_BRIDGE_KEY` korumalı `/internal/core/*`). `REDIRECT_HTML_TO_URL=https://sovroute.com/` ayarlı olduğu için yalnızca tarayıcı `Accept: text/html` kök isteklerini `https://sovroute.com/` adresine 302 yönlendirir; tüm JSON/API/MCP uçları burada aynen çalışır.
> - **Birleşik Vitrin & Edge Gateway (`https://sovroute.com`):** Artık **`C:\dev\route402`** monoreposu tarafından Cloudflare Worker `green-block-2664` üzerinden sunulmaktadır (eski `C:\dev\sovroute` statik vitrin/worker devralındı; `C:\dev\sovroute` içinde yalnızca legacy swap çekirdeği/arşivi durur). Ekosistemin tamamı için bkz: [ECOSYSTEM_MASTER_MAP.md](file:///C:/dev/sovroute/ECOSYSTEM_MASTER_MAP.md).
> - ⚠️ **Hetzner Senkron Uyarısı:** Sunucuda `/srv/sovereign-node-engine/data/mempool-history.jsonl`, `.env` ve ek dosyalar canlı olarak birikmektedir; deploy yaparken sunucu klasörünü kaba kopyalamayla ezme, yalnızca hedef kaynak dosyalarını aktar. (22 Kasım 2026 Faz 2 yedeği sunucuda `/var/backups/sne-phase2-backup-20261122.tar.gz` altındadır.)

**Son Güncelleme:** 22 Kasım 2026 19:45 TSİ — İç çıplak metal köprüsü (`/internal/core/*` — `btc-fees`, `btc-tip`, `lightning-stats`) + `REDIRECT_HTML_TO_URL` canlıya (`100.95.119.88:3088`) alındı; `sovroute.com` birleşik Cloudflare vitrini (`green-block-2664`) bu köprüye bağlandı. (Yerel `80/80` test yeşil, sunucuda `3/3` köprü testi yeşil.)  
**Yerel Proje Dizini:** `C:\Users\faruk\Desktop\dev\sovereign-node-engine`  
**Canlı Sunucu Dizini:** `/srv/sovereign-node-engine` (`100.95.119.88:3088` - Tailscale)  
**Canlı Ağ Geçidi:** `https://node.sovroute.com`  
**Resmi MCP Paketi (npm):** `https://www.npmjs.com/package/@aipp/sovereign-node-mcp` (`npx -y @aipp/sovereign-node-mcp`)  
**Özel Git Deposu (Gitea):** `http://100.95.119.88:3030/aipp/sovereign-node-engine`  
**Ajan Entegrasyon Repoları:**
* CrewAI (Python): `https://github.com/sovroutecore/sovroute-crewai-guardrail`
* LangChain / LangGraph (Python): `https://github.com/sovroutecore/sovroute-langchain-guardrail`
* OpenAI Agents SDK (Python): `https://github.com/sovroutecore/sovroute-openai-agents-guardrail`
* Vercel AI SDK (TypeScript / Next.js): `https://github.com/sovroutecore/sovroute-vercel-ai-guardrail`
* x402 Bazaar Manifesti: `https://node.sovroute.com/.well-known/x402.json`

---

## 1. Pazar Analizi & TaskFuel Rekabet İstihbaratı (152 Uç Nokta İncelemesi)

TaskFuel kataloğundaki *"Crypto & Prediction Markets -> Read the Blockchain"* kategorisinde yer alan 152 uç nokta ve 6 sağlayıcı (Glassnode, OneSource, Otto AI, 2s, BlockRun, SovRoute) detaylı olarak analiz edilmiştir:

1. **Aşırı Ethereum/Base Yoğunlaşması:** OneSource ve Otto AI neredeyse tamamen EVM/Base odaklıdır (`eth_*`, ERC-20, ENS, gas oracle). Bitcoin tarafında yoklar.
2. **Aşırı Yüksek Fiyatlandırma:** Glassnode makro metrikler için çağrı başına **5¢ ($0.05)** talep etmektedir.
3. **Yüzeysel ve Pahalı Bitcoin Verisi (2s.io):**
   * Listede Bitcoin'e dokunan tek sağlayıcı olan `2s.io`, çağrı başına **0.25¢ - 0.36¢** ücret almaktadır ve kendi bare-metal düğümleri yerine halka açık üçüncü parti API'leri sarmalamaktadır.
4. **Büyük Ödeme Rayı Açığı (Piyasanın Kör Noktası):**
   * TaskFuel'deki sağlayıcıların tamamı **yalnızca Base USDC (x402)** kabul etmektedir.
   * TaskFuel'in kurucusu **Moritz Kaminski (Alby ekibi)** olmasına rağmen, ekosistemde **Native Lightning Network (L402 Satoshis)** veya **Solana / Multi-EVM** ile aynı anda ödeme kabul eden sağlayıcı yoktur!

---

## 2. Tamamlanan Geliştirmeler ve Doğrulamalar (7 Kasım 2026 İtibarıyla %100 Hazır)

* [x] **Mevcut `sovroute.com` Güvencesi:** TaskFuel'de aktif olan 3 ana `sovroute.com` ucuna (`/v1/chain/btc/fees`, `/v1/chain/btc/tip`, `/v1/chain/lightning/stats`) **sıfır müdahale** yapıldı; kesintisiz çalışıyor.
* [x] **Bare-Metal RPC & Önbellek (`sovereign-bitcoind` v31.1):** `estimatesmartfee`, `getmempoolentry`, `getmempoolinfo`, `getrawmempool`, `gettxout` (UTXO onay kontrolü) ve `getblockchaininfo` `0.04ms` in-memory önbellek ile bağlandı.
* [x] **Ödeme Öncesi TXID Doğrulaması:** `/v1/chain/btc/rbf-shield/:txid` ucunda `validateTxidParam` middleware'i L402/x402 ödeme katmanının **önüne** alındı; hatalı `txid` gönderildiğinde fatura kesilmeden doğrudan `400 Bad Request` dönüyor.
* [x] **UTXO Onay Tespiti & Ata Zinciri (Ancestor) Analizi:** `checkRbfShield` artık mempool'daki aktif işlemlerde ata paketi ücret oranını (`ancestorFeeRate`) ve zincir derinliğini (`ancestorCount`) hesaplıyor; mempool'da olmayan işlemlerde ise doğrudan UTXO setini (`gettxout`) sorgulayarak blokta onaylanmış işlemleri `SAFE` (`CONFIRMED: X confirmations`) olarak raporluyor.
* [x] **Çift Raylı (Dual-Rail: L402 Lightning + x402 Base USDC) Prodüksiyon Uçları:**
  * `GET https://node.sovroute.com/v1/chain/btc/rbf-shield/:txid` (`5 sats` L402 / `$0.005` Base USDC)
  * `GET https://node.sovroute.com/v1/chain/btc/mempool` (`2 sats` L402 / `$0.002` Base USDC)
  * `GET https://node.sovroute.com/v1/chain/btc/fees` (`1 sat` L402 / `$0.001` Base USDC)
  * `GET https://node.sovroute.com/v1/chain/btc/block` (`1 sat` L402 / `$0.001` Base USDC)
* [x] **Keşif ve Entegrasyon Şemaları (`node.sovroute.com`):**
  * `https://node.sovroute.com/llms.txt` (`200 OK`)
  * `https://node.sovroute.com/openapi.json` (`200 OK` — TaskFuel `x-payment-info` uyumlu OpenAPI 3.1.0)
  * `https://node.sovroute.com/mcp-config.json` (`200 OK` — Tek tıkla Claude / Cursor MCP yapılandırması)
* [x] **İzole 4 Raylı (Quad-Rail / Omni-Rail) Ağ Geçidi (`/v1/omni/*`) & Gerçek Cüzdan On-Chain Kanıtları:**
  * TaskFuel prodüksiyon uçlarından tamamen izole olarak aynı HTTP 402 yanıtında **1. Lightning (`L402`)**, **2. Base (`USDC/ETH`)**, **3. Solana (`SPL USDC` & `Native SOL`)** ve **4. Multi-EVM (`Linea`, `Arbitrum`, `Optimism`, `Polygon`, `Ethereum Mainnet`)** kabul eden `/v1/omni/*` uçları canlıya alındı.
  * **Gerçek Solana Mainnet Doğrulaması (`RAIL-3:SOLANA-MAINNET-ONCHAIN-VERIFIED`):**
    * Cüzdan: `J7gD37zihrYnq7gcMU3ywTFP1G5UAU9SfSNpxfQBKFs7`
    * On-Chain TX Signature: `3kKeJHwEQFrboxvj77McYympoLSFrtC82ZSftMwbfgrDZ8Qda3v4rzCGxQ5bXch36UPuFaL8ZFZ4t54zejUhHmuo` (Slot: `466246092`)
    * Replay Koruması: İkinci denemede `402 Solana Replay Rejected` ile başarıyla engellendi.
  * **Gerçek MetaMask Base & Arbitrum One Doğrulaması (`RAIL-4:EVM-*-ONCHAIN-VERIFIED`):**
    * Gönderen (`Proofwax`): `0xb30ded1b7bc90e459a9820aaaf0297165e9f30fa` → Alıcı (`SovRoute Kasa`): `0x488cbDad29E60d8Bae53FFF4c4252C9711dF9784`
    * Base On-Chain TX #1: `0x8d31cacd2b77722ce841ecc1514ec96a5b1c410689c84c6d86cd0bb20220240a` (Base Block: `54408092`)
    * Base On-Chain TX #2: `0xc24d1d54976e89c835130a2aa296552894abfb4b2e79936bc712609145d5e757` (Base Block: `54408304`)
    * Arbitrum One On-Chain TX #1: `0xe0e2589c1cbb85d6b4281a0e23273ea18a018b9e1c52618da896cf16c1249c86` (Arbitrum Block: `522144979`, Tutar: `400 Gwei`)
    * Arbitrum One On-Chain TX #2: `0xc8c0338954f2117ac26f0c18f9b3037778b19d83ecdc8e57e5ab36bb442fe331` (Arbitrum Block: `522145096`, Tutar: `400 Gwei`)
* [x] **Paradigma Değiştiren 3 Yeni Uç Nokta (%0 P2P Yayın Riski ile):**
  * `GET /v1/chain/btc/next-block-xray` (ve `/v1/omni/btc/next-block-xray`): Canlı madenci aday blok şablonu röntgeni (`getblocktemplate`). Sıradaki bloğa girecek ~3,800 işlemin tam listesini, taban kesim ücretini (`cutoffFeeRateSatPerVb`), blok doluluk oranını ve sorgulanan herhangi bir `?txid=` / `:txid` işleminin blok içindeki tam sırasını (`rankInBlock`, `GUARANTEED_NEXT_BLOCK` / `QUEUED_FOR_LATER_BLOCK`) döner.
  * `POST /v1/chain/btc/simulate-tx` (ve `/v1/omni/btc/simulate-tx`): Sıfır-Yayın (Zero-Broadcast) Konsensüs & Script Simülatörü (`testmempoolaccept` + `decoderawtransaction`). İmzalı ham Bitcoin işlemini (`rawTxHex`) P2P ağına **hiç yayınlamadan** (`broadcastedToNetwork: false`) Bitcoin Core v31.1 UTXO seti üzerinde test eder.
  * `POST /v1/omni/pay-lightning`: SUB-LIG Cüzdansız Cross-Chain Lightning Köprüsü. Sadece Solana (`SOL`/`USDC`) veya EVM (`Base`/`Arbitrum`) cüzdanı olan ajanların ödemesini alıp `<= 25 sats` tutarındaki herhangi bir BOLT-11 faturasını `PhoenixdPayerAdapter` ile anında öder ve kriptografik `paymentPreimage` kanıtını döner.
* [x] **Tüm Testler Yeşil:** 19 otomatik testin 19'u da (`tests/live-node.test.ts`, `tests/omni-rail.test.ts`, `tests/l402.test.ts`, `tests/htlc.test.ts`, `tests/mcp-server.test.ts`) canlı düğüm üzerinde %100 başarıyla geçti.

---

## 3. 📅 15 KASIM 2026: TaskFuel / Moritz Kaminski İletişimi (✅ GÖNDERİLDİ & TESLİM EDİLDİ)

**Gönderim Zamanı:** 15 Kasım 2026 23:42 TSİ (20:42 UTC)  
**Kanal:** Resend API (`sovroute.com` doğrulanmış alan adı)  
**Resend Mesaj ID:** `01a1e0f2-1d05-7e0c-974a-41c83108a947`  
**Durum:** `delivered` (Doğrudan `moritz@taskfuel.ai` gelen kutusuna ulaştı)  
**Konu:** `Re: SovRoute & TaskFuel — Following up from X / Endpoints`  

### Gönderilen Kesin Metin:
```text
Hi Moritz,

Following up on our initial endpoints — wanted to share a brand new set of endpoints we just launched on the engine.

I mostly use Lightning wallets with my own agents since it feels the most natural for autonomous micropayments. But seeing that pretty much all endpoints on TaskFuel are in USDC, I built our latest batch of endpoints as Dual-Rail (supporting both Base USDC and Lightning). That way, whichever rail an agent holds, it can settle seamlessly.

To complement our existing "Read the blockchain" listings, we added 3 brand new "Bitcoin Forensics" endpoints designed to protect autonomous agents from stuck txs, fee burning, and double-spends:

1. 0-Conf RBF Fraud Shield (/v1/chain/btc/rbf-shield/{txid} — $0.005 USDC / 5 sats)
Scans unconfirmed transactions directly against our bare-metal Bitcoin Core v31.1 mempool and UTXO set for BIP-125 replaceability, double-spend conflicts, and ancestor depth. Lets agents accept 0-conf payments safely.

2. Next-Block Miner Template X-Ray (/v1/chain/btc/next-block-xray — $0.003 USDC / 3 sats)
Inspects the live block template miners are actively building (getblocktemplate). Tells the agent whether its transaction is guaranteed in the very next block (GUARANTEED_NEXT_BLOCK) or queued for later.

3. Zero-Broadcast Consensus Simulator (/v1/chain/btc/simulate-tx — $0.005 USDC / 5 sats)
Dry-runs script execution and consensus rules against the live UTXO set (testmempoolaccept) without broadcasting to the P2P network. Prevents agents from broadcasting invalid transactions and losing fees.

Everything is served directly from bare-metal Bitcoin Core v31.1 with ~0.04ms in-memory cache latency. The machine-readable spec is live at: https://node.sovroute.com/openapi.json

If you'd like to feature them, these endpoints are live and completely ready to be added under our catalog. I'm here if you need anything from my side or want to run any test calls.

Best,
Faruk
```

---

## 4. Gece / Hafta Sonu Pasif Mod Komutları (İsteğe Bağlı)

* **Pasife Alma (Kapatma):**
  `ssh root@100.95.119.88 "mv /etc/dokploy/traefik/dynamic/node-sovroute.yml /etc/dokploy/traefik/dynamic/node-sovroute.yml.disabled"`
* **Aktife Alma (Açma):**
  `ssh root@100.95.119.88 "mv /etc/dokploy/traefik/dynamic/node-sovroute.yml.disabled /etc/dokploy/traefik/dynamic/node-sovroute.yml"`

---

## 5. ✅ 12 KASIM 2026 TAMAMLANAN RED-TEAM TESTLERİ, GÜVENLİK YAMALARI & YARINKİ ADIMLAR

### Tamamlananlar (`e927e45` — `origin/main` güncel & `node.sovroute.com` canlı):
* [x] **Red-Team & Sert Stres Test Paketi (`tests/red-team-stress.test.ts` — 6/6, Toplam 25/25 Yeşil):**
  * **1A Underpayment & Wrong Recipient:** Base/Arbitrum/Solana/x402 eksik tutar ve yanlış alıcı saldırıları `402` ile reddedildi.
  * **1B 50x Paralel On-Chain Replay:** Gerçek Base Mainnet TX (`0x8d31cacd...`) ile 50 paralel istek → **1x `200 OK`, 49x `402 Replay Rejected`**.
  * **1C Macaroon HMAC & Price Downgrade:** `verifyL402Macaroon` (`timingSafeEqual` + `expires_at` + endpoint `price_sats` kontrolü) ile caveat manipülasyonu ve 1 sat macaroon'un 5 sat uçta kullanımı engellendi.
  * **2 SUB-LIG Köprü Koruması:** `> 25 sats`, amountless, testnet (`lntb...`) ve bozuk faturalar ödeme öncesi `400 Bad Request` ile kesildi.
  * **3 `simulate-tx` Fuzzing & Enjeksiyon:** Shell enjeksiyonu ve bozuk hex girdileri `400` ile kesildi; olmayan UTXO `consensusAllowed: false` (`missing-inputs`, `broadcastedToNetwork: false`) döndü.
  * **4 & 5 Canlı Mempool & 100x Yük Benchmark:** 100 paralel istek **`97.86ms`** (`0.98ms/istek`, `%0` 5xx).
* [x] **OpenAPI 3.1 & Canlı Ağ Geçidi:** `openapi-spec.view.ts` ayrıştırıldı; `/v1/chain/btc/next-block-xray` ve `/v1/chain/btc/simulate-tx` eklendi. `live-node.test.ts` 0-fee CPFP parent durumuna göre güncellendi. Sunucuda `sovereign-node-engine.service` yeniden başlatıldı ve `node-sovroute.yml` aktife alındı (`https://node.sovroute.com` → `200 OK`).

### ✅ 14 Kasım 2026 Tamamlananlar (Ödeme Sonrası 500 Hata Telafisi — Canlıya Alındı):
* [x] **Ödeme Sonrası Hata Telafisi (`retry-voucher.helper.ts`, `l402.middleware.ts`, `omni-rail.middleware.ts`):**
  * **Katman 1 (Idempotent Nonce / Proof Recovery):** Ödeme (x402 Base USDC, Solana veya Multi-EVM) doğrulandıktan sonra RPC/sunucu `>= 500` dönerse, `replayKey` 1 saatlik telafi havuzuna (`unfulfilledPayments`) alınır. İstemci aynı ödeme başlığını tekrar gönderdiğinde harici `/settle` tekrar çağrılmadan imza doğrulanıp istek ücretsiz karşılanır ve `200 OK` sonrası kalıcı olarak tüketilir.
  * **Katman 2 (`X-Payment-Retry-Voucher`):** Ödeme sonrası `>= 500` yanıtlarına HMAC-SHA256 imzalı tek kullanımlık `X-Payment-Retry-Voucher` header'ı ve `paymentProtected: true` / `retryVoucher` JSON alanları eklenir; ajan `<= priceSats` bir uçta tek seferlik telafi hakkını kullanabilir.
  * **Anti-Double-Dip Kilidi:** Aynı `replayKey` ve `voucherId` tek bir kilit altında birleştirildi (`RED-TEAM 6` doğrulandı).
* [x] **Derin Güvenlik Sertleştirmesi & Genişletilmiş Saldırı Paketi (`tests/security-attack-suite.test.ts` — 8/8, Toplam 34/34 Yeşil):**
  * **Split-Hash & Split-ID Koruması:** `macaroon.helper.ts`, `l402.service.ts` ve `retry-voucher.helper.ts` içinde `paymentHash` ve `voucherId` alanlarının imzalı `caveat` ile birebir eşleşmesi zorunlu kılındı (`SEC-ATTACK 1 & 8`).
  * **`BigInt` Crash / Null-JSON / Bozuk `X-Solana-Payment` DoS Koruması:** `parseSafeUintBigInt` ile geçersiz sayısal girdiler ve `null`/`[]`/ilkel JSON başlıkları (bozuk `X-Solana-Payment` ile fatura oluşturma DoS'u dahil) ödeme öncesi/içi `402` ile kesildi (`SEC-ATTACK 2`).
  * **Query & Path Parameter Pollution Koruması:** `node-truth.controller.ts` ve `omni-rail.controller.ts` içinde `?txid[toString]=1`, `?txid[]=...` gibi nesne/dizi enjeksiyonları `400` ile ödeme öncesi engellendi (`SEC-ATTACK 3`).
  * **50x Paralel EIP-3009 & Hibrit Telafi Yarışı + Kademeli 500 Testleri:** `inFlightX402Nonces` kilidiyle 50x EIP-3009 yarışında **1x `200`, 49x `402`**, 50x hibrit (`25x Voucher + 25x Header`) yarışında **1x `200`, 49x `402`**, kademeli 500 (`500 → Voucher 500 → 200 → Replay 402`) ve sahte imza/alıcı/tutar spoofing testleri başarıyla geçti (`SEC-ATTACK 4–7`).
* [x] **Kapsamlı Senaryo & Edge-Case Sertleştirmesi (Batch 2 & 3 — `tests/exhaustive-scenarios.test.ts` + `tests/final-edge-cases.test.ts`, Toplam 42/42 Yeşil):**
  * **EVM On-Chain Self-Transfer Yaması:** `omni-rail.middleware.ts` içindeki `verifyEvmOnChainTx` fonksiyonundan `&& toAddr !== fromAddr` istisnası kaldırılarak saldırganın kendisine ETH gönderip (`to === from`) ödeme bypass'ı yapması kalıcı olarak engellendi (`SCENARIO 3`).
  * **`/v1/omni/*` L402 Tek-Kullanım Anti-Replay Kilidi:** `omni-rail.middleware.ts` `RAIL-1` dalına `consumedProofSet` & `inFlightProofSet` tek-kullanım koruması (500 hata telafi kurtarması ile uyumlu) eklenerek `/v1/omni/pay-lightning` köprüsünde aynı L402 başlığının tekrar kullanımı kapatıldı (`FINAL-EDGE 1`).
  * **Bellek Şişmesi Koruması (`MAX_TRACKED_ENTRIES = 10_000`):** `retry-voucher.helper.ts`, `l402.middleware.ts` ve `omni-rail.middleware.ts` içindeki takip tablolarına süresi dolmuş kayıt budama (`setBoundedUnfulfilledPayment`) ve FIFO sınırlandırma (`addBoundedSetEntry`) eklendi (`FINAL-EDGE 2`).
  * **`AutonomousL402Agent` & Phoenixd/NWC Kapsamı:** `autonomous-agent-client.ts` ödeme sonrası `>= 500` yanıtında `X-Payment-Retry-Voucher` ile otomatik telafi yapacak şekilde güncellendi (`SCENARIO 5`); `PhoenixdGatewayAdapter`, `PhoenixdPayerAdapter` ve `NwcPayerAdapter` doğrudan birim testleriyle doğrulandı (`FINAL-EDGE 3`); `live-node.test.ts` canlı blok kazılma yarışına karşı 1 kez taze örnek yenileme direnci kazandı.
  * **Canlı Doğrulama:** `root@100.95.119.88:/srv/sovereign-node-engine` derlendi, `sovereign-node-engine.service` yeniden başlatıldı; `https://node.sovroute.com/health` (`200 OK`), `openapi.json` (`200`), `llms.txt` (`200`) ve canlı saldırı probları (`400`/`402`, `%0` 5xx) doğrulandı.

### 📅 15 KASIM 2026 PAZAR EYLEM DURUMU:
* [x] **Gerçek Kripto Canlı Doğrulaması (`node.sovroute.com` — 15 Kasım 2026):**
  * **RAY 1: Phoenixd Mainnet Lightning (L402 Satoshis):**
    * Düğüm: `100.95.119.88:9740` (Blok: `975997`, Bakiye: `15,417 sats`)
    * 1. `GET /v1/chain/btc/next-block-xray` (3 sats) → **1,661ms** (`200 OK`, Preimage: `5c3caf4cbcbd9511...`, Aday Blok: `975998`, 4,847 TX, Toplam Ücret: `1,179,540 sats`)
    * 2. `GET /v1/chain/btc/rbf-shield/:txid` (5 sats) → **1,591ms** (`200 OK`, Preimage: `d8baa2928b041c48...`, Mempool: `true`, BIP-125: `true`, Risk: `HIGH_RISK_RBF_ENABLED`, Ücret: `920.37 sat/vB`)
    * 3. `POST /v1/chain/btc/simulate-tx` (5 sats) → **1,680ms** (`200 OK`, Preimage: `9c484d19f87b85a7...`, Consensus: `Allowed`, Mempool: `true`, Broadcast: `%0 P2P`, Vsize: `141 vB`)
    * Toplam Harcanan: **12 sats**, Toplam İşlem Süresi: **4.9 saniye** (`scripts/verify-live-forensics-l402.ts`).
  * **RAY 2: Gerçek MetaMask Base USDC (x402 EIP-3009 Gasless TransferWithAuthorization):**
    * Payer: `0xb30ded1b7bc90e459a9820aaaf0297165e9f30fa` (Proofwax) → PayTo Kasa: `0x488cbDad29E60d8Bae53FFF4c4252C9711dF9784`
    * 1. `GET /v1/chain/btc/rbf-shield/1abeb730...` ($0.005 Base USDC / 5,000 atomic units) → **`200 OK`** (`Payment-Response` üretildi, `zeroConfRiskLevel: HIGH_RISK_RBF_ENABLED`, BIP-125: true, Fee Rate: 3 sat/vB).
    * 2. `GET /v1/chain/btc/next-block-xray` ($0.003 Base USDC / 3,000 atomic units) → **`200 OK`** (Aday Blok: `975998`, 3,488 TX, Toplam Ücret: `2,149,904 sats`, Doluluk: `%99.8`, Top Whale TX: `2,299.43 sat/vB`).
    * 3. `POST /v1/chain/btc/simulate-tx` ($0.005 Base USDC / 5,000 atomic units) → **`200 OK`** (TXID: `8fd011bc...`, `consensusAllowed: true`, `alreadyInMempool: true`, `broadcastedToNetwork: false`, Vsize: `1225 vB`).
    * **Sonuç:** Dual-Rail (L402 Lightning + x402 Base USDC) iki rayda da **gerçek cüzdanlar ve canlı Mainnet parasıyla %100 doğrulandı!**

* [x] **Satring.com Ajan Pazar Yeri Kaydı & Doğrulanmış Alan Adı (15 Kasım 2026):**
  * Phoenixd Lightning düğümümüz üzerinden `1,000 sats` L402 ücreti ödenerek servis Satring dizinine eklendi:
    * **Satring ID:** `1097` (Slug: `sovereign-node-engine`)
    * **Canlı Sayfa:** `https://satring.com/services/sovereign-node-engine`
    * **Protokoller:** `L402+x402` (Dual-Rail)
    * **Kategoriler:** `data` (ID: 2) & `finance` (ID: 3)
    * **Edit Token:** `rV7ZBZoaIVuqLFRrerITrJByl-Uoo167rm8TSXh0-vg`
  * **Alan Adı Doğrulaması (`domain_verified: true`):**
    * Challenge: `04e3f3cfac762dce67f536076ec25f7b3e1f03bfca92275991a6403a3712447f`
    * `https://node.sovroute.com/.well-known/satring-verify` ucuna yerleştirildi ve Satring tarafından doğrulanarak **"Domain Verified"** yeşil rozeti kazanıldı.

* [x] **Circle Agent Marketplace Resmi Listeleme Başvurusu Yapıldı (16 Kasım 2026):**
  * **Pazar Yeri:** Circle Agent Marketplace (`agents.circle.com/services`)
  * **Form:** Circle Agent Intake Form (Google Form) başarıyla gönderildi (`Yanıtınız kaydedildi`).
  * **Verilen Bilgiler:**
    * Kategori: `Infrastructure`
    * Uç Nokta Sayısı: `5`
    * Fiyatlandırma: `Pay-per-request (x402 Base USDC: $0.001 - $0.005)`
    * Yetkili: `Faruk Ucal` (`contact@sovroute.com` / `faruk@sovroute.com`)
    * OpenAPI Spesifikasyonu: `openapi.pdf` (ve canlı `https://node.sovroute.com/openapi.json`)
    * Dokümantasyon URL: `https://node.sovroute.com`
    * Güvenlik & Payout: `0x488cbDad29E60d8Bae53FFF4c4252C9711dF9784` (Base USDC Kasası) & Circle Inspector 100/100 Grade A onayı ve npm `@aipp/sovereign-node-mcp` referansları iletildi.
  * **Durum:** İnceleme beklemede (Circle ekibi onayladığında `agents.circle.com` arama sonuçlarında doğrudan listelenecek).

### 🎯 Sıradaki Eylem Sırası:
1. **TaskFuel / Moritz Kaminski Yanıt Takibi:** `moritz@taskfuel.ai` adresine teslim edilen resmi iş birliği e-postasının yanıtını izlemek (`contact@sovroute.com`).
2. **Circle Agent Marketplace Onay Takibi:** `agents.circle.com` üzerinde SovRoute listelemesinin canlıya çıkışını doğrulamak.
3. **MCP Registry & Agent Dizinleri Dağıtımı:**
   * **Smithery.ai:** `@aipp/sovereign-node-mcp` paketini tek tıkla Smithery registry'sine ekleme (`smithery.ai/new`).
   * **Glama.ai:** Glama MCP Server kataloğuna ekleme.
   * **Cursor Directory (`cursor.directory`):** Geliştiricilerin tek tıkla ekleyebileceği Cursor MCP profilini paylaşma.
4. **x402.new ve Ajan Pazar Yerleri:** `x402.new` otomatik tarayıcısının `https://node.sovroute.com/openapi.json` spesifikasyonunu indekslemesini doğrulamak.

---

## 6. 📦 TaskFuel'a Sunulacak 5 Benzersiz `node.sovroute.com` Uç Noktası Özeti
*(Mevcut `sovroute.com` üzerindeki 3 uç noktayla çakışmayan, %100 `x402 Base USDC` + `L402` uyumlu paket)*
1. `GET /v1/chain/btc/rbf-shield/{txid}` (`$0.005` / `5 sats`) — 0-Conf BIP-125 RBF Double-Spend Fraud Shield
2. `GET /v1/chain/btc/next-block-xray?txid={txid}` (`$0.003` / `3 sats`) — Live Next-Block Miner Template X-Ray (`getblocktemplate`)
3. `POST /v1/chain/btc/simulate-tx` (`$0.005` / `5 sats`) — Zero-Broadcast Bitcoin Consensus & Script Dry-Run Simulator (`testmempoolaccept`)
4. `GET /v1/chain/btc/mempool` (`$0.002` / `2 sats`) — Deep Mempool Entropy & Congestion Engine
5. `POST /v1/omni/pay-lightning` (`$0.025` / `25 sats`) — SUB-LIG Walletless Cross-Chain Lightning Bridge

---

## 7. 🌐 16 KASIM 2026: KÜRESEL RESMİ MCP SUNUCUSU NPM'DE YAYINDA (`@aipp/sovereign-node-mcp@1.0.2`)

* **Paket Adı:** `@aipp/sovereign-node-mcp`
* **Canlı npm Sayfası:** `https://www.npmjs.com/package/@aipp/sovereign-node-mcp`
* **Sürüm:** `1.0.2` (Public / MIT Lisanslı)
* **Yükleme Gerektirmeyen Doğrudan Çalıştırma:**
  ```bash
  npx -y @aipp/sovereign-node-mcp
  ```
* **Desteklenen Ortamlar:** Claude Desktop (`claude_desktop_config.json`), Cursor IDE (`.cursor/mcp.json`), Windsurf, LangChain ve otonom yapay zeka ajanları.
* **Sağlanan 7 Resmi MCP Aracı (Forensics & Intelligence):**
  1. `get_next_block_xray`: Canlı madenci aday blok röntgeni (Ücret: `3 sats` / `$0.003`). Sıradaki bloğa girme garantisini (`GUARANTEED_NEXT_BLOCK`) söyler.
  2. `simulate_raw_transaction`: Sıfır-yayın (`%0 P2P`) kuru-çalıştırma konsensüs doğrulayıcısı (`testmempoolaccept`, Ücret: `5 sats` / `$0.005`).
  3. `check_rbf_fraud_shield`: 0-Conf BIP-125 RBF çift-harcama ve ata zinciri zafiyet kalkanı (Ücret: `5 sats` / `$0.005`).
  4. `get_bitcoin_smart_fees`: Gerçek zamanlı akıllı ücret tahmin kahini (`estimatesmartfee`, Ücret: `1 sat` / `$0.001`).
  5. `get_mempool_entropy`: Ağ sıkışıklık ve entropi seviyesi (Ücret: `2 sats` / `$0.002`).
  6. `verify_block_header`: Doğrudan bare-metal Core v31.1 blok ucu doğrulaması (Ücret: `1 sat` / `$0.001`).
  7. `pay_lightning_invoice`: Ajanın NWC veya Phoenixd cüzdanı üzerinden otonom mikro-ödeme yapmasını sağlayan yardımcı araç (Ücretsiz).
* **Doğrulama Durumu:**
  * npm güvenlik ve kötü amaçlı yazılım taraması (`Socket Security`) onaylandı.
  * Dokümantasyon tamamen İngilizce, temiz ve küresel standartlara getirildi; eski iç notlar tamamen kaldırıldı.

---

## 8. 🛠️ MCP REGISTRY ENTEGRASYONU (GLAMA.AI & DOĞRUDAN VENDOR YÖNTEMİ)

* **Sektör Gelişmesi:** Smithery.ai, Arcade.dev tarafından satın alınarak aracı proxy ve CLI katmanını kapattı ve doğrudan satıcı MCP URL'lerini listeleyen statik bir dizine dönüştü.
* **Bizim Mimari Avantajımız:** Biz `@aipp/sovereign-node-mcp` paketini zaten hiçbir aracıya bağlı kalmadan doğrudan yerel `npx -y @aipp/sovereign-node-mcp` ve vendor-direct formatında inşa etmiştik.
* **Eklenen Dosyalar:**
  * `glama.json`: Sektörün şu anki 1 numaralı aktif açık MCP kataloğu olan **Glama.ai** (`glama.ai/mcp/servers`) otomatik doğrulama ve sahiplik şeması eklendi (`mtwuser`).
  * `smithery.yaml`: Statik dizin indekslemesi için konfigürasyon korundu.
  * `Dockerfile`: Glama'nın otomatik Docker güvenlik ve derleme testi için multi-stage üretim Dockerfile'ı eklendi.
* **Resmi Public GitHub Reposu:** `https://github.com/aipp-key/sovereign-node-mcp` (Canlı & Public).
* **Test Kapsamı:** `tests/mcp-server.test.ts` 7/7 aracı doğrulamak üzere güncellendi ve yeşil geçti.
* **Glama Durumu:** 16 Kasım 2026 14:32 TSİ itibarıyla **GLAMA RESMİ OLARAK ONAYLADI!** (`sovereign-node-mcp` Glama küresel MCP kataloğunda resmen dizine eklendi ve canlı yayına girdi).

---

## 10. 🛰️ TELEGRAM EKOSİSTEM GÖZETLEME SİSTEMİ (ECOSYSTEM WATCHDOG)

* **Script:** `scripts/ecosystem-watchdog.mjs`
* **Telegram Botu:** `@SovRouteNotifyBot` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID: 7873309240`)
* **Taranan 11 Kritik Nokta:**
  1. `node.sovroute.com (Health)`: `200 OK`
  2. `Next-Block X-Ray (L402/x402)`: `402 Payment Required`
  3. `0-Conf RBF Shield (L402/x402)`: `402 Payment Required`
  4. `Bitcoin Smart Fees (L402/x402)`: `402 Payment Required`
  5. `Mempool Entropy (L402/x402)`: `402 Payment Required`
  6. `OpenAPI 3.1 Spec`: `200 OK`
  7. `Satring Domain Verification`: `200 OK`
  8. `Satring Directory Page`: `200 OK`
  9. `Agentic Market Exchange`: `200 OK`
  10. `npm: @aipp/sovereign-node-mcp`: `200 OK` (Sürüm takibi: `v1.0.2`)
  11. `GitHub Public Repo`: `200 OK` (Açık hata/issue sayısı: `0`)
* **İlk Canlı Rapor:** 16 Kasım 2026 14:20 TSİ itibarıyla Telegram'a başarıyla iletildi (`Telegram dispatch result: SUCCESS`).
* **Çalışma Modları:**
  * `node scripts/ecosystem-watchdog.mjs`: Tam durum raporunu Telegram'a gönderir.
  * `node scripts/ecosystem-watchdog.mjs --alert-only`: Yalnızca bir uç, pazar yeri veya npm/GitHub çökerse acil kırmızı alarm atar.

---

## 11. 🛡️ SOVEREIGN STANDARDS & HERMES HAFTALIK İSTİHBARAT AJANI

* **Standartlar Belgesi:** `SOVEREIGN_STANDARDS.md` oluşturuldu ve GitHub'a işlendi.
  * *1. Temel Felsefe:* Mutlak Gerçeklik (Ground Truth), Ray Bağımsızlığı (L402/x402/SOL/EVM), Sıfır-Mağduriyet (Zero Failures / Retry Voucher), Radikal Çeviklik.
  * *2. Operasyonel Standartlar:* `< 0.05ms` önbellek, `%99.95+` uptime, `%0` 5xx sızıntısı.
  * *3. 6 Resmi Pazar Yeri & Dizin Portföyü:* TaskFuel, Circle, Glama, Global Agentic Market, Satring, npm.
* **Hermes Sentinel Rutini:** `scripts/hermes-sentinel.mjs`
  * Her Pazartesi sabahı otonom olarak çalışır.
  * Tüm pazar yerlerini, uç gecikmelerini, npm sürümünü ve GitHub açık sorunlarını denetler.
  * Yönetici brifingini doğrudan `@SovRouteNotifyBot` üzerinden Telegram'a raporlar.
  * İlk denetim 16 Kasım 2026 14:42 TSİ'de başarıyla çalıştırıldı ve Telegram'a ulaştı.

---

## 9. 🏆 GLOBAL AGENTIC MARKET EXCHANGE: FOUNDER #1 OLARAK EKLENDİ!

* **Pazar Yeri:** Global Agentic Market Exchange (`agenticmarket.exchange`)
* **Unvan / Sıralama:** **Founder #1** (İlk 100.000 geliştirici arasında 1 numara!)
* **Public Agent ID:** `e0bee9b5-8576-44a9-83bb-35981957c9de`
* **Kademe / Fiyat:** `Nano $0.008` (Dijital API)
* **Kayıt Tarihi:** 16 Kasım 2026 Pazartesi 12:30 TSİ
* **Entegrasyon Spesifikasyonu:** `https://node.sovroute.com/openapi.json`
* **Webhook / Routing Secret:** `AGENTIC_MARKET_SECRET` `.env` dosyasına kaydedildi ve güvenceye alındı.
* **Onay Durumu:** Otomatik doğrulama (`verification pending`) sürecinde; onaylandığında bildirim e-postası `contact@sovroute.com` adresine ulaşacak.

---

## 12. 💡 STRATEJİK DEĞERLENDİRME: CIRCLE WEB3 SUITE & `aipp` DUAL-RAIL PARADİGMASI

16 Kasım 2026 akşam oturumunda, bağımsız bir vizyon oturumu olarak Circle'ın Web3 geliştirici paketi (`developers.circle.com`) ve `aipp` projemiz derinlemesine incelenmiştir:

1. **Circle Mimarisi İncelemesi:**
   * Gömülü Cüzdanlar (Developer & User-Controlled Wallets), Gas Station (Sponsorlu gaz), Paymaster (USDC ile gaz ödeme) ve CCTP / Gateway (Unified Balance) özellikleri değerlendirildi.
   * **Bürokrasi Engeli:** Circle API ve Console'un Mainnet ortamında kurumsal kimlik / şirket doğrulaması (KYB) şart koştuğu, bireysel/şirketsiz ve sıfır bürokrasiyle canlıya geçişe izin vermediği netleştirildi.
2. **`aipp` Farkındalığı & Doğrulaması:**
   * Kendi geliştirdiğimiz `aipp` projemizin (`C:\Users\faruk\Desktop\dev\aippdev`) zaten mikro-satışlar ($0.10 - $3), dijital link/dosya, Passkey/WebAuthn oturumu ve Dual-Rail (⚡ Lightning + 🔵 Base USDC) ile bu acıyı çözdüğü teyit edildi.
   * `aipp`'nin kullanıcı fonlarını emanette tutmadığı (non-custodial instant forward), bu sayede finansal lisans veya şirket zorunluluğu olmadan saf "Software Routing & Licensing Fee" (%3) ile çalıştığı vurgulandı.
3. **Gelecek İyileştirme Fırsatı (USDC Permit / EIP-2612):**
   * Circle'ın sağladığı tek gerçek üstünlük olan *"Kullanıcının cüzdanında ETH olmadan işlem yapabilmesi"* (Gasless UX) konforunun; şirket kurmadan, Base üzerindeki yerel USDC akıllı sözleşmesinin **EIP-2612 `permit()`** fonksiyonu ile `aipp`'ye de kazandırılabileceği tespit edildi.
4. **Mevcut Karar:**
   * Bu stratejik vizyon ve teknik yol haritası ileride değerlendirilmek üzere rafa kaldırıldı; mevcut sistemler kesintisiz çalışır durumda bırakıldı.

---

## 13. 🌙 GÜN SONU DURUMU & YARINA DEVİR (16 KASIM 2026 21:10 TSİ)

* **Bare-Metal Düğüm:** `node.sovroute.com` 4 rayda da (%100 uptime, < 0.05ms önbellek) canlı ve aktif.
* **Pazar Yerleri:** Glama.ai onaylandı, TaskFuel aktif, Agentic Market Founder #1 kaydı tamam, Satring yayında.
* **Otonom Gözetleme:** `@SovRouteNotifyBot` Telegram üzerinden 11 kritik noktayı ve haftalık Hermes Sentinel denetimlerini izliyor.
* **Depolar & Kod:** Tüm yerel ve sunucu depoları senkronize, testler yeşil (19/19).

---

## 14. 🎯 YARININ İLK ÖNCELİĞİ: EIP-7702 GÜVENLİK KALKANI (AUTHTX SCANNER)

Ethereum Pectra yükseltmesiyle hayatımıza giren ve EOA cüzdanları akıllı hesaba dönüştüren **EIP-7702** için otonom ajan seviyesinde adli bilişim (forensics) ve güvenlik kalkanı servisi inşa edilecek:

* **Çözülecek Ölümcül Tehdit:** Ajanların veya kullanıcıların sahte `authorization_list` imzalayarak cüzdanlarındaki tüm varlıkları saldırganın akıllı sözleşmesine devretmesi (Wallet Drainer), denetlenmemiş delegasyonlar ve cross-chain replay zafiyetleri.
* **Geliştirilecek Uç Nokta:** `POST /v1/chain/evm/eip7702-shield` (ve `/v1/omni/evm/eip7702-shield`)
  * Ücret: `5 sats` (L402) / `$0.005` (Base USDC).
* **Kalkanın Yapacağı Analiz:**
  1. `authorization_list` ayrıştırma (`chain_id`, `address`, `nonce`).
  2. Hedef adresin denetim ve itibar kontrolü (Safe / Kernel / ERC-7579 standardı mı, yoksa şüpheli/drainer mı?).
  3. Bytecode disassembly: `selfdestruct`, gizli `delegatecall` veya yetkisiz token transfer kancası taraması.
  4. Cross-chain replay riski (Zincir sınırlandırması geçerli mi?).
  5. Karar Puanı: `SAFE_VERIFIED` | `SUSPICIOUS_UNVERIFIED` | `CRITICAL_DRAIN_RISK`.
* **MCP Aracı:** `@aipp/sovereign-node-mcp` paketine 8. araç olarak `inspect_eip7702_authorization` eklenecek, OpenAPI şeması ve testleri hazırlanacak.

---

## 15. 🧭 17 KASIM 2026 GÜNCELLEMESİ, CANLI DOĞRULAMA & SIRADAKİ ADIMLAR

### ✅ Bugün Tamamlananlar (17 Kasım 2026):
* [x] **EIP-7702 AuthTx Güvenlik Kalkanı Yayında:** `POST /v1/chain/evm/eip7702-shield` (`5 sats` / `$0.005` Base USDC) ve `POST /v1/omni/evm/eip7702-shield` canlıya alındı (`PUSH1..PUSH32` güvenli disassembler, `SELFDESTRUCT`/`DELEGATECALL`/drain selector taraması, `chainId=0` cross-chain replay tespiti, denetlenmiş standart kayıt defteri).
* [x] **PyTorch → ONNX Sinir Ağı Katmanı Yayında:** 18 gerçek Ethereum/Base denetlenmiş kontratı + drainer bytecode'ları üzerinde PyTorch MLP eğitildi (`assets/models/evm-bytecode-risk.onnx`, `Val Acc=1.0000`) ve `onnxruntime-node` ile `POST /v1/chain/evm/bytecode-risk-ml` (`5 sats` / `$0.005`) ucunda canlıya alındı.
* [x] **8/8 Gerçek Kripto L402 Doğrulaması:** `scripts/verify-live-forensics-l402.ts` ile tüm **8 ücretli uç nokta** canlı `https://node.sovroute.com` üzerinde Phoenixd Mainnet LN cüzdanı üzerinden gerçek faturalar ödenerek doğrulandı (`14397 ➔ 14365 sats`, toplam `32 sats`, `12010ms`).
* [x] **Bitcoin Veri Toplayıcı Aktif:** Sunucuda `btc-mempool-collector.service` kuruldu (`60s` aralıklarla `/srv/sovereign-node-engine/data/mempool-history.jsonl` içine canlı mempool/blok telemetrisi yazıyor).
* [x] **8. MCP Aracı & OpenAPI 3.1 (8 Uç):** `inspect_eip7702_authorization` MCP sunucusuna eklendi; `openapi.json` ve `llms.txt` 8 ücretli uca güncellendi.
* [x] **Vitrin, UX & Güvenlik Sertleştirmesi (`sovroute.com` + `node.sovroute.com`):**
  * Her iki siteye kurumsal top navbar, sade CTA'lar, tek satır (`nowrap`) endpoint kartları, `URL` kopyalama butonları (`WeakMap` timer), `Give to your AI agent` kopyalama barı, `node.sovroute.com`'da 3×3 grid, kategori filtre sekmeleri (`role="tab"`), canlı `/health` telemetrisi ve sekmeli/kopyalanabilir terminal eklendi.
  * `sovroute.com` `worker.js` `500 ➔ 404` hatası düzeltildi; `node.sovroute.com` üzerinde `x-powered-by` kapatıldı, güvenlik header'ları (`nosniff`, `DENY`, `Referrer-Policy`), temiz JSON `404`, `/robots.txt` ve `/sitemap.xml` eklendi.
  * `/omni-test` ve `/v1/omni/solana-latest-tx` uçları `ENABLE_OMNI_TEST_UI=true` bayrağıyla prodüksiyonda `404`'e çekildi.
  * `modern-web-guidance` `legacy-scan` (`sovroute/web`): **0 bulgu**.

### 🎯 3 Ürün Ailesi Yol Haritası & Sıfır-Tekrar Filtresi:
Mevcut **8 temel uç nokta** (`next-block-xray`, `rbf-shield`, `simulate-tx`, `mempool`, `fees`, `block`, `eip7702-shield`, `bytecode-risk-ml`) oturmuş temel ürünler olarak kabul edilir. Bundan sonraki tüm Ar-Ge ve yeni uç nokta kararları yalnızca şu **3 ürün ailesi** altında, aynı işlevi tekrarlamadan gerçekten ödeme alınabilir yeni problemleri çözmek üzere seçilecektir:

1. **Bitcoin Intelligence:** Mevcut 6 Bitcoin ucu etrafında işlem simülasyonu, onay tahmini (`confirm-forecast`) ve madenci davranışı analizi.
2. **EVM Security *(Ana Büyüme Alanı)*:** `eip7702-shield` ve `bytecode-risk-ml` üzerine **pre-sign transaction simulation**, **approval / Permit2 security** ve **contract forensics**.
3. **Agent Infrastructure:** Bu servislerin MCP, Dual/Quad-Rail ödeme, güvenlik (Retry Voucher, anti-replay) ve otonom kullanım/keşif altyapısı.

### 📌 Nerede Kaldık & Sıradaki Adımlar:
1. **Circle & TaskFuel Takibi:** `contact@sovroute.com` üzerinden Circle Agent Registry manuel inceleme dönüşünü ve `moritz@taskfuel.ai` yanıtını izlemek *(bugün `10:21:55` TRT'de `0x488cbDad...` cüzdanına `0.001 USDC` x402 canlı test ödemesi geldi)*.
2. **npm `@aipp/sovereign-node-mcp` Yeni Sürüm (`v1.0.4`):** 8. araç (`inspect_eip7702_authorization`) eklendi; `npm publish` ile canlı npm paketini güncellemek.
3. **Bitcoin Onay Tahmini Modeli (`confirm-forecast`):** `btc-mempool-collector.service` birkaç gün/hafta gerçek veri biriktirdikten sonra PyTorch → ONNX ile eğitip `POST /v1/chain/btc/confirm-forecast` ucunu açmak.
4. **EVM Security Genişlemesi:** Sıradaki yeni ürün adayı olarak **Approval / Permit2 Risk Scanner** veya **Pre-Sign EVM Tx Simulator** tasarlamak.

---

## 16. 🤖 18 KASIM 2026 — REMOTE HTTPS MCP (`/mcp`) & CREWAI HAZIRLIK AŞAMASI

* **Marka Kararı:** CrewAI ve harici MCP ekosistemine **SovRoute** markasıyla çıkılması kararlaştırıldı (`https://node.sovroute.com/mcp`).
* **Yeni Uç Nokta (`src/interfaces/http/controllers/mcp.controller.ts` & `src/index.ts`):**
  * `POST /mcp` (Stateless `StreamableHTTPServerTransport`, `GET`/`DELETE` için `405`, `OPTIONS` CORS destekli).
  * **Güvenlik & Demo Guardrail'leri:**
    * Para harcayan `pay_lightning_invoice` aracı hosted `/mcp` ucuna **kesinlikle dahil edilmedi**; yalnızca **7 salt-okunur / zero-broadcast analiz aracı** (`get_bitcoin_smart_fees`, `get_mempool_entropy`, `check_rbf_fraud_shield`, `get_next_block_xray`, `simulate_raw_transaction`, `verify_block_header`, `inspect_eip7702_authorization`) sunuldu.
    * Demo / sandbox modu (`SOVROUTE_MCP_DEMO_ENABLED !== 'false'`) IP başına dakikada `20` istek (`MCP_DEMO_RATE_LIMIT_PER_MIN`) ile sınırlandırıldı (`429 Too Many Requests`). `SOVROUTE_MCP_API_KEY` ayarlıyken `Authorization: Bearer` / `X-API-Key` ile sınırsız erişim sağlanır.
* **Doğrulama:**
  * `npm run build` (`tsc`) hatasız (`0` hata) tamamlandı.
  * `npx tsx --test tests/mcp-http.test.ts` (**3/3 PASS**): `initialize`, `tools/list` (7 salt-okunur araç, `pay_lightning_invoice` hariç), `tools/call`, geçersiz `txid` reddi, `GET /mcp -> 405` ve `401/200` API key doğrulaması geçti.
* **CrewAI Örnek Entegrasyon Paketi (`examples/crewai-bitcoin-guardrail/`):**
  * `agent_demo.py` (`--verify-mcp` anahtarsız smoke-test + tam `crewai` `MCPServerAdapter` güvenlik analisti ajanı), `requirements.txt`, `.env.example` ve `README.md` oluşturuldu (`py_compile` temiz).
* **Canlı Dağıtım & Doğrulama (2026-11-18):**
  * Sunucuda (`ubuntu-8gb-hel1-1`) `npm run build` ve `systemctl restart sovereign-node-engine.service` tamamlandı (`active (running)`).
  * `https://node.sovroute.com` üzerinde **9/9 canlı senaryo kontrolü geçti** (`verify_block_header`, `get_bitcoin_smart_fees`, `get_mempool_entropy`, `get_next_block_xray`, `check_rbf_fraud_shield` gerçek mempool TXID ile, `inspect_eip7702_authorization`, negatif kontroller, `GET /mcp -> 405`).
  * `simulate_raw_transaction` hata sanitizasyonu (`Command failed: sh -c` sızıntısı engellendi) ve **CrewAI `MCPServerAdapter` Pydantic regex uyumluluğu** (`rawTxHex` şeması `.min(100).max(200000).regex(/^[0-9a-fA-F]+$/)`) sunucuya deploy edildi.
  * Resmi `crewai 1.15.41` + `crewai_tools.MCPServerAdapter` (`streamable-http`) ile canlı `https://node.sovroute.com/mcp` bağlantısı ve 7 aracın yüklenip `get_bitcoin_smart_fees.run()` çalıştırması **%100 doğrulandı**.
  * **Tam Uçtan Uca CrewAI LLM Demo Testi (`agent_demo.py --txid 2fbddb2c3980...`) PASS:** OpenRouter (`openai/gpt-4o-mini`) + canlı Bitcoin mainnet mempool işlemi üzerinde `get_bitcoin_smart_fees`, `get_mempool_entropy`, `get_next_block_xray` (`rank 753`, `GUARANTEED_NEXT_BLOCK`) ve `check_rbf_fraud_shield` (`HIGH_RISK_RBF_ENABLED`) çağrılarını yürütüp **`HOLD`** kararlı **Pre-Flight Security Report** üretti. `.gitignore` ile `.env` ve `.venv/` dışarıda bırakıldı.
* **Public GitHub Demo Reposu Yayında (2026-11-18):** `https://github.com/sovroutecore/sovroute-crewai-guardrail` (Public, `main` dalı, 6 temiz dosya: `agent_demo.py`, `requirements.txt`, `.env.example`, `.gitignore`, `README.md`, `LICENSE`). Çekirdek sunucu kodları ve iç notlar tamamen izole/private bırakıldı. Sıfırdan `git clone` + `--verify-mcp` testi başarıyla geçti.
* **Ekosistem Uyumlu MCP & Keşif Güncellemesi (2026-11-18 — 7 Deterministik Araç Kararı):**
  * Prototip aşamasındaki `scan_evm_bytecode_risk_ml` (18 kontratlık ONNX denemesi) CrewAI vitrininden ve hosted `/mcp` ucundan geri çekildi; dışarıya yalnızca **%100 deterministik 7 salt-okunur / zero-broadcast araç** (`get_bitcoin_smart_fees`, `get_mempool_entropy`, `check_rbf_fraud_shield`, `get_next_block_xray`, `simulate_raw_transaction`, `verify_block_header`, `inspect_eip7702_authorization`) bırakıldı.
  * Demo rate-limit `120/dk` (`cf-connecting-ip` gerçek istemci IP'si öncelikli) olarak ayarlandı.
  * `discovery-specs.view.ts` (`/mcp-config.json` ve `/llms.txt`) eklemeli (non-breaking) güncellendi: mevcut `@aipp/sovereign-node-mcp` stdio bloğu ve `exhaustive-scenarios.test.ts` (`8/8 PASS`) korunarak `remoteStreamableHttp` (`https://node.sovroute.com/mcp`) ve CrewAI 1.x `mcps=[]` DSL eklendi.
  * Sunucuya (`100.95.119.88`) deploy edildi ve canlıda doğrulandı: `tools/list` (`7` deterministik araç, `Limit: 120`), `/mcp-config.json`, `/llms.txt`, `/health` (`200`), `/v1/chain/btc/fees` (`402`).
  * `https://github.com/sovroutecore/sovroute-crewai-guardrail` reposu (commit `946ecd4`) 7 deterministik araç, CrewAI 1.x `mcps=[]` DSL ve `120 req/min` ile güncellendi.
* **Resmi CrewAI PR Açıldı (`crewAIInc/crewAI-quickstarts#10` — 2026-11-18):**
  * `crewAIInc/crewAI-examples` arşivlenmiş olduğu için CrewAI'nin aktif resmi deposu **`crewAIInc/crewAI-quickstarts`** üzerine PR açıldı: **`https://github.com/crewAIInc/crewAI-quickstarts/pull/10`** (`sovroutecore:feat/sovroute-mcp-guardrail-quickstart`).
  * 4 temiz dosya içerir: `Guardrails/sovroute_mcp_guardrail.ipynb` (`scripts/clean_notebooks.py` temiz), `Guardrails/sovroute_mcp_guardrail/main.py`, `README.md`, `requirements.txt`.
* **Web Vitrin & Saf Pay-Per-Call MCP Geçişi (2026-11-18):**
  * `engine-dashboard.view.ts` güncellendi ve sunucuya deploy edildi: 3×3 kartlardaki 8. kart `bytecode-risk-ml` yerine **`POST /mcp`** (`15 FREE/DAY` · `1-5 sats L402` · `$0.001-$0.005 x402`) ile değiştirildi; "Give to your AI agent" barına `Remote MCP` kopyalama butonu, terminal `MCP Server` sekmesine CrewAI 1.x `mcps=["https://node.sovroute.com/mcp"]` satırı eklendi.
  * `SOVROUTE_MCP_API_KEY` (abonelik/anahtar mantığı) ve `120 req/min` sınırsız demo **tamamen kaldırıldı**. `mcp.controller.ts` + `index.ts` (**8/8 test PASS**) artık `tools/call` için **IP başına 24 saatte 15 ücretsiz deneme**, sonrasında ise doğrudan `createL402Middleware` üzerinden **L402 Lightning (`1–5 sats`) / x402 Base USDC (`$0.001–$0.005`) HTTP `402` Pay-Per-Call** akışına geçiyor (`initialize` ve `tools/list` ücretsiz/sınırsız).
  * `discovery-specs.view.ts`, standalone GitHub reposu (`https://github.com/sovroutecore/sovroute-crewai-guardrail`, commit `20d5bf1` — `Technical Evidence & Verification` eklendi) ve `https://github.com/crewAIInc/crewAI-quickstarts/pull/10` PR'ı (commit `7ebf0f6`) saf Pay-Per-Call + mühendislik kanıtlarıyla güncellendi.
  * PR #10 altına resmi Hibrit Teknik Yorum gönderildi: `https://github.com/crewAIInc/crewAI-quickstarts/pull/10#issuecomment-6981606173`.
* **CrewAI İlk Mühendislik E-postası Gönderildi & Teslim Edildi (2026-11-18 18:35 TRT):**
  * **From:** `SovRoute Team <contact@sovroute.com>`
  * **To:** `johanna.hyde@crewai.com`
  * **Subject:** `CrewAI Quickstarts PR #10 — Mainnet-Tested MCP Blockchain Security Integration`
  * **Resend ID:** `01a1ef4c-07ab-7569-8044-cb9e29f92da2` (`last_event: delivered`).
  * **Takip Planı:** Yanıt gelmezse 5–7 iş günü sonra (`~25-27 Kasım 2026`) `03 — FOLLOW_UP` gönderilecek.
* **Son Canlı L402 Mainnet Doğrulaması (2026-11-18):** `npx tsx scripts/verify-live-forensics-l402.ts` ile tüm 8 ücretli uç nokta Phoenixd Mainnet LN cüzdanından gerçek faturalar ödenerek doğrulandı (**8/8 PASS**, `14365 ➔ 14333 sats`, toplam `32 sats`, `11440ms`).
* **Sıradaki Adım:** `examples/crewai-bitcoin-guardrail/` paketini bağımsız GitHub reposuna/örneğine taşıyıp `python agent_demo.py --verify-mcp` ve tam CrewAI LLM demosuyla CrewAI ekibine sunulacak kanıt çıktısını üretmek.

---

## 17. 📊 19 KASIM 2026 — SIFIR MALİYETLİ CREWAI CLOUD CANLI NABIZ & DOĞRULAMA VİTRİNİ (`GET /crewai-status` & `#crewai`)

* **Mimari (Seçenek 1 — \$0.00/ay Salt-Okunur Nabız):**
  * `src/domain/schemas/crewai-status.schema.ts`: Zod doğrulamalı şemalar ve `18 Kasım 2026` tarihli doğrulanmış mainnet koşu kayıtları (`full-stack-diagnostic`: `bb3b6ede-2cae-43a7-b97c-b012bee16fcb`, `7/7 PASSED`; `preflight-security-check`: `62f67e1f-da54-4903-9692-e52127ea0927`, `4/4 PASSED`, `VERDICT: HOLD`).
  * `src/application/services/crewai-status.service.ts`: Her iki CrewAI Cloud akışının yalnızca salt-okunur `GET /inputs` ucunu paralel sorgular (`15 dk` önbellek, `2 dk` degraded önbellek, concurrent in-flight deduplication); asla `/kickoff` tetiklemez ve dışarıya deployment URL/token sızdırmaz.
  * `src/interfaces/http/controllers/crewai-status.controller.ts` & `src/index.ts`: Yalnızca `GET /crewai-status` ucu açıldı (`POST /crewai-status` → `404`).
  * `src/interfaces/http/views/crewai-live-section.view.ts` & `engine-dashboard.view.ts`: `https://node.sovroute.com/#crewai` bölümünde sekmeli canlı doğrulama paneli (`7/7` ve `4/4` araç metrikleri, tıklanabilir `mempool.space/tx/` bağlantıları, CrewAI 1-liner kopyalama ve otomatik `/crewai-status` canlı rozeti) eklendi.
* **Testler & Canlı Dağıtım (2026-11-19):**
  * Yerelde `npm run build` ve `npx tsx --test tests/crewai-status.test.ts tests/mcp-http.test.ts tests/mcp-server.test.ts` (**11/11 PASS**).
  * `root@100.95.119.88:/srv/sovereign-node-engine` üzerine deploy edildi, `.env` senkronize edildi (`chmod 600`), `npm run build` + `systemctl restart sovereign-node-engine` (`active`).
  * Canlı `https://node.sovroute.com` doğrulaması: `GET /crewai-status` (`200`, `ONLINE`, `2/2`, `cached: false` → `cached: true`), `POST /crewai-status` (`404`), `GET /` (`200`, `#crewai` mevcut, `/kickoff` yok), `GET /health` (`200`), `POST /mcp` `tools/list` (`200`, `7` araç), `GET /v1/chain/btc/fees` (`402`).
* **LangChain / LangGraph + LangSmith Entegrasyonu (19 Kasım 2026 Öğleden Sonra):**
  * `examples/langchain-bitcoin-guardrail/` (`agent_demo.py`, `push_prompt.py`, `requirements.txt`, `.env.example`, `.gitignore`, `README.md`) oluşturuldu; izole `.venv` üzerinde `--verify-mcp` (7/7 araç) ve tek seferlik canlı Mainnet koşusu tamamlandı.
  * Canlı Mainnet TXID `5b99afdf5342215ddad4ea382ff3aa933fcc231d64a0340b10785f9a3e4254d8` + EIP-7702 delegasyon (`chainId: 1`) analizi LangSmith `default` projesine kaydedildi: `LANGSMITH_RUN_ID=0fad0f49-2c67-4311-a6ab-cb29bb48cb1e`.
  * **Herkese Açık LangSmith Trace Kanıtı (`HTTP 200`):** `https://smith.langchain.com/public/012d9240-a232-414a-8a6d-20297cf3aafd/r`
  * **LangSmith Prompt (`private` — Public Hub için hesap handle'ı bekleniyor):** `sovroute-bitcoin-preflight-guardrail` (`https://smith.langchain.com/prompts/sovroute-bitcoin-preflight-guardrail/5f56298c?organizationId=37dbcfa8-71df-47af-9160-b254e81ac277`).
  * **Public LangGraph GitHub Reposu (`HTTP 200`):** `https://github.com/sovroutecore/sovroute-langchain-guardrail` (`SovRoute <contact@sovroute.com>` imzalı, sıfır secret, 7 temiz dosya).
  * **Vitrin Senkronu (`node.sovroute.com`):** `#crewai` kartına `Live LangSmith Trace ↗` ve `LangGraph Guardrail Repo ↗` bağlantıları eklendi; `9/9` test PASS sonrası `100.95.119.88` üzerine deploy edilip canlıda (`GET /` 200, `GET /crewai-status` 200 `ONLINE` `2/2`) doğrulandı.

---

## 18. 🛡️ 19 KASIM 2026 (AKŞAM) — OPENAI AGENTS SDK, BITCOIN CORE BLOK BAŞLIĞI DÜZELTMESİ, x402 BAZAAR VE RESMİ MCP REGISTRY

* **1. OpenAI Agents SDK Entegrasyonu & Kamu Reposu:**
  * `examples/openai-agents-bitcoin-guardrail/` oluşturuldu (`agent_demo.py`, `README.md`, `LICENSE`, `requirements.txt`, `.env.example`, `.gitignore`).
  * `agents.mcp.MCPServerStreamableHttp` ile `https://node.sovroute.com/mcp` doğrudan bağlandı; 7/7 araç keşfi ve duman testi (`--verify-mcp`) doğrulandı.
  * Sunucudaki ücretsiz Evren sağlayıcısı (`deepseek-v4.1-flash`) kullanılarak sıfır maliyetle ($0.00) canlı mainnet audit'i çalıştırıldı ve `HOLD` kararlı rapor üretildi.
  * Temiz GitHub deposu açılarak yayınlandı: **`https://github.com/sovroutecore/sovroute-openai-agents-guardrail`** (`sovroutecore` hesabı, sıfır secret). İşlem bitiminde GitHub CLI hesabı `aipp-key` kimliğine geri döndürüldü.
  * `engine-dashboard.view.ts` ve `crewai-live-section.view.ts` bileşenlerine OpenAI Agents SDK 1-satırlık kopyalama butonu ve repo linki eklendi.

* **2. Bitcoin Core Blok Başlığı (`verify_block_header`) On-Chain Düzeltmesi:**
  * **Hata Tespiti:** `src/infrastructure/bitcoin/bitcoin-rpc.adapter.ts` içindeki `getLatestBlockHeader()` metodunda `previousBlockHash: parsed.bestblockhash`, `merkleRoot: '00000000...'` ve `nonce: 0` şeklinde mock değerler döndürülüyordu.
  * **Çözüm:** Fonksiyon, `bitcoind RPC` üzerinden `getblockchaininfo` ardından `getblockheader <bestblockhash>` çağrısı yapacak şekilde güncellendi.
  * **Canlı Doğrulama:** `verify_block_header` çağrıldı; 976.596. blok için gerçek veriler (`nonce: 3294794318`, `merkleRoot: 50db53ce360d17aec65c6317d48c370de330d3f6203f41895b01b34110d1b660`, `previousBlockHash: 000000000000000000013d3ccc77eae9e5cea943c977932fe4f3fe9bb72c53a6`) başarıyla doğrulandı.

* **3. x402 Bazaar / x402scan Otomatik Keşif Manifesti:**
  * `discovery-specs.view.ts` içine `renderX402Manifest()` fonksiyonu eklendi; x402 v2 Bazaar şemasına uygun 7 ücretli adli bilişim servisi (`discoverable: true`, Base L2 USDC `0x833589fC...`, Kasa `0x488cbDad...`) tanımlandı.
  * `node-truth.controller.ts` üzerinde `/.well-known/x402`, `/.well-known/x402.json` ve `/x402.json` rotaları açıldı.
  * `/sitemap.xml` ve `/robots.txt` güncellendi; canlı `https://node.sovroute.com/.well-known/x402.json` üzerinden HTTP 200 doğrulaması yapıldı.
  * Ana dashboard'daki spec çubuğuna, ajan kopyalama butonlarına ve footer linklerine `x402 Bazaar` eklendi.

* **4. Resmi MCP Registry Manifesti (`server.json`):**
  * Model Context Protocol resmi kataloğu (`registry.modelcontextprotocol.io`) standartlarına uygun `server.json` oluşturuldu (`io.github.sovroutecore/sovroute-mcp`, npm `@aipp/sovereign-node-mcp` v1.0.4, Streamable HTTP ve stdio).

* **5. Ödeme Öncesi Doğrulama ve Güvenlik Saldırı Paketi (8/8 PASS):**
  * `rbf-shield` ve `simulate-tx` uçlarında `validateTxidParam` ve `validateRawTxHexBody` middleware'leri `createL402Middleware` önüne alındı. Böylece bozuk parametrelerde kullanıcıya fatura kesilmeden doğrudan HTTP 400 Bad Request dönmesi sağlandı.
  * `tests/security-attack-suite.test.ts` paketindeki 8 güvenlik testi de (**8/8 PASS**) başarıyla geçti.

* **6. Dağıtım & Doğrulama:**
  * `npm run build` ile derlendi; `dist/` dosyaları Hetzner sunucusuna (`100.95.119.88`) SCP ile aktarıldı ve `sovereign-node-engine.service` yeniden başlatıldı (`active (running)`).
  * Canlı HTTPS uçları ve MCP araçları test edilerek devir teslim hazır hale getirildi.

---

## 19. ▲ 19 KASIM 2026 — VERCEL AI SDK (TYPESCRIPT / NEXT.JS) İLK RESMİ ENTEGRASYONU

* **Arka Plan & Stratejik Değer:**
  * Python ekosistemindeki 3 büyük oyuncuya (CrewAI, LangGraph, OpenAI Agents SDK) ek olarak Web3, DeFi ve DApp dünyasının %90'ının kullandığı **TypeScript / Next.js** dünyasına ilk resmi ajan guardrail paketi kazandırıldı.
* **Uygulama & Mimari (`examples/vercel-ai-bitcoin-guardrail/`):**
  * `ai` (Vercel AI SDK Core) + `@ai-sdk/openai` (`createOpenAI` uyumluluk katmanı) + `zod` + `typescript`.
  * `node.sovroute.com/mcp` üzerindeki 7 deterministik araç `jsonSchema` ile dinamik olarak Vercel AI SDK `tool()` objelerine sarmalandı (`get_bitcoin_smart_fees`, `get_mempool_entropy`, `verify_block_header`, `get_next_block_xray`, `check_rbf_fraud_shield`, `simulate_raw_transaction`, `inspect_eip7702_authorization`).
  * `--verify-mcp` modu ile API anahtarı olmadan sıfır maliyetle MCP el sıkışması ve 7 aracın keşfi duman testinden geçti.
  * Sunucudaki ücretsiz Evren LLM (`deepseek-v4.1-flash`, `compatibility: 'compatible'`) ile tekil/sıralı araç çağrısı başarıyla test edildi.
* **Açık Kaynak Kamu Deposu:**
  * Temiz GitHub deposu açılarak yayınlandı: **`https://github.com/sovroutecore/sovroute-vercel-ai-guardrail`** (`sovroutecore` hesabı, sıfır secret).
  * `npm run build`, `npm run verify` komutları çalışır durumda teslim edildi.
* **Web Vitrini Senkronizasyonu (`node.sovroute.com`):**
  * `crewai-live-section.view.ts` güncellendi: Vercel AI SDK 1-satırlık kopyalama butonu ve doğrudan GitHub repo bağlantısı canlıya alındı.
  * `100.95.119.88` üzerine deploy edildi ve `sovereign-node-engine.service` yeniden başlatıldı.

---

## 20. ⚡ 19 KASIM 2026 (GECE) — MACHINE PAYMENTS PROTOCOL (MPP) IETF STANDARDI YEREL ENTEGRASYONU

* **Arka Plan & MPP Standartları:**
  * Tempo ve Stripe tarafından duyurulan ve IETF nezdinde standartlaştırılan **Machine Payments Protocol (`mpp.dev` / `paymentauth.org`)**:
    - `draft-httpauth-payment-01`: The "Payment" HTTP Authentication Scheme
    - `draft-lightning-charge-00`: Lightning Network Charge Intent (`method="lightning", intent="charge"`)
    - `draft-usdc-charge-00`: USDC Payment Method for HTTP Payment Authentication (`method="usdc", intent="charge"`)
  * MPP'nin temel vaadi: *"MPP lets any buyer pay any seller on the web, extensible to any payment method."*
  * SovRoute, Stripe hesabı açmadan veya üçüncü parti saklama (custody) kullanmadan tamamen kendi egemen Bitcoin Lightning ve Base USDC kasasına ödeme alabilen **resmi MPP uyumlu satıcı düğümü (seller node)** haline getirilmiştir.

* **Teknik Uygulama & Mimari:**
  * **1. `src/interfaces/http/middleware/mpp.helper.ts` (Yeni Modül):**
    - **JCS Kanonizasyonu (RFC 8785):** Sözlük anahtarlarını leksikografik sıralayarak deterministik JSON çıktısı üretir.
    - **Base64url Kodlama/Çözme (RFC 4648 Bölüm 5):** Dolgu (`=`) karakteri olmadan güvenli HTTP başlığı üretir.
    - **`buildMppLightningChallenge`:** `Payment id="...", realm="...", method="lightning", intent="charge", request="<base64url>", expires="<ISO8601>"` başlığı ve JCS istek gövdesi oluşturur (`amount` sats, `currency: "sat"`, `methodDetails: { invoice, paymentHash, network: "mainnet" }`).
    - **`buildMppUsdcChallenge`:** `Payment id="...", realm="...", method="usdc", intent="charge", request="<base64url>", expires="<ISO8601>"` başlığı oluşturur (`methodDetails: { evm: { chainId: 8453, credentialTypes: ["authorization"], decimals: 6 } }`).
    - **`parseMppAuthorizationHeader`:** Gelen `Authorization: Payment <token>` başlığını güvenle çözer; hem Lightning `preimage` (32-byte hex) hem de EVM USDC `EIP-3009` imzalarını Zod/zero-trust ile ayrıştırır.
    - **`buildMppPaymentReceiptHeader`:** Başarılı ödeme sonrasında IETF standardına uygun `Payment-Receipt: <base64url>` başlığı üretir (`{ challengeId, method, reference, status: "success", timestamp }`).
  * **2. `src/application/services/l402.service.ts`:**
    - Doğrudan preimage ve hash doğrulaması için `verifyPreimage(paymentHash, preimage)` metodu eklendi.
  * **3. `src/interfaces/http/middleware/l402.middleware.ts` (Multi-Rail Genişletmesi):**
    - `DUAL_RAIL_CORS_HEADERS` içine `Payment-Receipt` eklendi (`Access-Control-Expose-Headers`).
    - **RAIL 1.5 (MPP)** eklendi: İstemci `Authorization: Payment <token>` ile geldiğinde Lightning preimage SHA-256 özeti ve Phoenixd/LND settlement kontrolü yapılır. Başarılıysa `Payment-Receipt` başlığı eklenip istek işletilir.
    - Kimliksiz isteklerde `WWW-Authenticate` başlığı artık bir dizi olarak hem L402 hem de MPP Lightning ve MPP USDC meydan okumalarını (`WWW-Authenticate: Payment ...`) döndürür.
    - JSON 402 gövdesine `protocols: ['x402', 'mpp', 'l402']` ve `mpp: { lightning, usdc }` blokları yerleştirildi.
  * **4. Kapsamlı Test Paketi (`tests/mpp.test.ts`):**
    - **7/7 Test PASS (%100 Başarı):**
      1. Deterministic JCS Canonicalization and Base64url
      2. buildMppLightningChallenge draft-lightning-charge-00 schema matching
      3. buildMppUsdcChallenge draft-usdc-charge-00 schema matching
      4. parseMppAuthorizationHeader Lightning preimage extraction
      5. parseMppAuthorizationHeader USDC EIP-3009 credential extraction
      6. buildMppPaymentReceiptHeader valid receipt generation
      7. MPP E2E Express server 402 challenge + Lightning preimage settlement + Payment-Receipt verification
  * **5. Vitrin & Terminal Güncellemesi (`engine-dashboard.view.ts`):**
    - Hero başlığı: `direct bitcoind v31.1 + phoenixd · MPP + L402 lightning + x402 base usdc · <0.05ms cache · zero accounts`.
    - Terminal X-Ray sekmesine `curl -H "Authorization: Payment <token>"` MPP örneği eklendi.
    - Footer rozetleri `Multi-Rail Settlement: L402 Lightning · Machine Payments Protocol (MPP) · Base USDC x402` olarak güncellendi.
  * **6. Canlı Sunucu Dağıtımı & Uçtan Uca Doğrulama (`100.95.119.88:3088`):**
    - Derlenen `dist/`, güncel `src/`, `tests/mpp.test.ts` ve `HANDOFF.md` dosyaları Tailscale tüneli üzerinden `/srv/sovereign-node-engine` dizinine aktarıldı.
    - `systemctl restart sovereign-node-engine.service` ile servis kesintisiz yeniden başlatıldı (`active (running)`).
    - Canlı `https://node.sovroute.com/v1/chain/btc/fees` ucu test edildi: `HTTP/1.1 402 Payment Required` yanıtında `Access-Control-Expose-Headers` içinde `Payment-Receipt`, `WWW-Authenticate` içinde hem L402 hem de MPP Lightning (`ch_lig_...`) ve MPP USDC (`ch_usdc_...`) meydan okumaları doğrulandı.
    - Canlı `/health` ve `/llms.txt` uçları `HTTP 200 OK` olarak teyit edildi.
    - `GET /crewai-status` ucu test edildi; `status: ONLINE`, `onlineCount: 2/2`, `latencyMs: ~764ms` yeşil nabız durumu doğrulandı.

---

## 7. 🤖 GOOGLE AI TARAMA GERİ BİLDİRİMLERİ & TRIPLE-RAIL/MCP TAM SENKRONİZASYONU (2026-11-20)

* **1. Google AI Crawler Taraması & llms.txt Eksiklerinin Kapatılması:**
  - **Triple-Rail Tanımlaması:** `node.sovroute.com/llms.txt` ve `sovroute.com/llms.txt` dosyalarındaki "Dual-Rail" başlığı **Triple-Rail (MPP + L402 + x402)** olarak güncellendi.
  - **EIP-7702 & Forensics:** `POST /v1/chain/evm/eip7702-shield` ucu ve `inspect_eip7702_authorization` MCP aracı manifestolara detaylı olarak işlendi.
  - **MCP Konfigürasyonu:** Eski tsx geliştirme komutu kaldırıldı; yayındaki resmi npm paketi `npx -y @aipp/sovereign-node-mcp` ve uzaktan sıfır kurulumlu `https://node.sovroute.com/mcp` (günlük 15 ücretsiz test çağrısı) eklendi.
  - **Çapraz Referanslar & HTML Keşfi:** `node.sovroute.com` ve `sovroute.com` karşılıklı birbirinin `llms.txt` adresine tam referans verdi.

* **2. `node.sovroute.com` Frontend, 8 MCP Aracı ve Şema Güncellemesi:**
  - **Arayüz Senkronizasyonu:** `node.sovroute.com` web arayüzündeki (`engine-dashboard.view.ts`) tüm "Dual-Rail" metinleri `Triple-Rail (MPP + L402 + x402)` olarak değiştirildi; arayüzde sıfır kalıntı bırakıldı.
  - **8 Deterministik MCP Aracı:** MCP araç sayısı 7'den 8'e çıkarıldı (`inspect_eip7702_authorization`, `check_rbf_fraud_shield`, `get_next_block_xray`, `simulate_raw_transaction`, `get_bitcoin_smart_fees`, `get_mempool_entropy`, `verify_block_header`, `pay_lightning_invoice`).
  - **Uç Nokta Kartları & Filtreler:** `POST /v1/chain/evm/bytecode-risk-ml` (PyTorch ONNX) ve `POST /v1/omni/pay-lightning` (SUB-LIG Lightning köprüsü) kartları eklendi; filtre sekmeleri `All Endpoints (11)` ve `Cross-Chain Bridge (1)` olarak genişletildi.
  - **OpenAPI 3.1 & MCP Config:** `openapi.json` içine Triple-Rail ödeme sözleşmesi, `components.securitySchemes` (mppAuth, l402Auth, x402Auth) ve `/v1/omni/pay-lightning` eklendi; `mcp-config.json` 8 aracın tümüyle canlıda doğrulandı.
  - **Canlı Dağıtım:** Tailscale (`100.95.119.88:3088`) üzerinden `/srv/sovereign-node-engine` derlendi ve `sovereign-node-engine.service` yeniden başlatıldı.
  - **Maliyet ve İhlal Kontrolü:** 0.00\$ harcama kuralına ve Frozen Core dokunulmazlığına eksiksiz uyuldu.

---

## 21. 📡 22 KASIM 2026 (GECE) — ZERO-WAIT IN-MEMORY MARKET ORACLES & VERİ GÜVENLİĞİ KALKANLARI

* **Amaç & Felsefe:** $0/ay ek veri maliyetiyle ücretsiz açık borsa/tahmin/opsiyon WebSocket akışlarını Hetzner sunucusunda sürekli RAM'de işleyip ajanlara `< 2 ms` hesaplama süresiyle karar sinyali satmak (ve **Route402** `Data & Market Oracles` kategorisine eklemek).
* **Eklenen 4 Yeni Canlı Üçlü-Ray (MPP + L402 + x402) Uç Nokta:**
  1. `GET /v1/intel/microstructure?symbol=BTC|ETH|SOL` (`3 sats` / `$0.003`): Binance Futures, Bybit V5 Linear, OKX Swap (`ctVal` kontrat çarpanı düzeltmeli) ve Hyperliquid açık WS akışlarından `orderbookImbalance`, `crossExchangeSpreadBps`, `cvd1mUsd` / `cvd5mUsd`, `avgFundingRateBps` ve `liquidationCascadeScore (0–100)`.
  2. `GET /v1/intel/polymarket-edge?asset=BTC|ETH|SOL` (`4 sats` / `$0.004`): Polymarket Gamma Crypto Events (`tag_slug=crypto`) + CLOB WebSocket canlı olasılık/derinliği ile 4-borsa canlı spot referansı.
  3. `GET /v1/intel/funding-arb?symbol=BTC|ETH|SOL` (`3 sats` / `$0.003`): Binance Spot WS (`@bookTicker`) + perp fonlama oranlarından spot–perp baz (`basisBps`), 8s fonlama APR ve en iyi carry arbitraj çifti (`bestCarry`).
  4. `GET /v1/intel/options-skew?asset=BTC|ETH` (`4 sats` / `$0.004`): Deribit Public WS (`deribit_volatility_index.*`) üzerinden canlı `DVOL` + rejim (`CALM | ELEVATED | PANIC`) ve opsiyon zincirinden ATM IV, OTM put-call skew ile OI oranı.
* **Eklenen 3 Veri Güvenliği Kalkanı:**
  - **WS Frame Boyut Limiti & Zombie Watchdog (`ws-reconnect.helper.ts`):** `65_536` (CLOB için `262_144`) karakter tavanı ve 30–60 sn mesaj gelmeyen donmuş soketleri zorla kapatıp yeniden bağlayan `10 sn` watchdog.
  - **Medyan + Outlier Filtresi (`computeRobustMidPrice`):** Düz ortalama yerine medyan ve `> %1.5` sapan hatalı borsa tick'lerini dışlayan `outlierSources` filtresi.
  - **Pre-Payment `503` Freshness Guard (`market-intel.controller.ts`):** Akışlar soğuk/eksikken (`< 2` borsa, `0` Polymarket veya `dvol === null`) ödeme kesmeden `Retry-After` ile `503` döner.
* **Doğrulama & Canlı Sunucu Durumu (`root@100.95.119.88:/srv/sovereign-node-engine`):**
  - `npm run build` (`tsc`) temiz, `tests/market-intel.test.ts` **7/7 PASS**. *(Not: Mevcut `tests/live-node.test.ts:253` içindeki eski `X-Payment-Requirements` header beklentisi güncellenmeyi bekliyor.)*
  - `sovereign-node-engine.service` `active`: `https://node.sovroute.com` HTML dashboard (`All Endpoints (15)`, `Market Oracles (4)`), `openapi.json`, `/llms.txt` güncel ve 4 yeni uç canlıda `402` (`DOGE` için `400`) dönüyor.
  - **Route402** (`C:\dev\route402`) doğrulama skoru: **100 / 100** (`13` canlı uç kataloğa eklendi).
* **Sıradaki 3 Uç Adayı:** `GET /v1/intel/stablecoin-peg`, `GET /v1/chain/evm/gas-pulse`, `GET /v1/chain/btc/whale-tape` (yerel `sovereign-bitcoind` ZMQ `rawtx`).

---

## 22. ⚡ 22 KASIM 2026 (20:50 TSİ) — 3 ZERO-WAIT WS/ZMQ ORACLE & PHASE 2 CANLI DAĞITIMI

* **Phase 2 & İç Köprü Senkronizasyonu (`node.sovroute.com`):**
  - `CORE_BRIDGE_KEY` korumalı `/internal/core/btc-fees`, `btc-tip` ve `lightning-stats` canlıda doğrulandı (`sovereign-bitcoind` v31.1 & `sovereign-lnd` v0.21.3).
  - `REDIRECT_HTML_TO_URL=https://sovroute.com/` eklendi: Tarayıcı `Accept: text/html` kök istekleri `302` ile `https://sovroute.com/` adresine yönlendirilir; JSON/API/MCP rotaları aynen kalır.
  - `tests/live-node.test.ts` Multi-Rail header beklentisi güncellendi.
* **Eklenen 3 Yeni Zero-Wait WS/ZMQ Oracle Ucu (Canlıda `node.sovroute.com` & `sovroute.com`):**
  1. `GET /v1/intel/stablecoin-peg?symbol=USDC|USDT|USDE|DAI` (`2 sats` / `$0.002`): Kraken v2, Coinbase ve Binance Spot açık WS akışlarından medyan peg sapması (`deviationBps`) ve depeg risk skoru.
  2. `GET /v1/chain/evm/gas-pulse?chain=ethereum|base|arbitrum` (`2 sats` / `$0.002`): PublicNode `eth_subscribe newHeads` (`BigInt` wei→gwei) + EIP-4844 `blobBaseFeeGwei` ve 12 blokluk trend.
  3. `GET /v1/chain/btc/whale-tape?minBtc=10&limit=25` (`3 sats` / `$0.003`): Yerel `sovereign-bitcoind` (`10.240.10.2:28333`) ZMTP/3.0 `SUBSCRIBE rawtx` akışından `>= 1 BTC` SegWit/legacy ham işlem çözücü.
* **Doğrulama & Canlı Sunucu Durumu (`root@100.95.119.88:/srv/sovereign-node-engine`):**
  - Yedekler: `/var/backups/sne-phase2-backup-20261122.tar.gz`, `/var/backups/sne-oracle-feeds-backup-20261122.tar.gz`.
  - Yerel testler: `npm run build` ve `6/6` test paketi (**84/84 test** PASS). Sunucuda `npm run build` + `tests/oracle-feeds.test.ts` (**4/4 test** PASS), `sovereign-node-engine.service` `active`.
  - Canlı doğrulama: 3 uç hem `https://node.sovroute.com` hem `https://sovroute.com` üzerinden `402` (geçersiz parametreler `symbol=INVALID`, `chain=solana`, `minBtc=-5` için ödeme öncesi `400`), `openapi.json` + `llms.txt` güncel, **402 Audit**: `node.sovroute.com` **100/100**, `sovroute.com` **90/100**.

