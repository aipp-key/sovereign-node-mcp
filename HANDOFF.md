# 🚀 SOVEREIGN NODE ENGINE — DEVİR TESLİM VE STRATEJİK YOL HARİTASI (HANDOFF)

**Son Güncelleme:** 14 Kasım 2026 (Cumartesi) — Nihai Sınır Durumları, Omni L402 Tek-Kullanım Kilidi, Bellek Budama & 42/42 Test Yeşil & Canlıya Alındı  
**Yerel Proje Dizini:** `C:\Users\faruk\Desktop\dev\sovereign-node-engine`  
**Canlı Sunucu Dizini:** `/srv/sovereign-node-engine` (`100.95.119.88:3088` - Tailscale)  
**Canlı Ağ Geçidi:** `https://node.sovroute.com`  
**Özel Git Deposu (Gitea):** `http://100.95.119.88:3030/aipp/sovereign-node-engine`  

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

### 🎯 Sıradaki Eylem Sırası:
1. **TaskFuel / Moritz Kaminski E-postası:** Hem Lightning hem Base USDC canlı cüzdan testleri %100 başarıyla kanıtlandığı ve Satring listelemesi tamamlandığı için Bölüm 3'teki dondurulmuş İngilizce e-posta Moritz'e gönderilmeye hazır.
2. **Diğer `x402` / `L402` / `MCP` Pazar Yerlerine Dağıtım:** TaskFuel sonrasında **Coinbase x402 Bazaar** (`/.well-known/x402` dahil), **x402.new**, **PayAI Network**, **Circle Agent Marketplace** ve **MCP dizinleri (`Smithery.ai`, `Glama.ai`)** kayıtları tamamlanacak.

---

## 6. 📦 TaskFuel'a Sunulacak 5 Benzersiz `node.sovroute.com` Uç Noktası Özeti
*(Mevcut `sovroute.com` üzerindeki 3 uç noktayla çakışmayan, %100 `x402 Base USDC` + `L402` uyumlu paket)*
1. `GET /v1/chain/btc/rbf-shield/{txid}` (`$0.005` / `5 sats`) — 0-Conf BIP-125 RBF Double-Spend Fraud Shield
2. `GET /v1/chain/btc/next-block-xray?txid={txid}` (`$0.003` / `3 sats`) — Live Next-Block Miner Template X-Ray (`getblocktemplate`)
3. `POST /v1/chain/btc/simulate-tx` (`$0.005` / `5 sats`) — Zero-Broadcast Bitcoin Consensus & Script Dry-Run Simulator (`testmempoolaccept`)
4. `GET /v1/chain/btc/mempool` (`$0.002` / `2 sats`) — Deep Mempool Entropy & Congestion Engine
5. `POST /v1/omni/pay-lightning` (`$0.025` / `25 sats`) — SUB-LIG Walletless Cross-Chain Lightning Bridge
