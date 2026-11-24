// Mock backend: localStorage + BroadcastChannel (real-time across tabs of one browser).
// Every function is async and delegates the rules to the OOP domain layer (src/domain.js), so replacing
// this file with fetch()/Supabase calls keeps the UI untouched.
import { ApiError, MSG, soldOutMsg } from './errors.js';
import {
  BahanBaku, DaftarMenu, Inventori, MenuItem, Nota, NotifikasiService, Pembayaran, Pengguna, Pesanan, PrinterService,
} from './domain.js';

export { ApiError, MSG, soldOutMsg };
export const MOCK = true;
const KEY = 'mudco-db';
const SES = 'mudco-session';
const bc = new BroadcastChannel('mudco');
const subs = new Set();
const emit = () => subs.forEach(f => f());
bc.onmessage = emit;
export const subscribe = f => (subs.add(f), () => subs.delete(f));
const err = (...a) => new ApiError(...a);

const day = t => new Date(t).toLocaleDateString('sv-SE'); // YYYY-MM-DD, local time
export const isValidTable = t => /^\d+$/.test(t) && +t >= 1 && +t <= 10;

// ---------- seed ----------
const MENUS = [ // name, category, price, HPP, available
  ['Americano', 'Americano Series', 15000, 6000],
  ['Berrycano', 'Americano Series', 20000, 8500],
  ['Orange Americano', 'Americano Series', 18000, 7500],
  ['Aren Latte', 'Latte Series', 18000, 7500],
  ['Vanilla Latte', 'Latte Series', 22000, 9000],
  ['Butterscotch Latte', 'Latte Series', 19000, 8000],
  ['Caramel Latte', 'Latte Series', 18000, 7500],
  ['Matcha Latte', 'Non-Kopi', 18000, 8000],
  ['Air Mineral', 'Non-Kopi', 4000, 1500],
  ['Croissant', 'Makanan', 12000, 6000],
  ['Brownies', 'Makanan', 16000, 7000],
  ['Cheesecake', 'Makanan', 22000, 11000, false],
];
function seed() {
  const id = () => crypto.randomUUID();
  const menus = MENUS.map(([name, category, price, costPrice, isAvailable = true]) => ({
    id: id(), name, category, price, costPrice, imageUrl: '', isAvailable, isActive: true,
  }));
  const summaries = {};
  for (let i = 1; i <= 6; i++) {
    const rows = menus.map((m, j) => ({ m, q: (i * 5 + j * 3) % 7 })).filter(x => x.q)
      .map(({ m, q }) => ({ menuId: m.id, name: m.name, qtySold: q, revenue: m.price * q, cost: m.costPrice * q }));
    const sum = k => rows.reduce((a, r) => a + r[k], 0);
    const date = day(Date.now() - i * 864e5);
    summaries[date] = {
      date, totalOrders: Math.ceil(sum('qtySold') / 2), totalRevenue: sum('revenue'), totalCost: sum('cost'),
      estimatedProfit: sum('revenue') - sum('cost'), menus: rows,
    };
  }
  const user = (username, role) => ({ id: id(), username, password: username + '1234', role, failedAttempts: 0, lockedUntil: null });
  const ing = (name, unit, stockQty, minStock) => ({ id: id(), name, unit, stockQty, minStock, isActive: true, updatedAt: Date.now(), riwayat: [] });
  return {
    seq: 0,
    // ponytail: plaintext passwords in the mock; the real backend must store bcrypt hashes (BR-17)
    users: [user('kasir', 'KASIR'), user('barista', 'BARISTA'), user('pemilik', 'PEMILIK')],
    menus, orders: [], transactions: [], summaries,
    ingredients: [ing('Biji Kopi', 'gram', 2000, 1000), ing('Susu', 'ml', 2500, 3000), ing('Gula Aren', 'ml', 1200, 500), ing('Sirup Vanila', 'ml', 800, 300), ing('Cup 16oz', 'pcs', 40, 50)],
  };
}
const load = () => {
  const raw = localStorage.getItem(KEY);
  if (raw) return JSON.parse(raw);
  const s = seed();
  localStorage.setItem(KEY, JSON.stringify(s));
  return s;
};
const save = d => { localStorage.setItem(KEY, JSON.stringify(d)); bc.postMessage(1); emit(); };

