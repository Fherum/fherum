# FHERUM HEADLESS LENDING — Developer Brief (v0.1, draft)

| Field | Value |
|---|---|
| Brief ID | FHR-20261116-01 (v0.1, 16 Nov 2026) |
| Status | Draft untuk review Caesar. Belum ada kode |
| Sumber | Post X @Fherumfi 2122119786587156709 ("Introducing Headless Lending, coming to FHERUM") + key visual "HEADLESS LENDING on FHERUM" |
| Inspirasi | ATLAS (LayerZero), *headless exchange*: tanpa frontend sendiri; venue lain membangun UX di atas engine-nya. Kita membawa konsep yang sama ke **lending** |
| Chain | Robinhood Chain mainnet 4663 (satu chain, tanpa bridge) |
| Arahan PM | Fitur mengikuti key visual; boleh banyak data mock, asal dilabeli |

Label: [LIVE] sudah on-chain/live. [REAL-NEW] perlu dibangun, data asli. [MOCK] UI/preview dengan data contoh, wajib label "preview" atau "example".

---

## 0. Ringkasan

Headless Lending = FHERUM sebagai **engine lending tanpa kepala**. App lain (trading app, vault, wallet, agen AI) bisa memasang supply/borrow/market sendiri dengan UX mereka, sementara pool, risk, oracle, likuidasi, dan settlement tetap dijalankan kontrak FHERUM.

Kabar baiknya: sebagian besar engine-nya **sudah ada** di mainnet. Yang belum ada adalah *lapisan untuk builder*: SDK, halaman Build, widget embeddable, dan dokumentasi. Itu fokus brief ini.

Kalimat satu napas (EN): *FHERUM Headless Lending — the lending engine, without the frontend. Build your own lending experience on FHERUM's markets, risk and settlement.*

---

## 1. Peta fitur key visual → realita

| Kartu di gambar | Artinya untuk FHERUM | Komponen yang ada | Status |
|---|---|---|---|
| MODULAR — pick and compose lending components | Builder memilih modul: Markets, Hub credit, Oracle, Curator, HEARTH Hooks, LensReader | Market.sol, Hub, OracleAdapter, CuratorRegistry, HEARTH Hooks (14 hook), LensReader | [LIVE] kontrak; [REAL-NEW] katalog modul |
| CONFIGURABLE — your own markets, params, risk rules | Builder mengusulkan market + LTV/LT/cap; rule per user lewat Hook Stack | MarketFactory + AddMarket.s.sol (Safe + timelock 48h), HookRegistry stack | [LIVE] mekanisme; [MOCK] form "Request a market" (tidak deploy apa pun) |
| INTEGRATION-READY — build on FHERUM infra | SDK TypeScript + embed widget + docs | lib/chain.ts, action-panel, hooks-live.tsx (bisa diekstrak) | [REAL-NEW] |
| CROSS-ECOSYSTEM — interoperable with LayerZero | Lihat §4. Tidak ada integrasi LayerZero di repo | — | [BLOCKED] klaim perlu revisi |

How it works (4 kotak di gambar):

1. YOUR APP OR PLATFORM: trading app, vault, agen. [MOCK] galeri contoh integrasi (dilabeli "example integration").
2. FHERUM HEADLESS LENDING: engine (markets, risk, execution). [LIVE]
3. LAYERZERO INTEROPERABILITY: [BLOCKED], lihat §4. Usulan ganti: "ROBINHOOD CHAIN SETTLEMENT" (real, live).
4. YOUR LENDING MARKET: UX berbranding milik builder. [REAL-NEW] widget + theme token; [MOCK] 2–3 contoh white-label.

---

## 2. Scope build

### H-1. SDK `@fherum/headless` (REAL-NEW, P0)
- Read: `listMarkets()`, `getMarket(addr)` (rate, util, liquidity, caps via LensReader), `getPosition(market, user)`, `getOraclePrice(asset)`.
- Write builders (mengembalikan calldata/tx request, **tidak** menandatangani): `supply`, `withdraw`, `addCollateral`, `removeCollateral`, `borrow`, `repay`, plus `hearth.createAccount/applyStack/execute`.
- Viem-based, tanpa API key. RPC publik default; builder pakai RPC sendiri.
- Ekstrak dari `web/lib/chain.ts` + ABI action-panel agar tidak menulis dua kali. Taruh di `packages/headless/` (atau `web/lib/headless/` dulu bila monorepo belum siap).
- Uji: fork test read-only + unit test calldata (bandingkan dengan `cast calldata`).

### H-2. Halaman `/app/build` "Builder Console" (P0)
- Hero: diagram 4 kotak (§1), versi kita, tanpa logo pihak ketiga.
- Module picker: kartu Modular/Configurable/Integration-Ready dengan status live per modul + link Blockscout tiap kontrak (sumber alamat: `lib/deployments.ts`, tidak boleh ketik dari ingatan).
- Live engine stats [LIVE]: jumlah market, total supply, borrow, util, dibaca dari chain (pola existing; jangan await scan panjang).
- Code tab: snippet SDK (quickstart 10 baris) dan snippet embed widget.
- Sandbox [MOCK]: "Your lending market" preview: pilih nama brand, warna aksen, logo, market → render widget dengan theme itu. Data rate/util di dalamnya live; nama/branding = preview.
- "Request a market" [MOCK]: form aset + LTV/LT/cap yang menghasilkan ringkasan JSON proposal. Tidak ada tx; teks jelas "Proposals go through curator + 48h timelock".

