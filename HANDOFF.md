# 🚀 SOVEREIGN NODE ENGINE — DEVİR TESLİM VE PROJE RAPORU (HANDOFF)

**Tarih:** 5 Kasım 2026  
**Yerel Dizin:** `C:\Users\faruk\Desktop\dev\sovereign-node-engine`  
**Canlı Sunucu Dizini:** `/srv/sovereign-node-engine` (`100.95.119.88:3088` - Tailscale)  
**Özel Git Deposu (Gitea):** `http://100.95.119.88:3030/aipp/sovereign-node-engine`  

---

## 1. Projenin Amacı ve Stratejik Hedefleri
Bu proje, AI Agent ekonomisi (TaskFuel, Alby, Claude, Cursor, otonom ticaret botları) için üçüncü parti RPC sağlayıcılarına (Infura, Alchemy, Mempool.space) bağımlı olmadan, **kendi adanmış sunucumuzdaki bare-metal Bitcoin Core (v31.1) ve Phoenixd Lightning düğümümüzün kriptografik gerçeğini** L402 ve x402 ödeme raylarıyla satışa sunan, ultra düşük gecikmeli kurumsal bir orakıl (oracle) ve mutabakat motorudur.

* **Sıfır Güven (Zero-Trust):** Girdi ve çıktılar Zod şemaları ve tamsayı `Satoshi` tipleri ile doğrulanır; IEEE-754 kayan noktalı sayı hataları engellenmiştir.
* **Üç Katmanlı Mimari (Clean 3-Tier):** Controller (HTTP/MCP) $\rightarrow$ Service (İş Mantığı) $\rightarrow$ Adapter/Gateway (RPC/Lightning/EVM).
* **Doğrudan Cüzdan Entegrasyonu:** Hizmet çağrısı karşılığında tahsil edilen satoshiler doğrudan sunucudaki `phoenixd` cüzdanına yatar.

---

## 2. Mevcut SovRoute (`sovroute.com`) ile Yeni Motorun Karşılaştırması

| Kriter | Mevcut `sovroute.com` (Cloudflare Edge) | Yeni `sovereign-node-engine` (Bare-Metal Sunucu) |
| :--- | :--- | :--- |
| **Ödeme Rayı** | Yalnızca Base L2 (`x402` - 0.001 USDC) | **Çift Ray: Hem Bitcoin Lightning (L402 Sats) hem Base USDC (HTLC Cross-Rail)** |
| **Düğüm Gücü** | Genel/harici veri yansıtıcı | **Sunucudaki yerel `bitcoind:31.1` ve `phoenixd:9740` (0.04 ms bellek önbelleği)** |
| **0-Conf RBF Kalkanı** | ❌ Yok | **✅ Var (`/v1/truth/rbf-shield/:txid`) — BIP-125 çift harcama dolandırıcılık koruması** |
| **Derin Mempool Analizi** | ❌ Basit ücret tahmini | **✅ Var (`/v1/truth/mempool`) — 63K+ tx, 33MB sanal boyut ve 22M+ sat madenci havuzu** |
| **LLM / Agent Standardı** | Sadece cURL / HTTP | **✅ Model Context Protocol (MCP) — Claude Desktop, Cursor ve TaskFuel için tek tıkla tool** |
| **Otonom İstemci** | Manuel ödeme | **✅ Var (`AutonomousL402Agent`) — İnsan müdahalesi olmadan saniyede ödeyip veriyi alan ajan** |

---

## 3. Şu Ana Kadar Yapılanlar ve Doğrulanan Başarılar

1. **Bare-Metal Bitcoin Core 31.1 Entegrasyonu:**
   * `estimatesmartfee` ile anlık sat/vB ücret projeksiyonları.
   * `getmempoolentry` ve `getmempoolinfo` ile canlı mempool analizi.
   * `getbestblockhash` ve `getblockheader` ile blok yüksekliği ve doğrulaması.
   * **In-Memory Cache:** Node'u korumak için 0.04 milisaniyede dönen sıcak önbellek katmanı.

