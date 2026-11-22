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
