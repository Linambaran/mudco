// Mock backend: localStorage + BroadcastChannel (real-time across tabs of one browser).
// Every function is async and enforces the FSD rules (RBAC, validation, status order),
// so replacing this file with fetch()/Supabase calls keeps the UI untouched.
export const MOCK = true;
const KEY = 'mudco-db';
const SES = 'mudco-session';
const bc = new BroadcastChannel('mudco');
const subs = new Set();
const emit = () => subs.forEach(f => f());
bc.onmessage = emit;
export const subscribe = f => (subs.add(f), () => subs.delete(f));

// Error catalog (FSD Bagian 6)
export const MSG = {
  'ERR-VAL-01': 'QR Code tidak valid, silakan hubungi staf',
  'ERR-VAL-02': 'Jumlah item minimal 1 dan maksimal 20',
  'ERR-VAL-03': 'Pilih minimal 1 menu sebelum checkout',
  'ERR-VAL-04': 'Menu [nama] sedang habis, silakan hapus dari keranjang',
  'ERR-VAL-05': 'Nomor meja tidak valid (1–10)',
  'ERR-VAL-06': 'Pilih metode pembayaran',
  'ERR-VAL-07': 'Masukkan username / Password minimal 8 karakter',
  'ERR-VAL-08': 'Periksa kembali data menu (nama, harga, HPP)',
  'ERR-VAL-09': 'Menu memiliki riwayat transaksi, nonaktifkan sebagai gantinya',
  'ERR-VAL-10': 'Periksa kembali data bahan baku',
  'ERR-VAL-11': 'Jumlah stok tidak valid',
  'ERR-VAL-12': 'Rentang tanggal tidak valid',
  'ERR-BIZ-01': 'Pesanan tidak tersedia',
  'ERR-BIZ-02': 'Pesanan ini sudah dikonfirmasi sebelumnya',
  'ERR-BIZ-03': 'Mulai proses pesanan terlebih dahulu',
  'ERR-AUTH-01': 'Anda harus login untuk mengakses halaman ini',
  'ERR-AUTH-02': 'Username atau password salah',
  'ERR-AUTH-03': 'Akun dikunci. Coba lagi dalam 15 menit',
  'ERR-AUTH-04': 'Anda tidak memiliki izin untuk mengakses halaman ini',
  'ERR-SYS-01': 'Layanan tidak tersedia. Silakan coba lagi',
  'ERR-SYS-02': 'Gagal memuat menu, periksa koneksi internet Anda',
  'ERR-SYS-04': 'Nota gagal dicetak, silakan cetak ulang manual',
  'ERR-SYS-05': '', // race condition: handled silently
};
export const soldOutMsg = nama => MSG['ERR-VAL-04'].replace('[nama]', nama);
export class ApiError extends Error {
  constructor(code, text, fields) {
    super(text ?? MSG[code]);
    this.code = code;
    this.fields = fields || [];
  }
}
const err = (...a) => new ApiError(...a);