// ---------- auth ----------
export const getSession = () => { try { return JSON.parse(sessionStorage.getItem(SES)); } catch { return null; } };
export const logout = () => sessionStorage.removeItem(SES);
// RBAC: the session becomes a Pengguna subclass (Kasir / Barista / Pemilik) that answers bisa(action).
const need = action => {
  const s = getSession();
  if (!s) throw err('ERR-AUTH-01');
  const user = Pengguna.dari(s);
  if (!user.bisa(action)) throw err('ERR-AUTH-04');
  return user;
};
export async function login(username, password) {
  if (!username?.trim()) throw err('ERR-VAL-07', 'Masukkan username');
  if ((password || '').length < 8) throw err('ERR-VAL-07', 'Password minimal 8 karakter');
  const db = load();
  const u = db.users.find(x => x.username === username.trim());
  if (u?.lockedUntil > Date.now()) throw err('ERR-AUTH-03');
  if (!u || u.password !== password) {
    if (u && ++u.failedAttempts >= 3) {
      u.failedAttempts = 0; u.lockedUntil = Date.now() + 15 * 60e3; save(db);
      throw err('ERR-AUTH-03');
    }
    if (u) save(db);
    throw err('ERR-AUTH-02');
  }
  u.failedAttempts = 0; u.lockedUntil = null; save(db);
  const s = { userId: u.id, username: u.username, role: u.role };
  sessionStorage.setItem(SES, JSON.stringify(s));
  return s;
}

// ---------- printer + notification services (async, simulated latency) ----------
export const getPrinter = () => localStorage.getItem('mudco-printer') || 'sim'; // sim | browser | offline
export const setPrinter = v => localStorage.setItem('mudco-printer', v);
// ponytail: real ESC/POS needs a print agent or WebUSB/Bluetooth; here it is simulated or uses window.print()
const printer = () => new PrinterService({ mode: getPrinter() });
const notif = () => new NotifikasiService({ kirim: () => bc.postMessage(1) }); // later: Supabase Realtime

// ---------- menus ----------
export const getMenus = async ({ all } = {}) => load().menus.filter(m => all || m.isActive);
export async function saveMenu(m) {
  need('manageMenu');
  const bad = MenuItem.fieldsBermasalah(m);
  if (bad.length) throw err('ERR-VAL-08', undefined, bad);
  const db = load();
  const i = db.menus.findIndex(x => x.id === m.id);
  const item = (i >= 0
    ? MenuItem.from(db.menus[i])
    : new MenuItem({ id: crypto.randomUUID(), nama: m.name, kategori: m.category, harga: m.price, hargaPokok: m.costPrice })
  ).perbarui(m);
  if (i >= 0) db.menus[i] = item.toJSON(); else db.menus.push(item.toJSON());
  save(db);
}
const patchMenu = async (id, fn) => {
  need('manageMenu');
  const db = load();
  const i = db.menus.findIndex(x => x.id === id);
  const item = MenuItem.from(db.menus[i]);
  fn(item);
  db.menus[i] = item.toJSON();
  save(db);
};
export const setAvailable = (id, v) => patchMenu(id, m => m.tandaiTersedia(v));
export const setActive = (id, v) => patchMenu(id, m => m.setAktif(v));
export async function deleteMenu(id) {
  need('manageMenu');
  const db = load();
  const used = db.orders.some(o => o.items.some(i => i.menuId === id)) || Object.values(db.summaries).some(s => s.menus.some(x => x.menuId === id));
  if (used) throw err('ERR-VAL-09'); // BR-35: soft delete only
  db.menus = db.menus.filter(m => m.id !== id);
  save(db);
}

