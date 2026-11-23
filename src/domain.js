// Domain layer (OOP). Pure JavaScript: no React, no localStorage, so it runs in the browser and in Node
// (see scripts/oop-demo.mjs). Class names follow the group's OOP report (mudco_oop.py).
// Each concept is tagged in a comment:  ENCAPSULATION, POLYMORPHISM, OVERRIDING, OVERLOADING,
// ASYNCHRONOUS, ASSOCIATION, AGGREGATION, COMPOSITION.
import { ApiError, soldOutMsg } from './errors.js';

const tunda = ms => new Promise(r => setTimeout(r, ms));
const r2 = n => Math.round(n * 100) / 100;
const teks = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const salah = (code, ...fields) => new ApiError(code, undefined, fields);

// OVERLOADING helper. JavaScript has no built-in overloading, so (like singledispatchmethod in the
// Python report) one method name picks its version from the type of the first argument.
const overload = (v, versions) => {
  for (const [T, fn] of versions) if (typeof T === 'string' ? typeof v === T : v instanceof T) return fn(v);
  throw new TypeError('Tipe argumen tidak didukung');
};

// ======================================================================
// 1. ENCAPSULATION: private #fields, changed only through validating setters / methods
// ======================================================================
export class MenuItem {
  #id; #nama; #kategori; #harga; #hargaPokok; #imageUrl; #tersedia; #aktif;