const day = t => new Date(t).toLocaleDateString('sv-SE'); // YYYY-MM-DD, local time
const r2 = n => Math.round(n * 100) / 100;
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
  const ing = (name, unit, stockQty, minStock) => ({ id: id(), name, unit, stockQty, minStock, isActive: true, updatedAt: Date.now() });
  return {
    seq: 0,
    // ponytail: plaintext passwords in the mock; the real backend must store bcrypt hashes (BR-17)
    users: [user('kasir', 'KASIR'), user('barista', 'BARISTA'), user('pemilik', 'PEMILIK')],
    menus, orders: [], transactions: [], stockHistories: [], summaries,
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
const need = role => {
  const s = getSession();
  if (!s) throw err('ERR-AUTH-01');
  if (role && ![].concat(role).includes(s.role)) throw err('ERR-AUTH-04');
  return s;
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

// ---------- printer (device setting: sim | browser | offline) ----------
export const getPrinter = () => localStorage.getItem('mudco-printer') || 'sim';
export const setPrinter = v => localStorage.setItem('mudco-printer', v);
// ponytail: real ESC/POS needs a print agent or WebUSB/Bluetooth; here it is simulated or uses window.print()
const printResult = () => (getPrinter() === 'offline' ? 'GAGAL' : 'BERHASIL');

// ---------- menus ----------
export const getMenus = async ({ all } = {}) => load().menus.filter(m => all || m.isActive);
const menuBad = m => [
  !(m.name?.trim().length >= 3 && m.name.trim().length <= 100) && 'name',
  !(+m.price > 0) && 'price',
  !(m.costPrice !== '' && m.costPrice != null && +m.costPrice >= 0) && 'costPrice',
  !(m.category?.trim() && m.category.trim().length <= 50) && 'category',
].filter(Boolean);
export async function saveMenu(m) {
  need('PEMILIK');
  const bad = menuBad(m);
  if (bad.length) throw err('ERR-VAL-08', undefined, bad);
  const db = load();
  const rec = { name: m.name.trim(), category: m.category.trim(), price: +m.price, costPrice: +m.costPrice, imageUrl: m.imageUrl?.trim() || '' };
  const cur = m.id && db.menus.find(x => x.id === m.id);
  if (cur) Object.assign(cur, rec);
  else db.menus.push({ id: crypto.randomUUID(), isAvailable: true, isActive: true, ...rec });
  save(db);
}
const patchMenu = async (id, p) => { need('PEMILIK'); const db = load(); Object.assign(db.menus.find(x => x.id === id), p); save(db); };
export const setAvailable = (id, isAvailable) => patchMenu(id, { isAvailable });
export const setActive = (id, isActive) => patchMenu(id, { isActive });
export async function deleteMenu(id) {
  need('PEMILIK');
  const db = load();
  const used = db.orders.some(o => o.items.some(i => i.menuId === id)) || Object.values(db.summaries).some(s => s.menus.some(x => x.menuId === id));
  if (used) throw err('ERR-VAL-09'); // BR-35: soft delete only
  db.menus = db.menus.filter(m => m.id !== id);
  save(db);
}

// ---------- orders ----------
export async function createOrder({ tableNumber, paymentMethod, items }) {
  if (!items?.length) throw err('ERR-VAL-03');
  if (!(Number.isInteger(tableNumber) && tableNumber >= 1 && tableNumber <= 10)) throw err('ERR-VAL-05');
  if (!['QRIS', 'TUNAI'].includes(paymentMethod)) throw err('ERR-VAL-06');
  const db = load();
  const lines = items.map(({ menuId, quantity }) => {
    if (!(Number.isInteger(quantity) && quantity >= 1 && quantity <= 20)) throw err('ERR-VAL-02');
    const m = db.menus.find(x => x.id === menuId);
    if (!m || !m.isActive || !m.isAvailable) throw err('ERR-VAL-04', soldOutMsg(m?.name ?? 'ini')); // BR-06: re-validated server-side
    return { menuId, name: m.name, price: m.price, quantity, subtotal: m.price * quantity };
  });
  const o = {
    id: crypto.randomUUID(), number: 'OR' + String(++db.seq).padStart(4, '0'), tableNumber, paymentMethod,
    status: 'MENUNGGU', items: lines, total: lines.reduce((a, l) => a + l.subtotal, 0),
    notificationSent: true, createdAt: Date.now(), updatedAt: Date.now(), paidAt: null,
  };
  db.orders.push(o);
  save(db);
  return o;
}
export async function getOrder(id) {
  const o = load().orders.find(x => x.id === id);
  if (!o) throw err('ERR-BIZ-01');
  return o;
}
export async function listOrders() {
  need(['KASIR', 'BARISTA']);
  const db = load();
  return db.orders.map(o => ({ ...o, tx: db.transactions.find(t => t.orderId === o.id) || null }));
}
export async function confirmPayment(orderId) {
  const s = need('KASIR');
  const db = load();
  const o = db.orders.find(x => x.id === orderId);
  if (!o) throw err('ERR-BIZ-01');
  if (o.status !== 'MENUNGGU' || db.transactions.some(t => t.orderId === o.id)) throw err('ERR-BIZ-02'); // BR-23
  const printStatus = printResult(); // BR-27: print failure never cancels the payment
  o.status = 'DIBAYAR';
  o.paidAt = o.updatedAt = Date.now();
  db.transactions.push({ id: crypto.randomUUID(), orderId, confirmedBy: s.userId, amount: o.total, printStatus, confirmedAt: o.paidAt });
  save(db);
  return { printStatus };
}
export async function reprint(orderId) {
  need('KASIR');
  const db = load();
  const t = db.transactions.find(x => x.orderId === orderId);
  if (!t) throw err('ERR-BIZ-01');
  t.printStatus = printResult();
  save(db);
  return t.printStatus;
}
const NEXT = { DIBAYAR: 'DIPROSES', DIPROSES: 'SELESAI' };
export async function setStatus(orderId, to) {
  need('BARISTA');
  const db = load();
  const o = db.orders.find(x => x.id === orderId);
  if (!o) throw err('ERR-BIZ-01');
  if (o.status === to) throw err('ERR-SYS-05'); // someone else already did it: first change wins
  if (NEXT[o.status] !== to) throw err('ERR-BIZ-03'); // BR-30: no skipping steps
  o.status = to;
  o.updatedAt = Date.now();
  save(db);
}

// ---------- ingredients & stock ----------
const ingBad = i => [
  !(i.name?.trim().length >= 1 && i.name.trim().length <= 100) && 'name',
  !(i.unit?.trim() && i.unit.trim().length <= 20) && 'unit',
  !(i.stockQty !== '' && +i.stockQty >= 0) && 'stockQty',
  !(i.minStock !== '' && +i.minStock >= 0) && 'minStock',
].filter(Boolean);
export async function getStock() {
  need('PEMILIK');
  const db = load();
  return {
    ingredients: db.ingredients.map(i => ({ ...i, lowStock: i.isActive && i.stockQty <= i.minStock })), // BR-41
    history: [...db.stockHistories].reverse().map(h => ({ ...h, name: db.ingredients.find(i => i.id === h.ingredientId)?.name })),
  };
}
export async function saveIngredient(i) {
  need('PEMILIK');
  const db = load();
  const bad = ingBad(i);
  if (db.ingredients.some(x => x.id !== i.id && x.name.toLowerCase() === i.name?.trim().toLowerCase())) bad.push('name');
  if (bad.length) throw err('ERR-VAL-10', undefined, bad);
  const rec = { name: i.name.trim(), unit: i.unit.trim(), minStock: +i.minStock, updatedAt: Date.now() };
  const cur = i.id && db.ingredients.find(x => x.id === i.id);
  if (cur) Object.assign(cur, rec); // stock itself changes only via addStock (keeps history consistent)
  else db.ingredients.push({ id: crypto.randomUUID(), isActive: true, stockQty: +i.stockQty, ...rec });
  save(db);
}
export async function setIngredientActive(id, isActive) {
  need('PEMILIK');
  const db = load();
  db.ingredients.find(x => x.id === id).isActive = isActive; // BR-37: deactivate, never delete
  save(db);
}
export async function addStock({ ingredientId, changeType, quantity }) {
  const s = need('PEMILIK');
  const db = load();
  const ing = db.ingredients.find(x => x.id === ingredientId);
  const q = +quantity;
  const ok = ing && quantity !== '' && (changeType === 'STOK_MASUK' ? q > 0 : changeType === 'PENYESUAIAN' && q >= 0); // BR-40: never negative
  if (!ok) throw err('ERR-VAL-11', undefined, ['quantity']);
  const delta = r2(changeType === 'STOK_MASUK' ? q : q - ing.stockQty); // adjustment logs the difference
  ing.stockQty = r2(ing.stockQty + delta);
  ing.updatedAt = Date.now();
  db.stockHistories.push({ id: crypto.randomUUID(), ingredientId, userId: s.userId, username: s.username, changeType, quantity: delta, createdAt: Date.now() });
  save(db);
  return { ...ing, lowStock: ing.stockQty <= ing.minStock };
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
  need('PEMILIK');
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
