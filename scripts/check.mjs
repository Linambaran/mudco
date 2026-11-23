// Runnable check of the business rules in src/api.js:  npm run check
import assert from 'node:assert/strict';

const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = store();
globalThis.sessionStorage = store();
const api = await import('../src/api.js');

const fails = async (fn, code) => assert.rejects(fn, e => e.code === code, `expected ${code}`);
const as = async u => { sessionStorage.removeItem('mudco-session'); await api.login(u, u + '1234'); };

// RBAC
await fails(() => api.listOrders(), 'ERR-AUTH-01');
await as('barista');
await fails(() => api.confirmPayment('x'), 'ERR-AUTH-04');

// login lockout: 3 wrong -> locked 15 min, even with the right password (BR-18)
sessionStorage.removeItem('mudco-session');
await fails(() => api.login('kasir', 'wrongpass1'), 'ERR-AUTH-02');
await fails(() => api.login('kasir', 'wrongpass1'), 'ERR-AUTH-02');
await fails(() => api.login('kasir', 'wrongpass1'), 'ERR-AUTH-03');
await fails(() => api.login('kasir', 'kasir1234'), 'ERR-AUTH-03');
const db = JSON.parse(localStorage.getItem('mudco-db'));
db.users.find(u => u.username === 'kasir').lockedUntil = null;
localStorage.setItem('mudco-db', JSON.stringify(db));

// order validation + server-side availability (BR-06)
const menus = await api.getMenus();
const americano = menus.find(m => m.name === 'Americano');
const cheesecake = menus.find(m => m.name === 'Cheesecake'); // seeded as Habis
const o0 = { tableNumber: 3, paymentMethod: 'TUNAI', items: [{ menuId: americano.id, quantity: 2 }] };
await fails(() => api.createOrder({ ...o0, items: [] }), 'ERR-VAL-03');
await fails(() => api.createOrder({ ...o0, tableNumber: 11 }), 'ERR-VAL-05');
await fails(() => api.createOrder({ ...o0, paymentMethod: '' }), 'ERR-VAL-06');
await fails(() => api.createOrder({ ...o0, items: [{ menuId: americano.id, quantity: 21 }] }), 'ERR-VAL-02');
await fails(() => api.createOrder({ ...o0, items: [{ menuId: cheesecake.id, quantity: 1 }] }), 'ERR-VAL-04');
const order = await api.createOrder(o0);
assert.equal(order.status, 'MENUNGGU');
assert.equal(order.total, 30000);

// payment -> print -> queue (BR-21/23/27)
await as('kasir');
api.setPrinter('offline');
assert.equal((await api.confirmPayment(order.id)).printStatus, 'GAGAL');
assert.equal((await api.getOrder(order.id)).status, 'DIBAYAR'); // payment valid despite printer failure
await fails(() => api.confirmPayment(order.id), 'ERR-BIZ-02');
api.setPrinter('sim');
assert.equal(await api.reprint(order.id), 'BERHASIL');

// barista: no skipping, no double-change (BR-30, ERR-SYS-05)
await as('barista');
await fails(() => api.setStatus(order.id, 'SELESAI'), 'ERR-BIZ-03');
await api.setStatus(order.id, 'DIPROSES');
await fails(() => api.setStatus(order.id, 'DIPROSES'), 'ERR-SYS-05');
await api.setStatus(order.id, 'SELESAI');

// owner: report math = revenue - HPP (BR-43), menu soft-delete (BR-35), stock rules (BR-39/40)
await as('pemilik');
const today = new Date().toLocaleDateString('sv-SE');
const rep = await api.getReport(today, today);
assert.equal(rep.totalRevenue, 30000);
assert.equal(rep.totalCost, 12000);
assert.equal(rep.estimatedProfit, 18000);
await fails(() => api.getReport(today, '2000-01-01'), 'ERR-VAL-12');
await fails(() => api.deleteMenu(americano.id), 'ERR-VAL-09');
await fails(() => api.saveMenu({ name: 'ab', category: 'x', price: 1, costPrice: 0 }), 'ERR-VAL-08');

const { ingredients } = await api.getStock();
const susu = ingredients.find(i => i.name === 'Susu');
assert.equal(susu.lowStock, true); // seeded below minimum
await fails(() => api.addStock({ ingredientId: susu.id, changeType: 'STOK_MASUK', quantity: 0 }), 'ERR-VAL-11');
await fails(() => api.addStock({ ingredientId: susu.id, changeType: 'PENYESUAIAN', quantity: -1 }), 'ERR-VAL-11');
const r = await api.addStock({ ingredientId: susu.id, changeType: 'PENYESUAIAN', quantity: 4000 });
assert.equal(r.stockQty, 4000);
assert.equal(r.lowStock, false);
assert.equal((await api.getStock()).history[0].quantity, 1500); // difference is logged

// ---- OOP concepts (src/domain.js) ----
const d = await import('../src/domain.js');
const mi = new d.MenuItem({ id: 'x', nama: 'Tes Menu', kategori: 'K', harga: 1000, hargaPokok: 0 });
assert.throws(() => { mi.harga = -1; }, e => e.code === 'ERR-VAL-08'); // encapsulation: validating setter
const ps = new d.Pesanan({ id: 'p', number: 'OR9', tableNumber: 1, paymentMethod: 'QRIS' }, new d.DaftarMenu().tambah(mi));
ps.tambahItem(mi, 1); ps.tambahItem('Tes Menu', 2); // overloading: MenuItem object / menu name
assert.equal(ps.total(), 3000);
ps.items.push(1);
assert.equal(ps.items.length, 2); // composition: items are a protected copy
assert.equal('ItemPesanan' in d, false); // composition: the part class is not exported
assert.throws(() => { ps.status = 'SELESAI'; }, TypeError); // encapsulation: status has no setter
assert.throws(() => new d.Pembayaran(1), TypeError); // abstract base class
assert.match(d.Pembayaran.untuk('QRIS', 3000).proses(), /QRIS/); // polymorphism + overriding
assert.match(d.Pembayaran.untuk('TUNAI', 3000, 5000).proses(), /kembalian Rp2000/);
assert.ok(new d.Nota().cetak(5000).includes('Rp5000') && new d.Nota().cetak(ps).includes('OR9')); // overloading by type
assert.equal(new d.Pemilik({ id: 1, username: 'a' }).bisa('confirmPayment'), false); // overriding hakAkses()
const t0 = Date.now();
await Promise.all([new d.PrinterService({ delay: 200 }).cetak(ps, new d.Nota()), new d.NotifikasiService({ delay: 200 }).kirimKeBarista(ps)]);
assert.ok(Date.now() - t0 < 350, 'async tasks must run in parallel');

console.log('all checks passed');
process.exit(0);
