# 🚀 SOVEREIGN NODE ENGINE — DEVİR TESLİM VE STRATEJİK YOL HARİTASI (HANDOFF)

**Tarih:** 5 Kasım 2026 / 6 Kasım 2026 Planı  
**Yerel Proje Dizini:** `C:\Users\faruk\Desktop\dev\sovereign-node-engine`  
**Canlı Sunucu Dizini:** `/srv/sovereign-node-engine` (`100.95.119.88:3088` - Tailscale)  
**Özel Git Deposu (Gitea):** `http://100.95.119.88:3030/aipp/sovereign-node-engine`  

---

## 1. Pazar Analizi & TaskFuel Rekabet İstihbaratı (152 Uç Nokta İncelemesi)

TaskFuel kataloğundaki *"Crypto & Prediction Markets -> Read the Blockchain"* kategorisinde yer alan 152 uç nokta ve 6 sağlayıcı (Glassnode, OneSource, Otto AI, 2s, BlockRun, SovRoute) detaylı olarak analiz edilmiştir:

### Piyasanın Durumu ve Rakiplerin Zayıf Noktaları:
1. **Aşırı Ethereum/Base Yoğunlaşması:** OneSource ve Otto AI neredeyse tamamen EVM/Base odaklıdır (`eth_*`, ERC-20, ENS, gas oracle). Bitcoin tarafında yoklar.
2. **Aşırı Yüksek Fiyatlandırma:** Glassnode makro metrikler için çağrı başına **5¢ ($0.05)** talep etmektedir.
3. **Yüzeysel ve Pahalı Bitcoin Verisi (2s.io):**
   * Listede Bitcoin'e dokunan tek sağlayıcı olan `2s.io`, çağrı başına **0.25¢ - 0.36¢** (SovRoute'un 0.1¢ fiyatının 3.5 katı) ücret almaktadır.
   * Kendi açıklamalarında `"(free/keyless)"` ibaresi yer almakta olup, kendi bare-metal düğümleri yerine halka açık üçüncü parti API'leri sarmaladıkları görülmektedir.
4. **Büyük Ödeme Rayı Açığı (Piyasanın Kör Noktası):**
   * TaskFuel'deki sağlayıcıların tamamı (`x402.ottoai.services`, `x402.glassnode.com`, `onesource.io`, `2s.io`) **yalnızca Base USDC (x402)** kabul etmektedir.
   * TaskFuel'in kurucusu **Moritz Kaminski (Alby ekibi)** olmasına rağmen, ekosistemde **Native Lightning Network (L402 Satoshis)** ile ödeme kabul eden neredeyse hiçbir sağlayıcı yoktur!

---

## 2. "Kopyacı Olmama" ve Stratejik Fark Yaratma İlkemiz

Piyasadaki `2s.io` gibi aktörleri taklit etmemek ve SovRoute'u benzersiz kılmak için şu 3 temel savunma hattı kurulmuştur:

1. **🛡️ 0-Conf RBF Dolandırıcılık Kalkanı (`/v1/chain/btc/rbf-shield/:txid`):**
   * 152 uç noktanın hiçbirinde **sıfır-onay (0-conf) güvenlik oraklı YOKTUR.**
   * Bir AI ajanı veya ticaret botu sıfır onaylı bir Bitcoin ödemesi aldığında, bu işlemin **BIP-125 Replace-By-Fee** ile çift harcanıp harcanamayacağını anında tespit eden sektördeki **TEK ORAKIL** biziz.
2. **⚡ Derin Mempool Entropisi & Tıkanıklık Motoru (`/v1/chain/btc/mempool`):**
   * Sıradan bir işlem sayısı yerine; 63.000+ bekleyen işlem, 33 MB blok yığılması, 22M+ satoshi madenci ücret havuzu ve dinamik **"Ağ Sıkışıklık Derecesi (LOW / MEDIUM / CRITICAL)"** sunulmaktadır.
3. **⚡ Çift Raylı Ödeme (Native L402 Lightning + Base USDC):**
   * Yalnızca Base USDC'ye sıkışmış rakiplerin aksine, Alby Hub ve Lightning cüzdanı olan tüm AI ajanlarına **L402 satoshi ile ödeme yapabilme özgürlüğü** sunarak pazardaki en büyük boşluğu kapatıyoruz.
4. **🏛️ Bare-Metal Düğüm Gücü:**
   * Verilerimiz harici API'lerden değil; sunucumuzda çalışan gerçek **Bitcoin Core v31.1 ve Phoenixd** düğümlerinden 0.04 ms in-memory önbellek hızıyla çekilmektedir.

---

## 3. Şu Ana Kadar Neler Tamamlandı?