// ---------- orders ----------
export async function createOrder({ tableNumber, paymentMethod, items }) {
  if (!items?.length) throw err('ERR-VAL-03');
  const db = load();
  // AGGREGATION: DaftarMenu groups MenuItems. COMPOSITION: Pesanan creates its own ItemPesanan.
  const pesanan = new Pesanan(
    { id: crypto.randomUUID(), number: 'OR' + String(++db.seq).padStart(4, '0'), tableNumber, paymentMethod },
    DaftarMenu.dari(db.menus),
  );
  items.forEach(({ menuId, quantity }) => pesanan.tambahItem(menuId, quantity)); // OVERLOADING: string version, re-validated server-side (BR-06)
  db.orders.push(pesanan.toJSON());
  save(db);
  // ASYNCHRONOUS: notify the cashier without making the buyer wait, then record that it was delivered (D2.notification_sent)
  notif().kirimKeKasir(pesanan).then(() => {
    const fresh = load();
    const row = fresh.orders.find(o => o.id === pesanan.id);
    if (row) { row.notificationSent = true; save(fresh); }
  });
  return pesanan.toJSON();
}
export async function getOrder(id) {
  const o = load().orders.find(x => x.id === id);
  if (!o) throw err('ERR-BIZ-01');
  return o;
}
export async function listOrders() {
  need('listOrders');
  const db = load();
  return db.orders.map(o => ({ ...o, tx: db.transactions.find(t => t.orderId === o.id) || null }));
}
export async function confirmPayment(orderId, uangDiterima) {
  const kasir = need('confirmPayment');
  const row = load().orders.find(x => x.id === orderId);
  if (!row) throw err('ERR-BIZ-01');
  const pesanan = Pesanan.from(row);
  const pembayaran = Pembayaran.untuk(pesanan.metode, pesanan.total(), uangDiterima); // POLYMORPHISM: Tunai or QRIS
  const pesan = kasir.konfirmasi(pesanan, pembayaran); // ASSOCIATION: Kasir works on the Pesanan it is handed (checks + status change in memory)
  // ASYNCHRONOUS: print the receipt and tell the barista at the same time (total time = the slower one, not the sum)
  const [cetak] = await Promise.all([printer().cetak(pesanan, new Nota()), notif().kirimKeBarista(pesanan)]);
  // Critical section (no await): re-check against fresh data, someone else may have confirmed meanwhile
  const db = load();
  const cur = db.orders.find(x => x.id === orderId);
  if (cur.status !== 'MENUNGGU' || db.transactions.some(t => t.orderId === orderId)) throw err('ERR-BIZ-02'); // BR-23
  cur.status = pesanan.status; cur.paidAt = pesanan.dibayar; cur.updatedAt = pesanan.diperbarui;
  db.transactions.push({ id: crypto.randomUUID(), orderId, confirmedBy: kasir.id, amount: pesanan.total(), printStatus: cetak.status, confirmedAt: pesanan.dibayar });
  save(db);
  return { printStatus: cetak.status, message: pesan, nota: cetak.teks };
}
export async function reprint(orderId) {
  need('reprint');
  const db = load();
  const row = db.orders.find(x => x.id === orderId);
  if (!row || !db.transactions.some(t => t.orderId === orderId)) throw err('ERR-BIZ-01');
  const { status } = await printer().cetak(Pesanan.from(row), new Nota());
  const fresh = load();
  fresh.transactions.find(t => t.orderId === orderId).printStatus = status;
  save(fresh);
  return status;
}
// The browser reports the print result after window.print() (TSD PATCH .../print-status). Never touches the payment (BR-27).
export async function setPrintStatus(orderId, status) {
  need('reprint');
  const db = load();
  const tx = db.transactions.find(t => t.orderId === orderId);
  if (!tx) throw err('ERR-BIZ-01');
  tx.printStatus = status;
  save(db);
}
export async function setStatus(orderId, to) {
  const barista = need('setStatus');
  const db = load();
  const row = db.orders.find(x => x.id === orderId);
  if (!row) throw err('ERR-BIZ-01');
  const pesanan = Pesanan.from(row);
  barista.kerjakan(pesanan, to); // ASSOCIATION; the order enforces the status sequence itself (ENCAPSULATION)
  Object.assign(row, pesanan.toJSON());
  save(db);
}

