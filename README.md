# MUD.CO Self Order (frontend)

React + Vite. Pembeli scan QR di meja → `/order/:tableId` → menu, keranjang, pembayaran, status real-time.
Staf (kasir, barista, pemilik) login di `/login`. Semua layar mengikuti FSD v2.1 (SCR-01 s.d. SCR-08).

```bash
npm install
npm run dev       # http://localhost:5173
npm run check     # tes aturan bisnis (BR/ERR) pada src/api.js
npm run build     # output ke dist/
```

## Deploy ke Vercel
Import repo di Vercel → framework Vite terdeteksi otomatis (build `npm run build`, output `dist`).
`vercel.json` sudah berisi rewrite SPA, jadi `/order/3` bisa dibuka langsung dari QR.

## QR code per meja
Buat 10 QR (generator apa saja) yang mengarah ke `https://<domain-anda>/order/1` … `/order/10`.

## Akun demo
`kasir / kasir1234` · `barista / barista1234` · `pemilik / pemilik1234`

## API mock mengikuti TSD v1.2
`npm run api` menjalankan `scripts/http-server.mjs` di `http://localhost:3000/api/v1`: pembungkus HTTP tipis di atas `src/api.js`
(data di memori, reset saat restart) yang mengikuti TSD Bagian 3, 6, 7:

| Aturan TSD | Di server mock |
|---|---|
| Base URL `/api/v1`, grup `/kasir`, `/barista`, `/pemilik` (3.1, 3.2) | semua 23 endpoint pada Endpoint Index |
| Envelope `{status, data, message, error_code, errors}` + `meta` (AC-03, 7.2) | semua respons; pagination `page`/`per_page` (default 15, maks 100) |
| Satu role per grup, Pemilik ditolak di `/kasir` dan `/barista` (AC-04) | 401 `ERR-AUTH-01`, 403 `ERR-AUTH-04` |
| JWT Bearer 12 jam, stateless (6.2) | HS256 via `node:crypto`; `JWT_SECRET` dari env (acak bila kosong) |
| Rate limit 10/menit pada login dan `POST /orders` (6.2) | 429 `ERR-RATE-01` (`RATE_LIMIT_MAX` untuk mengubah) |
| Kode error TSD: 401/403/404/409/422/429/503 | `ERR-VAL` 422 (kecuali 04 dan 09 = 409), `ERR-BIZ-01` 404, `ERR-BIZ-02/03` 409, `ERR-AUTH-03` 403 |
| Harga dan total dari server, HPP hanya ke Pemilik (AC-06, AC-10) | `GET /menus` tanpa `cost_price` |
| Nota 80 mm dicetak browser, hasil dicatat lewat `PATCH .../print-status` (AC-08, BR-27) | `GET .../nota` mengembalikan HTML; `PATCH .../payment` menghasilkan `print_status: BELUM` |

```bash
npm run api          # jalankan server mock
npm run check:api    # tes kontrak TSD lewat HTTP (server dijalankan otomatis di port 3999)
```
Impor `mudco.postman_collection.json` ke Postman (variabel `baseUrl` = `http://localhost:3000/api/v1`) lalu **Run collection**
(urutan folder penting; tunggu semenit bila mengulang karena rate limit). Akun uji sama dengan akun demo di atas.
Kekurangan mock dibanding TSD: tabel/SP/trigger SQL Server tidak ada (aturannya ada di `domain.js`), `created_at` menu bernilai `null`,
dan UI React masih memanggil `src/api.js` langsung (bukan HTTP).

## PENTING: backend masih mock
`src/api.js` adalah backend tiruan (localStorage + BroadcastChannel). Seluruh aturan FSD (RBAC, validasi,
urutan status, kunci akun, rekap laba, stok) sudah ada di sana, tetapi data hanya hidup di satu browser,
jadi pesanan dari HP pembeli **belum** sampai ke HP kasir. Untuk produksi, ganti isi `api.js` dengan
pemanggilan ke backend sungguhan; nama dan bentuk fungsinya sudah menjadi kontrak untuk UI.

Saran: Vercel serverless tidak mendukung WebSocket persisten, jadi untuk notifikasi real-time (< 5 detik, NFR-001)
pakai layanan realtime terkelola, mis. **Supabase** (Postgres + Realtime + Auth) atau Firebase.
Skema tabel mengikuti FSD Bagian 5 (users, menus, orders, order_items, transactions, ingredients,
stock_histories, daily_summaries, daily_menu_sales). Di `api.js`, `subscribe()` adalah titik tempat
event realtime dari server memicu pemuatan ulang.

## Cetak nota
Printer thermal (ESC/POS) tidak bisa dikendalikan langsung dari browser. Di layar kasir ada pilihan printer:
simulasi, cetak via browser (`window.print()`, bisa senyap dengan Chrome `--kiosk-printing`), atau simulasi offline
(untuk menguji ERR-SYS-04 dan tombol Cetak Ulang). Untuk ESC/POS asli perlu print agent atau WebUSB/Bluetooth.

## Perbedaan dengan gambar mockup (mengikuti FSD Lampiran B.2)
Label "Stok ∞/10" diganti Tersedia/Habis; QRIS bersifat statis; tidak ada nota digital; status pesanan memakai
MENUNGGU PEMBAYARAN / DIBAYAR / DIPROSES / SELESAI; Rating, Pelanggan, Pengeluaran, Pengaturan Sistem, dan
Estimasi Penyajian tidak dibuat karena tidak ada di BRD/SRS. Gambar menu memakai inisial sebagai placeholder
(isi `imageUrl` per menu dari halaman Manajemen Menu). Ganti `public/qris.svg` dengan QRIS toko.
