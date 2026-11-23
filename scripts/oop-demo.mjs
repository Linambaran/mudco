// Walkthrough of the 8 OOP concepts on the MUD.CO domain classes.  Run: npm run demo
// Same stages as "Hasil Eksekusi Program" in the group's OOP report (mudco_oop.py).
import * as domain from '../src/domain.js';
const {
  MenuItem, BahanBaku, DaftarMenu, Inventori, Pesanan, PembayaranTunai, PembayaranQRIS,
  Kasir, Barista, Pemilik, Nota, NotifikasiService, PrinterService,
} = domain;

const coba = (fn) => { try { fn(); } catch (e) { console.log('   Ditolak ->', e.message); } };
const log = (...a) => console.log(...a);

log('='.repeat(60)); log('SIMULASI SISTEM SELF ORDER MUD.CO'); log('='.repeat(60));

// [1] AGGREGATION + ENCAPSULATION: MenuItem is created OUTSIDE, then put into DaftarMenu
log('\n[1] Menu (Aggregation + Encapsulation)');
const kopiSusu = new MenuItem({ id: 'm1', nama: 'Kopi Susu', kategori: 'Kopi', harga: 18000, hargaPokok: 7000 });
const americano = new MenuItem({ id: 'm2', nama: 'Americano', kategori: 'Kopi', harga: 15000, hargaPokok: 6000 });
const croissant = new MenuItem({ id: 'm3', nama: 'Croissant', kategori: 'Makanan', harga: 20000, hargaPokok: 9000, tersedia: false });
let daftar = new DaftarMenu().tambah(kopiSusu).tambah(americano).tambah(croissant);
daftar.semua.forEach(m => log('   -', String(m)));

// [2] ENCAPSULATION: the setter validates
log('\n[2] Encapsulation: validasi harga lewat setter');
coba(() => { kopiSusu.harga = -5000; });

// [3] ENCAPSULATION + AGGREGATION: stock has no setter, only methods that also write the history
log('\n[3] Stok bahan (Encapsulation + Aggregation)');
const susu = new BahanBaku({ id: 'b1', nama: 'Susu', satuan: 'liter', stok: 10, stokMinimum: 5 });
const inventori = new Inventori().tambah(susu).tambah(new BahanBaku({ id: 'b2', nama: 'Biji Kopi', satuan: 'gram', stok: 2000, stokMinimum: 500 }));
coba(() => { 'use strict'; susu.stok = 99; }); // no setter -> TypeError
susu.sesuaikanStok(4, { id: 'u1', username: 'pemilik' });
inventori.menipis().forEach(b => log(`   PERINGATAN stok menipis: ${b.nama} sisa ${b.stok} ${b.satuan}`));
log('   Riwayat stok:', susu.riwayat.map(h => `${h.changeType} ${h.quantity}`).join(', '));

// [4] COMPOSITION + OVERLOADING: Pesanan creates its own ItemPesanan; tambahItem has two versions
log('\n[4] Pesanan #101 (Composition + Overloading)');
const pesanan = new Pesanan({ id: '101', number: 'OR0101', tableNumber: 5, paymentMethod: 'TUNAI' }, daftar);
pesanan.tambahItem(kopiSusu, 2);   // version 1: MenuItem object
pesanan.tambahItem('Americano', 1); // version 2: menu name (looked up in the DaftarMenu)
pesanan.items.forEach(i => log(`   - ${i.nama} x${i.jumlah} = Rp${i.subtotal}`));
log('   Total: Rp', pesanan.total());
coba(() => pesanan.tambahItem('Croissant', 1));

// [5] ASYNCHRONOUS: notification does not block
log('\n[5] Notifikasi real-time ke kasir (Asynchronous)');
const notif = new NotifikasiService({
  delay: 500,
  kirim: ({ ke, pesanan: p }) => log(ke === 'kasir' ? `   [notif] Pesanan #${p.nomor} meja ${p.meja} sampai ke HP kasir` : '   [barista] Pesanan masuk antrean barista'),
});
await notif.kirimKeKasir(pesanan);

// [6] POLYMORPHISM + OVERRIDING: same call, different behaviour
log('\n[6] Polymorphism + Overriding: Pembayaran');
for (const p of [new PembayaranTunai(pesanan.total(), 60000), new PembayaranQRIS(pesanan.total())]) {
  log('  ', p.constructor.name, '->', p.proses());
}

// [7] ASSOCIATION: Kasir is handed a Pesanan; neither owns the other
log('\n[7] Association: Kasir mengonfirmasi Pesanan');
const kasir = new Kasir({ id: 'u2', username: 'Dina' });
log('   ', kasir.konfirmasi(pesanan, new PembayaranTunai(pesanan.total(), 60000)));
log('    Status pesanan:', pesanan.status);
coba(() => { pesanan.status = 'SELESAI'; }); // status is read-only (Encapsulation)

// [8] ASYNCHRONOUS: print + notify barista concurrently with Promise.all
log('\n[8] Cetak nota & siapkan pesanan berjalan bersamaan (Promise.all)');
const mulai = Date.now();
const [cetak] = await Promise.all([
  new PrinterService({ delay: 1000 }).cetak(pesanan, new Nota()),
  new NotifikasiService({ delay: 800, kirim: () => log('   [barista] Pesanan masuk antrean barista') }).kirimKeBarista(pesanan),
]);
log(`   [printer] Nota pesanan #${pesanan.nomor} tercetak`);
log(`   Selesai dalam ${((Date.now() - mulai) / 1000).toFixed(1)} detik (bukan 1.8 detik karena paralel)`);
log('\n' + cetak.teks);

// [9] OVERLOADING: the other version of Nota.cetak
log('\n[9] Overloading Nota: versi ringkas dari nominal');
log(new Nota().cetak(35000));

// [10] ASSOCIATION: Barista
const barista = new Barista({ id: 'u3', username: 'Rafi' });
barista.kerjakan(pesanan, 'DIPROSES');
barista.kerjakan(pesanan, 'SELESAI');
log('\n[10] Barista selesai. Status pesanan:', pesanan.status);

// [11] POLYMORPHISM + OVERRIDING: RBAC
log('\n[11] Polymorphism + Overriding: Hak akses (RBAC)');
for (const p of [kasir, barista, new Pemilik({ id: 'u4', username: 'Andika' })]) {
  log(`   ${p.constructor.name.padEnd(8)}${p.username.padEnd(8)}-> ${JSON.stringify(p.hakAkses())}`);
}

// [12] AGGREGATION: the container goes away, the part stays
log('\n[12] Aggregation: DaftarMenu dihapus, MenuItem tetap ada');
daftar = null;
log('    MenuItem masih hidup:', String(kopiSusu));

// [13] COMPOSITION: ItemPesanan cannot exist without Pesanan
log('\n[13] Composition: ItemPesanan tidak ada tanpa Pesanan');
log('    ItemPesanan diekspor dari modul?', 'ItemPesanan' in domain, '(hanya Pesanan yang bisa membuatnya)');
pesanan.items.push('x'); // pushes into a copy
log('    Item di pesanan:', pesanan.items.length, '(list asli tidak bisa diubah dari luar)');