  constructor({ id, nama, kategori, harga, hargaPokok, imageUrl = '', tersedia = true, aktif = true }) {
    this.#id = id;
    this.nama = nama; this.kategori = kategori; this.harga = harga; this.hargaPokok = hargaPokok; // via setters -> validated
    this.#imageUrl = imageUrl; this.#tersedia = tersedia; this.#aktif = aktif;
  }
  get id() { return this.#id; }
  get nama() { return this.#nama; }
  set nama(v) { if (!teks(v, 3, 100)) throw salah('ERR-VAL-08', 'name'); this.#nama = v.trim(); }
  get kategori() { return this.#kategori; }
  set kategori(v) { if (!teks(v, 1, 50)) throw salah('ERR-VAL-08', 'category'); this.#kategori = v.trim(); }
  get harga() { return this.#harga; }
  set harga(v) { if (!(+v > 0)) throw new ApiError('ERR-VAL-08', 'Harga harus lebih dari 0', ['price']); this.#harga = +v; }
  get hargaPokok() { return this.#hargaPokok; }
  set hargaPokok(v) { if (v === '' || v == null || !(+v >= 0)) throw salah('ERR-VAL-08', 'costPrice'); this.#hargaPokok = +v; }
  get imageUrl() { return this.#imageUrl; }
  set imageUrl(v) { this.#imageUrl = (v ?? '').trim(); }
  get tersedia() { return this.#tersedia; }
  get aktif() { return this.#aktif; }
  tandaiTersedia(status) { this.#tersedia = !!status; } // only the owner calls this (FR-020)
  setAktif(status) { this.#aktif = !!status; }

  // Whole-form check so the UI can highlight every bad field at once (a setter stops at the first one).
  static fieldsBermasalah(d) {
    return [
      !teks(d.name, 3, 100) && 'name',
      !(+d.price > 0) && 'price',
      (d.costPrice === '' || d.costPrice == null || !(+d.costPrice >= 0)) && 'costPrice',
      !teks(d.category, 1, 50) && 'category',
    ].filter(Boolean);
  }
  perbarui(d) { this.nama = d.name; this.kategori = d.category; this.harga = d.price; this.hargaPokok = d.costPrice; this.imageUrl = d.imageUrl; return this; }
  static from(j) {
    return new MenuItem({ id: j.id, nama: j.name, kategori: j.category, harga: j.price, hargaPokok: j.costPrice, imageUrl: j.imageUrl, tersedia: j.isAvailable, aktif: j.isActive });
  }
  toJSON() {
    return { id: this.#id, name: this.#nama, category: this.#kategori, price: this.#harga, costPrice: this.#hargaPokok, imageUrl: this.#imageUrl, isAvailable: this.#tersedia, isActive: this.#aktif };
  }
  toString() { return `${this.#nama} (Rp${this.#harga.toLocaleString('id-ID')}) [${this.#tersedia ? 'tersedia' : 'HABIS'}]`; }
}

export class BahanBaku {
  #id; #nama; #satuan; #stok; #stokMinimum; #aktif; #diperbarui; #riwayat;

  constructor({ id, nama, satuan, stok, stokMinimum, aktif = true, diperbarui = Date.now(), riwayat = [] }) {
    this.#id = id;
    this.nama = nama; this.satuan = satuan;
    if (stok === '' || stok == null || !(+stok >= 0)) throw salah('ERR-VAL-10', 'stockQty');
    this.#stok = +stok;
    this.stokMinimum = stokMinimum;
    this.#aktif = aktif; this.#diperbarui = diperbarui; this.#riwayat = riwayat.map(h => ({ ...h }));
  }
  get id() { return this.#id; }
  get nama() { return this.#nama; }
  set nama(v) { if (!teks(v, 1, 100)) throw salah('ERR-VAL-10', 'name'); this.#nama = v.trim(); }
  get satuan() { return this.#satuan; }
  set satuan(v) { if (!teks(v, 1, 20)) throw salah('ERR-VAL-10', 'unit'); this.#satuan = v.trim(); }
  get stok() { return this.#stok; } // no setter: stock changes only through stokMasuk() / sesuaikanStok() (FR-018, FR-019)
  get stokMinimum() { return this.#stokMinimum; }
  set stokMinimum(v) { if (v === '' || v == null || !(+v >= 0)) throw salah('ERR-VAL-10', 'minStock'); this.#stokMinimum = +v; }
  get aktif() { return this.#aktif; }
  setAktif(status) { this.#aktif = !!status; }
  get riwayat() { return this.#riwayat.map(h => ({ ...h })); } // a copy, so the log cannot be edited from outside
  menipis() { return this.#stok <= this.#stokMinimum; }

  stokMasuk(jumlah, oleh) {
    if (jumlah === '' || jumlah == null || !(+jumlah > 0)) throw salah('ERR-VAL-11', 'quantity');
    this.#catat('STOK_MASUK', +jumlah, oleh);
  }
  sesuaikanStok(stokBaru, oleh) {
    if (stokBaru === '' || stokBaru == null || !(+stokBaru >= 0)) throw salah('ERR-VAL-11', 'quantity'); // never negative (BR-40)
    this.#catat('PENYESUAIAN', +stokBaru - this.#stok, oleh); // an adjustment logs the difference
  }
  #catat(jenis, selisih, oleh) {
    selisih = r2(selisih);
    this.#stok = r2(this.#stok + selisih);
    this.#diperbarui = Date.now();
    this.#riwayat.push({ id: crypto.randomUUID(), userId: oleh?.id, username: oleh?.username, changeType: jenis, quantity: selisih, createdAt: this.#diperbarui });
  }

  static fieldsBermasalah(d) {
    return [
      !teks(d.name, 1, 100) && 'name',
      !teks(d.unit, 1, 20) && 'unit',
      (d.stockQty === '' || d.stockQty == null || !(+d.stockQty >= 0)) && 'stockQty',
      (d.minStock === '' || d.minStock == null || !(+d.minStock >= 0)) && 'minStock',
    ].filter(Boolean);
  }
  perbarui(d) { this.nama = d.name; this.satuan = d.unit; this.stokMinimum = d.minStock; this.#diperbarui = Date.now(); return this; } // stock itself is untouched
  static from(j) {
    return new BahanBaku({ id: j.id, nama: j.name, satuan: j.unit, stok: j.stockQty, stokMinimum: j.minStock, aktif: j.isActive, diperbarui: j.updatedAt, riwayat: j.riwayat ?? [] });
  }
  toJSON() {
    return { id: this.#id, name: this.#nama, unit: this.#satuan, stockQty: this.#stok, minStock: this.#stokMinimum, isActive: this.#aktif, updatedAt: this.#diperbarui, riwayat: this.riwayat };
  }
}

// ======================================================================
// 7. AGGREGATION: the container holds parts that are created outside it and outlive it
// ======================================================================
export class DaftarMenu {
  #items = [];
  tambah(item) {
    if (!(item instanceof MenuItem)) throw new TypeError('Harus berupa MenuItem');
    this.#items.push(item);
    return this;
  }
  cari(kunci) { // by id or by name
    const k = String(kunci).toLowerCase();
    const m = this.#items.find(i => i.id === kunci || i.nama.toLowerCase() === k);
    if (!m) throw new ApiError('ERR-VAL-04', soldOutMsg('ini'));
    return m;
  }
  get semua() { return [...this.#items]; }
  static dari(rows) { const d = new DaftarMenu(); rows.forEach(r => d.tambah(MenuItem.from(r))); return d; }
}

export class Inventori {
  #bahan = [];
  tambah(b) {
    if (!(b instanceof BahanBaku)) throw new TypeError('Harus berupa BahanBaku');
    this.#bahan.push(b);
    return this;
  }
  get semua() { return [...this.#bahan]; }
  menipis() { return this.#bahan.filter(b => b.aktif && b.menipis()); } // low-stock warning (BR-41)
  static dari(rows) { const i = new Inventori(); rows.forEach(r => i.tambah(BahanBaku.from(r))); return i; }
}

// ======================================================================
// 8. COMPOSITION: ItemPesanan is NOT exported. Only Pesanan can create it, and it dies with its Pesanan.
// ======================================================================
class ItemPesanan {
  #menuId; #nama; #harga; #jumlah;
  constructor(menu, jumlah) { this.#menuId = menu.id; this.#nama = menu.nama; this.#harga = menu.harga; this.#jumlah = jumlah; } // price snapshot
  get menuId() { return this.#menuId; }
  get nama() { return this.#nama; }
  get harga() { return this.#harga; }
  get jumlah() { return this.#jumlah; }
  get subtotal() { return this.#harga * this.#jumlah; }
  toJSON() { return { menuId: this.#menuId, name: this.#nama, price: this.#harga, quantity: this.#jumlah, subtotal: this.subtotal }; }
}

export class Pesanan {
  static ALUR = { MENUNGGU: 'DIBAYAR', DIBAYAR: 'DIPROSES', DIPROSES: 'SELESAI' };
  #id; #nomor; #meja; #metode; #katalog;
  #status = 'MENUNGGU'; #items = [];
  #dibuat = Date.now(); #diperbarui = this.#dibuat; #dibayar = null; #notifTerkirim = false;

  constructor({ id, number, tableNumber, paymentMethod }, katalog = null) {
    if (!(Number.isInteger(tableNumber) && tableNumber >= 1 && tableNumber <= 10)) throw new ApiError('ERR-VAL-05');
    if (!['QRIS', 'TUNAI'].includes(paymentMethod)) throw new ApiError('ERR-VAL-06');
    this.#id = id; this.#nomor = number; this.#meja = tableNumber; this.#metode = paymentMethod; this.#katalog = katalog;
  }
  get id() { return this.#id; }
  get nomor() { return this.#nomor; }
  get meja() { return this.#meja; }
  get metode() { return this.#metode; }
  get status() { return this.#status; } // read-only: it changes only through ubahStatus()
  get items() { return [...this.#items]; } // a copy of the list
  get dibuat() { return this.#dibuat; }
  get dibayar() { return this.#dibayar; }
  get diperbarui() { return this.#diperbarui; }
  get notifTerkirim() { return this.#notifTerkirim; }
  tandaiNotifTerkirim() { this.#notifTerkirim = true; }
  total() { return this.#items.reduce((a, i) => a + i.subtotal, 0); }

  // OVERLOADING: one name, two versions chosen by argument type
  //   tambahItem(MenuItem, jumlah)       -> add by object
  //   tambahItem('id atau nama', jumlah) -> look the menu up in the DaftarMenu first
  tambahItem(item, jumlah = 1) {
    return overload(item, [
      [MenuItem, m => this.#tambah(m, jumlah)],
      ['string', k => {
        if (!this.#katalog) throw new TypeError('Pesanan ini tidak punya DaftarMenu, berikan objek MenuItem');
        return this.#tambah(this.#katalog.cari(k), jumlah);
      }],
    ]);
  }
  #tambah(menu, jumlah) {
    if (!(Number.isInteger(jumlah) && jumlah >= 1 && jumlah <= 20)) throw new ApiError('ERR-VAL-02'); // BR-05
    if (!menu.tersedia || !menu.aktif) throw new ApiError('ERR-VAL-04', soldOutMsg(menu.nama)); // BR-06
    this.#items.push(new ItemPesanan(menu, jumlah)); // <- COMPOSITION: created here, inside the owner
    return this;
  }

  ubahStatus(ke) {
    if (this.#status === ke) throw new ApiError('ERR-SYS-05'); // already changed by someone else
    if (Pesanan.ALUR[this.#status] !== ke) throw new ApiError('ERR-BIZ-03'); // BR-30: no skipping steps
    this.#status = ke;
    this.#diperbarui = Date.now();
    if (ke === 'DIBAYAR') this.#dibayar = this.#diperbarui;
  }

  static from(j, katalog = null) {
    const p = new Pesanan({ id: j.id, number: j.number, tableNumber: j.tableNumber, paymentMethod: j.paymentMethod }, katalog);
    p.#status = j.status; p.#dibuat = j.createdAt; p.#diperbarui = j.updatedAt; p.#dibayar = j.paidAt; p.#notifTerkirim = !!j.notificationSent;
    j.items.forEach(i => p.#items.push(new ItemPesanan({ id: i.menuId, nama: i.name, harga: i.price }, i.quantity)));
    return p;
  }
  toJSON() {
    return {
      id: this.#id, number: this.#nomor, tableNumber: this.#meja, paymentMethod: this.#metode, status: this.#status,
      items: this.#items.map(i => i.toJSON()), total: this.total(), notificationSent: this.#notifTerkirim,
      createdAt: this.#dibuat, updatedAt: this.#diperbarui, paidAt: this.#dibayar,
    };
  }
}

// ======================================================================
// 2. POLYMORPHISM + 3. OVERRIDING: callers only know proses(); each subclass overrides it
// ======================================================================
export class Pembayaran {
  constructor(total) {
    if (new.target === Pembayaran) throw new TypeError('Pembayaran adalah kelas abstrak');
    this.total = total;
  }
  get label() { throw new Error('abstrak: harus ditimpa subclass'); }
  proses() { throw new Error('abstrak: harus ditimpa subclass'); }
  static untuk(metode, total, uangDiterima) { // picks the subclass from the order's payment method
    const K = { TUNAI: PembayaranTunai, QRIS: PembayaranQRIS }[metode];
    if (!K) throw new ApiError('ERR-VAL-06');
    return new K(total, uangDiterima);
  }
}
export class PembayaranTunai extends Pembayaran {
  constructor(total, uangDiterima = total) { super(total); this.uangDiterima = uangDiterima; }
  get label() { return 'Tunai'; } // OVERRIDING
  proses() { // OVERRIDING
    const kembalian = this.uangDiterima - this.total;
    if (kembalian < 0) throw new ApiError('ERR-VAL-06', 'Uang diterima kurang dari total');
    return `Tunai diterima, kembalian Rp${kembalian}`;
  }
}
export class PembayaranQRIS extends Pembayaran {
  get label() { return 'QRIS'; } // OVERRIDING
  proses() { return `QRIS statis: kasir memverifikasi manual transfer Rp${this.total}`; } // OVERRIDING
}

export class Pengguna {
  #id; #username;
  constructor({ id, username }) { this.#id = id; this.#username = username; }
  get id() { return this.#id; }
  get username() { return this.#username; }
  get role() { return 'TAMU'; }
  hakAkses() { return []; } // base version: no rights
  bisa(aksi) { return this.hakAkses().includes(aksi); }
  static dari(sesi) { // factory: session role -> subclass
    const K = { KASIR: Kasir, BARISTA: Barista, PEMILIK: Pemilik }[sesi.role] ?? Pengguna;
    return new K({ id: sesi.userId, username: sesi.username });
  }
}
export class Kasir extends Pengguna {
  get role() { return 'KASIR'; } // OVERRIDING
  hakAkses() { return ['listOrders', 'confirmPayment', 'reprint']; } // OVERRIDING (RBAC, FR-013)

  // ASSOCIATION: Kasir does not own a Pesanan; it only meets one through the parameter.
  // Both objects live on their own (FR-010).
  konfirmasi(pesanan, pembayaran) {
    if (pesanan.status !== 'MENUNGGU') throw new ApiError('ERR-BIZ-02'); // BR-23
    const hasil = pembayaran.proses(); // POLYMORPHISM: Tunai or QRIS, the cashier does not care
    pesanan.ubahStatus('DIBAYAR');
    return hasil;
  }
}
export class Barista extends Pengguna {
  get role() { return 'BARISTA'; } // OVERRIDING
  hakAkses() { return ['listOrders', 'setStatus']; } // OVERRIDING

  // ASSOCIATION: same idea, Barista works on a Pesanan passed in (FR-012).
  kerjakan(pesanan, ke) {
    if (!['DIPROSES', 'SELESAI'].includes(ke)) throw new ApiError('ERR-BIZ-03');
    pesanan.ubahStatus(ke);
  }
}
export class Pemilik extends Pengguna {
  get role() { return 'PEMILIK'; } // OVERRIDING
  hakAkses() { return ['manageMenu', 'manageStock', 'viewReport']; } // OVERRIDING
}

// ======================================================================
// 4. OVERLOADING: Nota.cetak(Pesanan) = full receipt, Nota.cetak(number) = short receipt
// ======================================================================
export class Nota {
  constructor(namaToko = 'MUD.CO') { this.namaToko = namaToko; }
  cetak(sumber) {
    return overload(sumber, [
      [Pesanan, p => [
        `=== ${this.namaToko} ===`, `No. Pesanan : ${p.nomor}`, `Meja        : ${p.meja}`,
        ...p.items.map(i => `${i.nama.padEnd(14)} x${i.jumlah} Rp${i.subtotal}`),
        `TOTAL        Rp${p.total()}`,
      ].join('\n')],
      ['number', n => `=== ${this.namaToko} ===\nTOTAL Rp${n}`],
    ]);
  }
}

// ======================================================================
// 5. ASYNCHRONOUS: slow work (network, printer) is awaited without blocking other work
// ======================================================================
export class NotifikasiService {
  #delay; #kirim;
  // `kirim` is the transport (BroadcastChannel in the app, a console log in the demo; Supabase Realtime later).
  constructor({ delay = 150, kirim = () => {} } = {}) { this.#delay = delay; this.#kirim = kirim; }
  async kirimKeKasir(pesanan) { await tunda(this.#delay); this.#kirim({ ke: 'kasir', pesanan }); } // FR-007, NFR-001
  async kirimKeBarista(pesanan) { await tunda(this.#delay); this.#kirim({ ke: 'barista', pesanan }); }
}
export class PrinterService {
  #mode; #delay;
  constructor({ mode = 'sim', delay = 300 } = {}) { this.#mode = mode; this.#delay = delay; }
  async cetak(pesanan, nota) { // NFR-002
    await tunda(this.#delay);
    if (this.#mode === 'offline') return { status: 'GAGAL', teks: '' }; // BR-27: a print failure never cancels the payment
    return { status: 'BERHASIL', teks: nota.cetak(pesanan) };
  }
}
