# 🛡️ SOVEREIGN NODE ENGINE — TEMEL FELSEFE, MİMARİ VE YÖNETİŞİM STANDARTLARI (SOVEREIGN STANDARDS)

> **"Do Not Trust, Verify."**  
> Bu belge, SovRoute ve Sovereign Node Engine altyapısının değişmez mühendislik ilkelerini, güvenilirlik standartlarını, pazar izleme rutinlerini ve otonom Hermes gözetleme ajanının çalışma prensiplerini belirler.

---

## 🏛️ 1. TEMEL FELSEFE & MARKA İTİBARI (CORE CREED)

1. **Mutlak Gerçeklik (Ground Truth over Wrappers):**  
   Piyasadaki yüzeysel üçüncü parti API sarmalayıcılarının (wrappers) aksine, SovRoute sunduğu her bayt veriyi Hetzner bare-metal sunucusundaki kendi **Bitcoin Core v31.1** tam düğümünden ve canlı mempool'undan çıkarır.
2. **Ödeme Tarafsızlığı (Rail Neutrality):**  
   Yapay zeka ajanları finansal olarak sınırlanamaz. İstemci hangi ödeme rayını taşırsa taşısın (**Native Lightning L402 Satoshis**, **Base USDC x402**, **Solana**, **Multi-EVM**), eşit hız ve güvenilirlikle karşılanır.
3. **Sıfır Mağduriyet İlkesi (Bulletproof SLA & Zero Failures):**  
   Bir insan sayfayı yenileyebilir, ancak bir otonom ajan hata aldığında kilitlenir. Kriptografik ödeme doğrulanmışsa, veri her koşulda teslim edilir. Olası 5xx/RPC aksamalarında `Retry-Voucher` ve `Idempotent Recovery` devreye girerek ajanın bakiyesini korur.
4. **Radikal Çeviklik (Extreme Adaptability):**  
   Ekosistem standartları (MCP, x402, HTTP 402, EIP-3009, NIP-90) değiştikçe ilk adapte olan ve öncülük eden altyapı SovRoute'tur.

---

## ⚙️ 2. OPERASYONEL SAĞLIK & MİMARİ STANDARTLAR

| Standart | Hedef Metrik | Uygulama & Güvence |
| :--- | :--- | :--- |
| **Önbellek Gecikmesi** | `< 0.05 ms` | In-memory bellek tamponu (RPC yükünü sıfırlama) |
| **Uptime (Erişilebilirlik)** | `%99.95+` | Uptime Kuma + Dokploy + Traefik v3 ters proxy |
| **Hata Yönetimi** | `%0 5xx Sızıntısı` | Ödeme öncesi Zod/Pydantic şema doğrulaması (`400 Bad Request`) |
| **Replay & Forgery Koruması** | Cryptographic Zero | HMAC-SHA256 sabit süreli (`timingSafeEqual`) ve 300s kayma penceresi |
| **Hassas Veri / Secret Koruması**| Sıfır Plaintext | Kod ve markdown repolarına asla düz metin secret girilmez; `.env` izole tutulur |

---

## 🌐 3. AKTİF PAZAR YERİ & DİZİN PORTFÖYÜ

Düğümümüzün 7/24 taranması ve varlığının korunması gereken resmi merciler:

1. **TaskFuel (`taskfuel.ai`):** Moritz Kaminski / Alby ekosistemi (Kategori: Crypto & Read Blockchain).
2. **Circle Agent Marketplace (`agents.circle.com`):** Resmi USDC Ajan Kataloğu (100/100 Grade A skor).
3. **Glama.ai (`glama.ai/mcp/servers/sovereign-node-mcp`):** Ekosistemin 1 numaralı açık kaynak MCP kataloğu (Doğrulanmış açık kaynak).
4. **Global Agentic Market Exchange (`agenticmarket.exchange`):** Founder #1 tescilli dijital API listelemesi (`e0bee9b5-8576-44a9-83bb-35981957c9de`).
5. **Satring Directory (`satring.com/services/sovereign-node-engine`):** L402 / WebLN doğrulanmış yeşil kalkan rozeti (`#1097`).
6. **npm Registry (`@aipp/sovereign-node-mcp`):** Global stdio paket dağıtımı (`npx -y @aipp/sovereign-node-mcp`).

---

## 🤖 4. HERMES HAFTALIK GÖZETLEME & AR-GE AJANI (HERMES SENTINEL)

Sunucumuzda (`100.95.119.88:8642`) 7/24 çalışan **Hermes Otonom Ajanı**, her **Pazartesi sabahı 08:30 TSİ**'de otomatik olarak uyanır ve şu 4 aşamalı istihbarat döngüsünü yürütür:

### Döngü 1: Pazar Yeri & Rakip İstihbaratı
* TaskFuel, Glama, Satring ve Agentic Market üzerindeki sayfalarımızın ayakta olduğunu ve rozetlerinin korunduğunu doğrular.
* "Read the blockchain" ve "Bitcoin" kategorisindeki rakipleri tarar (fiyat kıyaslaması, yeni eklenen rakip endpoint'ler).

### Döngü 2: Teknik Radar & Standartlar Taraması
* MCP (Model Context Protocol) resmi spesifikasyonundaki güncellemeleri tarar.
* x402 Foundation ve Circle Gateway nanopayment protokollerindeki yenilikleri raporlar.
* Bitcoin Core (`v31.x` / `v32.x`) yeni RPC yeteneklerini ve mempool politika değişikliklerini kontrol eder.

### Döngü 3: Sağlık ve SLA Denetimi
* `node scripts/ecosystem-watchdog.mjs` taramasını tetikler.
* Son 7 günün ortalama gecikme sürelerini, başarılı ödeme sayılarını ve varsa hatalı istek loglarını özetler.

### Döngü 4: Telegram Yönetici Brifingi
* Elde edilen bulguları tek bir yapılandırılmış bülten halinde Telegram'a (`@SovRouteNotifyBot`) iletir:
  * `[SovRoute Hermes] Haftalık Ekosistem & Pazar İstihbarat Bülteni`
  * Önerilen aksiyonlar, yeni pazar yeri fırsatları veya yapılması gereken mimari güncellemeler.

---

## 🚀 5. GELECEK VİZYONU & TEKNOLOJİK YOL HARİTASI

* [ ] **Nostr DVM (NIP-90) Entegrasyonu:** Nostr ağı üzerindeki otonom ajanlara Lightning zap/fatura karşılığı doğrudan Bitcoin adli analiz sonuçları üreten bir DVM (Data Vending Machine) düğümü açmak.
* [ ] **Coinbase AgentKit Action Provider:** Base ekosisteminde çalışan on binlerce yapay zeka ajanının tek satırda ekleyebileceği `SovRouteActionProvider` kütüphanesini yayınlamak.
* [ ] **Circle Gateway Nanopayments:** $0.000001 (mikro-sent) düzeyindeki gas-free akıllı sözleşme ödemelerini destekleyen yeni Circle EIP-7702 standartlarına tam uyum sağlamak.