### H-3. Embeddable widget (REAL-NEW, P1)
- `<FherumLend market="0x…" theme={…} />` (React) + versi iframe `fherum.tech/embed/<market>?accent=…`.
- Reuse action-panel + TxModal, wallet lewat EIP-6963 (`components/wallet.tsx`).
- Iframe: header CSP `frame-ancestors *` hanya di route `/embed/*`.

### H-4. Integrations gallery (MOCK, P2)
- 3 kartu contoh: "Trading app adds Earn tab", "Vault parks idle USDG" (bisa link ke HEARTH, yang ini REAL), "AI agent with Hook Stack" (REAL via HEARTH Hooks).
- Kartu tanpa integrasi asli wajib label "example integration"; dilarang memakai nama/logo app nyata.

### H-5. Docs `/docs/headless` (P1)
- Quickstart, konsep (engine vs frontend), daftar kontrak, risk & batasan (unaudited, public mode, stock feed pause weekend), FAQ.

### Di luar scope v0.1
- Kontrak baru. Engine yang ada cukup; tidak perlu deploy apa pun untuk H-1..H-5.
- Fee share untuk builder / referral on-chain (butuh kontrak + Safe, brief terpisah bila PM mau).
- Cross-chain apa pun (§4).

---

## 3. Data: real vs mock

| Data | Sumber |
|---|---|
| Daftar market, rate, util, liquidity, harga oracle | Real, LensReader / OracleAdapter |
| Kontrak + link explorer | Real, `lib/deployments.ts` |
| HEARTH vault / hook di contoh agen | Real, tx yang sudah ada |
| Nama brand builder, logo, warna di sandbox | Mock, label "preview" |
| Galeri integrasi pihak ketiga | Mock, label "example integration" |
| Angka "apps building on FHERUM", volume builder | **Jangan ditampilkan**. Tidak ada data; angka karangan gampang dicek orang |

---

## 4. Risiko klaim (perlu keputusan Caesar sebelum publish)

Key visual saat ini memuat "FHERUM × LayerZero" (logo), "BASED ON ATLAS BY LAYERZERO", "Interoperable by design with LayerZero", dan kotak "LAYERZERO INTEROPERABILITY".

Faktanya: repo tidak punya kode LayerZero (OApp/OFT/endpoint), tidak ada kesepakatan dengan LayerZero, dan keputusan lama kita adalah **satu chain tanpa bridge** (bridge = risiko hack + biaya audit). Logo "×" dan kalimat "based on / with LayerZero" dibaca publik sebagai partnership atau integrasi. Sama seperti aturan Uniswap di HEARTH Hooks.

Usulan:
- Boleh: "inspired by the headless architecture of ATLAS" (sudah di post X, aman).
- Ganti: hapus logo LayerZero + "×"; "Based on ATLAS by LayerZero" → "Headless architecture, inspired by ATLAS"; kartu Cross-Ecosystem → "OPEN BY DEFAULT — permissionless contracts, any app can integrate"; kotak 3 → "ROBINHOOD CHAIN SETTLEMENT".
- Kalau PM memang ingin cross-chain sungguhan: itu proyek terpisah (LayerZero OApp/OFT, audit, Safe ops), bukan fitur v0.1. Perlu keputusan bisnis + kontak resmi dengan LayerZero.

Aturan copy lain tetap berlaku: tanpa "built on Aave", tanpa klaim encrypted present tense, tanpa kaitan $FHERUM ke dividend, "not audited" di docs/risk.

---

## 5. Fase & acceptance

| Fase | Isi | Selesai bila |
|---|---|---|
| A (1–2 hari) | `/app/build` statis + live stats + module cards + snippet | Build lolos, semua alamat cocok `cast code`, label preview ada |
| B (2–3 hari) | SDK H-1 read+write builder, docs quickstart | Contoh quickstart jalan terhadap mainnet (read), calldata = `cast calldata` |
| C (2 hari) | Widget H-3 + sandbox theme + iframe `/embed` | Supply 0.1 USDG lewat iframe di halaman HTML lokal, tx real tercatat |
| D (1 hari) | Galeri mock, landing section "§ Headless", video promo + bukti | Video memakai tx real dari fase C |

---

## 6. Keputusan terbuka (P0)

1. Visual LayerZero: revisi sesuai §4, atau Caesar punya izin tertulis dari LayerZero?
2. SDK dipublikasi ke npm sebagai `@fherum/headless` atau cukup di repo publik dulu?
3. Widget boleh di-embed di domain mana saja (open), atau allowlist?
4. Fee share builder diinginkan (butuh brief kontrak terpisah)?