// ---------- ingredients & stock ----------
export async function getStock() {
  need('manageStock');
  const inv = Inventori.dari(load().ingredients); // AGGREGATION
  const low = new Set(inv.menipis().map(b => b.id));
  return {
    ingredients: inv.semua.map(b => ({ ...b.toJSON(), lowStock: low.has(b.id) })), // BR-41
    history: inv.semua.flatMap(b => b.riwayat.map(h => ({ ...h, ingredientId: b.id, name: b.nama }))).sort((a, b) => b.createdAt - a.createdAt),
  };
}
export async function saveIngredient(i) {
  need('manageStock');
  const db = load();
  const bad = BahanBaku.fieldsBermasalah(i);
  if (db.ingredients.some(x => x.id !== i.id && x.name.toLowerCase() === i.name?.trim().toLowerCase())) bad.push('name');
  if (bad.length) throw err('ERR-VAL-10', undefined, bad);
  const idx = db.ingredients.findIndex(x => x.id === i.id);
  const b = idx >= 0
    ? BahanBaku.from(db.ingredients[idx]).perbarui(i) // stock itself changes only via addStock (keeps history consistent)
    : new BahanBaku({ id: crypto.randomUUID(), nama: i.name, satuan: i.unit, stok: i.stockQty, stokMinimum: i.minStock });
  if (idx >= 0) db.ingredients[idx] = b.toJSON(); else db.ingredients.push(b.toJSON());
  save(db);
}
export async function setIngredientActive(id, isActive) {
  need('manageStock');
  const db = load();
  const idx = db.ingredients.findIndex(x => x.id === id);
  const b = BahanBaku.from(db.ingredients[idx]);
  b.setAktif(isActive); // BR-37: deactivate, never delete
  db.ingredients[idx] = b.toJSON();
  save(db);
}
export async function addStock({ ingredientId, changeType, quantity }) {
  const user = need('manageStock');
  const db = load();
  const idx = db.ingredients.findIndex(x => x.id === ingredientId);
  if (idx < 0 || !['STOK_MASUK', 'PENYESUAIAN'].includes(changeType)) throw err('ERR-VAL-11', undefined, ['quantity']);
  const b = BahanBaku.from(db.ingredients[idx]);
  if (changeType === 'STOK_MASUK') b.stokMasuk(quantity, user); else b.sesuaikanStok(quantity, user); // both throw ERR-VAL-11 on bad input
  db.ingredients[idx] = b.toJSON();
  save(db);
  return { ...b.toJSON(), lowStock: b.menipis() };
}

// ---------- report (BR-43) ----------
function summarize(db, date) {
  const txs = db.transactions.filter(t => day(t.confirmedAt) === date);
  const by = {};
  txs.forEach(t => db.orders.find(o => o.id === t.orderId).items.forEach(i => {
    const r = (by[i.menuId] ||= { menuId: i.menuId, name: i.name, qtySold: 0, revenue: 0, cost: 0 });
    r.qtySold += i.quantity;
    r.revenue += i.subtotal;
    r.cost += (db.menus.find(m => m.id === i.menuId)?.costPrice ?? 0) * i.quantity;
  }));
  const menus = Object.values(by);
  const sum = k => menus.reduce((a, r) => a + r[k], 0);
  return { date, totalOrders: txs.length, totalRevenue: sum('revenue'), totalCost: sum('cost'), estimatedProfit: sum('revenue') - sum('cost'), menus };
}
export async function getReport(from, to) {
  need('viewReport');
  const today = day(Date.now());
  if (!from || !to || from > to || to > today) throw err('ERR-VAL-12');
  const db = load();
  const days = [];
  let dirty = false;
  for (let t = new Date(from + 'T12:00:00'); day(t) <= to; t.setDate(t.getDate() + 1)) {
    const d = day(t);
    let s = d < today && db.summaries[d]; // past days come from stored history (D7)
    if (!s) {
      s = summarize(db, d);
      if (s.totalOrders && JSON.stringify(s) !== JSON.stringify(db.summaries[d])) { db.summaries[d] = s; dirty = true; }
    }
    days.push(s);
  }
  if (dirty) save(db); // only when changed, otherwise subscribers would loop
  const by = {};
  days.forEach(s => s.menus.forEach(m => {
    const r = (by[m.menuId] ||= { ...m, qtySold: 0, revenue: 0, cost: 0 });
    r.qtySold += m.qtySold; r.revenue += m.revenue; r.cost += m.cost;
  }));
  const sum = k => days.reduce((a, s) => a + s[k], 0);
  return {
    totalOrders: sum('totalOrders'), totalRevenue: sum('totalRevenue'), totalCost: sum('totalCost'), estimatedProfit: sum('estimatedProfit'),
    menus: Object.values(by).sort((a, b) => b.qtySold - a.qtySold),
    history: Object.values(db.summaries).sort((a, b) => b.date.localeCompare(a.date)),
  };
}
