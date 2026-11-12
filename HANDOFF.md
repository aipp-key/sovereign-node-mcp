# 🚀 SOVEREIGN NODE ENGINE — DEVİR TESLİM VE STRATEJİK YOL HARİTASI (HANDOFF)

**Son Güncelleme:** 7 Kasım 2026 (Cumartesi) — Pazartesi Lansmanına Hazır  
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

## 3. 📅 12 KASIM 2026 (PERŞEMBE) EYLEM PLANI: TaskFuel / Moritz Kaminski İletişimi

### 🎯 Kritik Stratejik Kararlar (9 Kasım 2026):
1. **Sıfır Çakışma İlkesi (Zero-Conflict):** Mevcut `sovroute.com` uçları (`/v1/chain/btc/fees` ve `/v1/chain/btc/tip`) TaskFuel kataloğunda zaten aktiftir. Bu nedenle `node.sovroute.com` tarafındaki `/fees` veya `/block` uçları kesinlikle teklife konulmayacak, çakışma riski sıfıra indirilecektir.
2. **Yalnızca 3 Adli Bilişim (Forensics & Simulation) Ucu Sunulacak:**
   - `GET /v1/chain/btc/rbf-shield/{txid}` (0-Conf BIP-125 RBF Double-Spend Fraud Shield)
   - `GET /v1/chain/btc/next-block-xray` (Live Miner Candidate Block Template X-Ray & Queue Rank)
   - `POST /v1/chain/btc/simulate-tx` (Zero-Broadcast Bitcoin Core v31.1 Consensus Simulator)
3. **Sadece Dual-Rail (Base USDC + Native L402 Sats):** Omni-Rail (Solana, Multi-EVM) pazar yeri karmaşıklığı yaratmamak ve SovRoute'un ana Bitcoin/Lightning uzmanlık kimliğini sulandırmamak amacıyla bu teklife dahil edilmemiştir; iç altyapıda hazır tutulmaktadır.
4. **Pazar Üstünlüğü Tespiti:** TaskFuel'deki rakipler (Glassnode, 2s.io, Otto AI, BlockRun, OneSource) 9 Kasım 2026'da canlı olarak sorgulanmış ve ekosistemde **Lightning Network (L402 / Satoshis) desteğinin %0 olduğu** doğrulanmıştır. `node.sovroute.com` bu alanda ilktir.

### ✉️ Perşembe Günü Gönderilecek İngilizce Mesaj:

> **Subject:** Re: SovRoute & TaskFuel — Following up from X / Endpoints
>
> Hi Moritz,
>
> Glad you liked the integration!
>
> While running our own autonomous agent workloads against SovRoute, we identified two critical blind spots for agents interacting with Bitcoin:
> 1. **0-Conf Double-Spend Exposure:** Autonomous agents accepting or routing unconfirmed transactions had no real-time oracle to detect BIP-125 RBF replacements, mempool fee snipes, or risky unconfirmed ancestor chains.
> 2. **The Missing Lightning Settlement Rail:** Even though AI agents operate on sub-cent micro-queries, virtually every provider in the space settles strictly in Base USDC. Paying 1–5 sats directly over Lightning felt vastly more native for Bitcoin workflows.
>
> To solve this, we spun up our dedicated bare-metal Bitcoin Core v31.1 engine at **`https://node.sovroute.com`** featuring **Dual-Rail settlement (Base USDC x402 + Native Lightning L402 Satoshis)** on the very same 402 challenge:
>
> • `GET https://node.sovroute.com/v1/chain/btc/rbf-shield/{txid}`
>   0-Conf BIP-125 RBF Double-Spend Fraud Shield ($0.005 Base USDC / 5 sats L402)
>
> • `GET https://node.sovroute.com/v1/chain/btc/next-block-xray`
>   Live candidate block template inspector (rank-in-block & cutoff fee rate via getblocktemplate)
>
> • `POST https://node.sovroute.com/v1/chain/btc/simulate-tx`
>   Zero-broadcast Bitcoin Core v31.1 consensus & script dry-run simulator
>
> • OpenAPI 3.1 Spec (x-payment-info compliant): https://node.sovroute.com/openapi.json
> • LLM & Agent Manifest: https://node.sovroute.com/llms.txt
>
> Our existing `sovroute.com` endpoints (`/fees` and `/tip`) in the TaskFuel catalog remain 100% untouched. We would love to add these 3 forensics endpoints to SovRoute's listing on TaskFuel so agents can settle via either Base USDC or native Sats.
>
> What do you think?
>
> Best regards,
> Faruk
> SovRoute Core

---

## 4. Gece / Hafta Sonu Pasif Mod Komutları (İsteğe Bağlı)

* **Pasife Alma (Kapatma):**
  `ssh root@100.95.119.88 "mv /etc/dokploy/traefik/dynamic/node-sovroute.yml /etc/dokploy/traefik/dynamic/node-sovroute.yml.disabled"`