2. **Kriptografik L402 Middleware & Phoenixd Ödeme Doğrulaması:**
   * SHA-256 tabanlı macaroon ve fatura üreteci.
   * **Canlı Mobil Cüzdan Testi:** Kullanıcı mobil Lightning cüzdanından 4 farklı 5 satoshilik faturayı QR kod okutarak ödedi; Phoenixd bakiyesi 15.546'dan 15.566 satoshiye yükseldi.
   * Canlı Bitcoin Mainnet'te işlem gören `47ed5eebcd...` txid'si taranarak BIP-125 RBF ve 140 sat/vB oranının mempool.space ile %100 uyuştuğu kanıtlandı.

3. **%100 Otonom Ajan Döngüsü (Zero Human in the Loop):**
   * `scripts/run-fully-autonomous-agent.ts` çalıştırıldı.
   * Ajan HTTP 402 meydan okumasını yakaladı, Phoenixd üzerinden faturayı programatik olarak saniyede ödedi, `preimage` ile kimliğini doğruladı ve veriyi 1.2 saniyede çekip ajan bağlamına teslim etti.

4. **Model Context Protocol (MCP) Sunucusu:**
   * `@modelcontextprotocol/sdk` kullanılarak 5 adet yerel LLM aracı (`get_bitcoin_smart_fees`, `check_rbf_fraud_shield`, `get_mempool_entropy`, `verify_block_header`, `pay_lightning_invoice`) tanımlandı.
   * `npm run mcp` veya Claude/Cursor entegrasyonu hazırlandı.

5. **Alby Hub & NWC (NIP-47) Payer Adaptörü:**
   * `src/infrastructure/alby/nwc-payer.adapter.ts` eklendi.
   * TaskFuel ve Alby Hub kullanıcılarının `nostr+walletconnect://` bağlantı adreslerini doğrudan bağlayabilmesi sağlandı.

6. **Base L2 Cross-Rail HTLC Sözleşmesi:**
   * `contracts/CrossRailHTLC.sol` yazıldı. EVM `0x02` SHA-256 precompile ile Lightning ödeme özetleri (payment hash) 1:1 hizalandı.
   * `src/infrastructure/evm/base-htlc.adapter.ts` ile Viem tabanlı calldata üretim ve doğrulama motoru eklendi.

7. **Tam Test Kapsamı & Canlı Dağıtım:**
   * Toplam **13 otomatik testin 13'ü de başarıyla geçmektedir** (`npm test`).
   * Sunucuda `/srv/sovereign-node-engine` altında `sovereign-node-engine.service` systemd servisi olarak aktif çalışıyor.
   * Masaüstüne `C:\Users\faruk\Desktop\dev\sovereign-node-engine` olarak taşındı.
   * Sunucumuzdaki özel **Gitea** Git platformuna ilk repo olarak yüklendi (`http://100.95.119.88:3030/aipp/sovereign-node-engine`).

---

## 4. Nerede Kaldık? (Mevcut Durum)
* Proje şu an tamamen çalışan, test edilmiş, taşınmış ve Git'e yedeklenmiş kararlı (stable) bir duraklama noktasındadır.
* Mevcut TaskFuel uçlarına (`sovroute.com/v1/chain/btc/...`) **hiçbir şekilde dokunulmamış**, sıfır kesinti ve sıfır risk ilkesi korunmuştur.

---

## 5. Sıradaki Yapılacaklar Listesi (Next Steps)

1. **SovRoute Ağ Geçidi Yönlendirmesi (Entegrasyon Fazı):**
   * Kullanıcı onayı alındığında, `sovroute.com` API ağ geçidine 2 yeni uç eklenecek:
     * `GET /v1/chain/btc/rbf-shield/:txid`
     * `GET /v1/chain/btc/mempool`
   * Bu rotalar sunucumuzdaki `sovereign-node-engine` servisine proxy edilecek.

2. **`llms.txt` ve Dokümantasyon Güncellemesi:**
   * `https://sovroute.com/llms.txt` dosyasına yeni güvenlik kalkanı ve mempool entropisi uçları eklenecek.

3. **TaskFuel / Alby (Moritz Kaminski) Kataloğuna Sunum:**
   * TaskFuel kataloğuna: *"SovRoute Core: 0-Conf RBF Güvenlik Kalkanı ve Derin Mempool Entropisi eklendi + Native Lightning L402 desteği devrede"* güncellemesi sunulacak.

4. **Claude / Cursor İçin Hazır MCP Yapılandırması:**
   * Geliştiricilerin masaüstü yapay zekalarında kullanabilmesi için örnek bir `mcp_config.json` şablonu dokümante edilecek.