* [x] **Bare-Metal RPC & Önbellek:** Bitcoin Core 31.1 `estimatesmartfee`, `getmempoolentry`, `getmempoolinfo` ve `getblockheader` 0.04ms önbellek ile bağlandı.
* [x] **Kriptografik L402 Katmanı:** SHA-256 macaroon ve preimage doğrulama middleware'i kuruldu.
* [x] **Canlı Ağda Gerçek Cüzdan Doğrulaması:** Mobil Lightning cüzdanından 4 fatura (20 sats) ödendi; Phoenixd bakiyesi arttı ve `47ed5eebcd...` txid'sinin mempool.space verileriyle %100 örtüştüğü kanıtlandı.
* [x] **%100 Otonom Ajan İstemcisi:** İnsan müdahalesi olmadan HTTP 402'yi yakalayıp 1.2 saniyede ödeyen ve veriyi alan ajan testi başarıyla çalıştırıldı.
* [x] **MCP (Model Context Protocol) Sunucusu:** LLM'lerin (Claude, Cursor, Antigravity) doğrudan çağırabileceği 5 araçlık MCP paketi inşa edildi.
* [x] **Alby NWC (NIP-47) Payer:** Dış ajanların kendi Alby Hub cüzdanlarını bağlayabilmesi için adaptör eklendi.
* [x] **Base L2 Cross-Rail HTLC:** `CrossRailHTLC.sol` sözleşmesi ve Viem adaptörü yazıldı.
* [x] **Tüm Testler Yeşil:** 13 otomatik testin 13'ü de hatasız geçti (`npm test`).
* [x] **Canlı Dağıtım & Yedekleme:** Sunucuda `sovereign-node-engine.service` çalışıyor, yerel proje `Desktop\dev\sovereign-node-engine` dizininde ve sunucudaki **Gitea** Git platformuna push edildi.
* [x] **Mevcut SovRoute Güvencesi:** Mevcut TaskFuel uçlarına (`sovroute.com/v1/chain/btc/...`) **sıfır müdahale** yapıldı, kesintisiz çalışmaya devam ediyor.

---

## 4. 📅 YARIN YAPILACAKLAR LİSTESİ (ACTIONABLE TO-DO)

Yarınki oturumda atılacak adımlar sırasıyla şunlardır:

### Adım 1: Yeni Uç Noktaların SovRoute Ağ Geçidine Eklenmesi
* Mevcut uçlara dokunmadan, API ağ geçidine 2 yeni uç rotası tanımlanacak:
  * `GET /v1/chain/btc/rbf-shield/:txid` (0-Conf Fraud Shield)
  * `GET /v1/chain/btc/mempool` (Mempool Entropy & Congestion)
* Bu rotalar, arka plandaki `100.95.119.88:3088` motorumuza bağlanacak.

### Adım 2: Çift Rayın (L402 Lightning + x402 Base) Canlıya Alınması
* Dönen HTTP 402 cevabında hem Base USDC (`x402`) hem de Phoenixd üzerinden anlık üretilen Lightning faturası (`L402`) birlikte sunulacak.
* Böylece hem EVM ajanları hem Lightning ajanları aynı ucu çağırabilecek.

### Adım 3: `sovroute.com` Vitrini ve `llms.txt` Güncellemesi
* `https://sovroute.com/llms.txt` dosyasına yeni RBF Güvenlik Kalkanı ve Mempool Entropisi uçları eklenecek.
* Landing page üzerindeki uç listesine bu iki yeni kabiliyet ve "Dual-Rail (Lightning + Base)" rozeti işlenecek.

### Adım 4: TaskFuel / Alby Ekibine (Moritz Kaminski) Bildirim & İletişim Stratejisi
* **Stratejik Giriş Tonu (Builder-First / Dogfooding):**
  Satış odaklı veya kurumsal bir baskı yerine, tamamen samimi bir geliştirici deneyimi üzerinden yaklaşılacak:
  > *"Selam Moritz! SovRoute tarafında işler harika gidiyor. Kendi AI ajanlarımı çalıştırırken bir şeyi fark ettim: Her mikro-sorguda Base ağında gaz ücreti ve blok beklemek yerine satoshi (Lightning) ile ödemek bana inanılmaz derecede pürüzsüz ve çok daha hesaplı geldi. Ben de doğrudan kendi iş akışım için SovRoute'a yerel bare-metal düğümümüz üzerinden hem Native L402 Lightning (Sats) rayını hem de ajanların 0-onaylı Bitcoin ödemelerinde çift harcama riskini önleyen 0-Conf RBF Kalkanı'nı ekledim. TaskFuel'deki mevcut Base USDC desteğini aynen korudum; ama sats harcamayı seven ajanlar için de bu seçeneği açmış oldum. TaskFuel kataloğundaki SovRoute listesini bu yeni yeteneklerle güncellemek isterim, ne dersin?"*
* Bu yaklaşım yarınki oturumda son rötuşlarıyla tekrar değerlendirilecek.

### Adım 5: Geliştiriciler İçin Tek Tıkla MCP Dağıtımı
* Claude Desktop ve Cursor kullanıcılarının SovRoute motorunu tek bir JSON satırıyla araç (tool) olarak ekleyebileceği `mcp_config.json` rehberi yayınlanacak.