* **Aktife Alma (Açma):**
  `ssh root@100.95.119.88 "mv /etc/dokploy/traefik/dynamic/node-sovroute.yml.disabled /etc/dokploy/traefik/dynamic/node-sovroute.yml"`

---

## 5. 🔴 YARIN YAPILACAK RED-TEAM & SERT STRES TESTLERİ (`tests/red-team-stress.test.ts` + Canlı Test)

1. **Kriptografik Sahtecilik & Ödeme Atlatma (Payment Bypass / Spoofing):**
   * **Düşük Tutarlı (Underpayment) İşlem Saldırısı:** Base/Arbitrum'da `300 Gwei` yerine `1 Wei` veya Solana'da `10,000 lamport` yerine `100 lamport` gönderilmiş işlemle geçiş denemesi → `402 Insufficient Transfer Amount`.
   * **Başka Alıcıya Gönderilmiş Gerçek TX Saldırısı:** Alıcısı bizim kasamız (`0x488c...` / `J7gD...`) olmayan gerçek bir blokzincir işlemiyle geçiş denemesi → Reddedilme doğrulaması.
   * **Eşzamanlı Çifte Harcama (50x Paralel Race-Condition Replay Attack):** Tek bir geçerli ödeme imzasını `Promise.all` ile aynı milisaniyede 50 paralel istekte gönderme → Sadece **1 adet `200 OK`**, **49 adet `402 Replay Rejected`**.
   * **Macaroon İmza & Caveat Manipülasyonu:** Base64 macaroon içeriğindeki `price_sats` veya `expires_at` değerini değiştirip aynı imzayla gönderme → `timingSafeEqual` reddi.

2. **`POST /v1/omni/pay-lightning` (SUB-LIG Köprüsü) Kasa Koruma & Canlı Köprü Testi:**
   * **Limit Aşımı (`> 25 Sats`) & Bozuk Fatura Saldırısı:** `26 sats`, `1000 sats`, tutarsız (amountless) veya Testnet (`lntb...`) faturalarının ödeme öncesi **`400 Bad Request`** ile reddedilmesi.
   * **Canlı Arbitrum/Base → Lightning Mainnet Ödeme Testi:** Gerçek `5 sats` BOLT-11 faturasını `/omni-test` üzerinden MetaMask (Arbitrum/Base ETH) ile ödeyip Phoenixd düğümümüzün faturayı kapatarak canlı `paymentPreimage` döndürmesi.

3. **`POST /v1/chain/btc/simulate-tx` Fuzzing & Command Injection Testi:**
   * Aşırı büyük (DoS), tek karakter eksik veya `; rm -rf /` / `$(whoami)` enjeksiyonlu girdilerin SSH/Docker katmanına ulaşmadan **`400 Bad Request`** ile kesilmesi.
   * Harcanmış/olmayan UTXO kullanan ham işlemin `consensusAllowed: false` (`missing-inputs`) döndürmesi.

4. **Canlı Bitcoin Mempool Uç Durum (Edge-Case) Yakalama Testi:**
   * Canlı mempool'dan gerçekten `bip125-replaceable: true` sinyali veren bir işlemi otomatik bulup `/rbf-shield/:txid` üzerinde `HIGH_RISK_RBF_ENABLED` sonucunu doğrulama.
   * Mempool'un en düşük ücretli işlemini bulup `/next-block-xray/:txid` üzerinde `QUEUED_FOR_LATER_BLOCK` kararını doğrulama.

5. **100x Eşzamanlı Ajan Yük & Gecikme (Load Benchmark) Testi:**
   * 100 paralel istekle `/next-block-xray` ve `/mempool` uçlarına yüklenip `< 2ms` önbellek yanıt süresi ve `%0` hata oranı (`0% 5xx`) doğrulaması.

---

## 6. 📦 TaskFuel'a Sunulacak 5 Benzersiz `node.sovroute.com` Uç Noktası Özeti
*(Mevcut `sovroute.com` üzerindeki 3 uç noktayla çakışmayan, %100 `x402 Base USDC` + `L402` uyumlu paket)*
1. `GET /v1/chain/btc/rbf-shield/{txid}` (`$0.005` / `5 sats`) — 0-Conf BIP-125 RBF Double-Spend Fraud Shield
2. `GET /v1/chain/btc/next-block-xray?txid={txid}` (`$0.003` / `3 sats`) — Live Next-Block Miner Template X-Ray (`getblocktemplate`)
3. `POST /v1/chain/btc/simulate-tx` (`$0.005` / `5 sats`) — Zero-Broadcast Bitcoin Consensus & Script Dry-Run Simulator (`testmempoolaccept`)
4. `GET /v1/chain/btc/mempool` (`$0.002` / `2 sats`) — Deep Mempool Entropy & Congestion Engine
5. `POST /v1/omni/pay-lightning` (`$0.025` / `25 sats`) — SUB-LIG Walletless Cross-Chain Lightning Bridge
