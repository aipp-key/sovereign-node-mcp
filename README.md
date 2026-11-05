# Sovereign Node Engine (Egemen Düğüm Motoru)

> **Zero-Trust Sovereign Node Intelligence & Cross-Rail L402 Settlement Engine for AI Agents**  
> *Aligned with Alby Hub, NWC (NIP-47), and TaskFuel Ecosystems*

---

## 🏛️ Mimari Vizyon ve Konumlandırma

Bu motor, yapay zeka ajanları için **merkeziyetsiz, sansürlenemez ve doğrulanabilir** bir veri ve mutabakat omurgasıdır.

* **Alby & TaskFuel İle Simbiyotik İlişki:**
  * TaskFuel'e rakip bir pazar yeri değil; TaskFuel kataloğuna ve Alby ajanlarına giren **birinci sınıf "Egemen Veri Sağlayıcısı" (Sovereign Node Intelligence Provider)**.
  * Alby Hub (`hub.aipp.dev`) ve Nostr Wallet Connect (NWC) standartlarıyla yerel entegre.
  * Ajanların emanetçi (custodial) yapılardan kurtulup **L402 mikro-ödemeleri** ile saniyelik satoshiler karşılığında doğrudan bare-metal Bitcoin Full Node'undan gerçeklik satın almasını sağlar.

---

## 🛠️ Katmanlı Mimari (Strict 3-Tier Clean Architecture)

```
[ Domain Layer ] (Pure Business Rules, Zero-Trust Zod Schemas, Atomic Satoshis)
       ▲
       │
[ Application Layer ] (L402 Verification, Node Truth Orchestration, DTOs)
       ▲
       │
[ Infrastructure & Transport Layer ] (Bitcoin Core 31.1 RPC, LND 0.21.3 gRPC, Express L402 Middleware)
```

1. **Domain Katmanı (`src/domain`):**
   * Hiçbir harici framework'e bağımlı olmayan saf TypeScript tipleri.
   * `Satoshi` branded primitive (Kayan noktalı sayı yasağı, atomik tam sayılar).
   * L402 Challenge, Macaroon Caveats ve Verifiable Node Attestation Zod şemaları.
2. **Application Katmanı (`src/application`):**
   * `L402Service`: SHA-256 Preimage doğrulaması (`H = SHA-256(R)`) ve meydan okuma orkestrasyonu.
   * `NodeTruthService`: Mempool entropisi ve blok başlığı veri akışı.
3. **Infrastructure & Transport Katmanı (`src/infrastructure`, `src/interfaces`):**
   * `BitcoinRpcAdapter`: Tailscale üzerinden bare-metal `sovereign-bitcoind:31.1` RPC entegrasyonu.
   * `LndGatewayAdapter`: `sovereign-lnd:0.21.3` fatura oluşturma ve mutabakat kontrolü.
   * `createL402Middleware`: HTTP 402 Payment Required protokol middleware'i.

---

## ⚡ Canlı Uç Noktalar (Endpoints)

| Endpoint | Erişim | Protokol | Açıklama |
| :--- | :--- | :--- | :--- |
| `GET /health` | Herkese Açık | JSON | Düğüm ve servis sağlık durumu |
| `GET /v1/truth/mempool` | L402 Korumalı (5 sats) | HTTP 402 / BOLT-11 | Canlı Mempool Entropisi (Tx sayısı, Vsize, Sıkışıklık Seviyesi) |
| `GET /v1/truth/block` | L402 Korumalı (5 sats) | HTTP 402 / BOLT-11 | Bitcoin Mainnet güncel blok başlığı ve hash verisi |
| `GET /v1/truth/topology` | L402 Korumalı (10 sats) | HTTP 402 / BOLT-11 | Lightning Network dedikodu ve rotalama topolojisi |

---

## 🧪 Testler ve Doğrulama

```bash
# Tüm birim ve canlı düğüm testlerini çalıştır:
npm test
```

* Tüm testler sıfır hata ile geçmektedir (Zod doğrulamaları + Tailscale üzerinden canlı Bitcoin Core Mainnet sorguları).
