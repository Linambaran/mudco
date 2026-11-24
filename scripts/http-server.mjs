// HTTP facade over src/api.js that follows TSD v1.2 (Bagian 3, 6): /api/v1, JSON envelope, one route group per role,
// JWT (HS256, 12 h), rate limit 10/min, pagination, snake_case fields.  Run: npm run api  (http://localhost:3000)
// Data lives in memory (same seed as the app) and resets on restart. The real backend (Express + SQL Server) is a rewrite of this file.
import http from 'node:http';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

// api.js reads the session from sessionStorage; give each request its own, so concurrent requests cannot mix roles.
const als = new AsyncLocalStorage();
const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = memory();
globalThis.sessionStorage = { getItem: () => als.getStore() ?? null, setItem() {}, removeItem() {} };
const api = await import('../src/api.js');

const PORT = +process.env.PORT || 3000;
const RATE_MAX = +process.env.RATE_LIMIT_MAX || 10; // TSD 6.2: 10 requests / 60 s on POST /auth/login and POST /orders
const TTL = 12 * 3600; // 43200 s
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const HOME = { KASIR: '/kasir/pesanan', BARISTA: '/barista/antrian', PEMILIK: '/pemilik/dashboard' };

// ---------- JWT (stateless, TSD 6.2) ----------
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const mac = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const sign = payload => { const h = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`; return `${h}.${mac(h)}`; };
function verify(token) {
  const [h, p, s] = token.split('.');
  if (!s || mac(`${h}.${p}`) !== s) return null;
  try { const pl = JSON.parse(Buffer.from(p, 'base64url')); return pl.exp * 1000 > Date.now() ? pl : null; } catch { return null; }
}

// ---------- errors: FSD catalog (api.MSG) + the three TSD-only codes ----------
const TSD_MSG = {
  'ERR-REQ-01': 'Format permintaan tidak valid',
  'ERR-REQ-02': 'Data tidak ditemukan',
  'ERR-SYS-05': 'Status sudah diperbarui',
  'ERR-RATE-01': 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi',
};
const fail = (code, errors) => Object.assign(new api.ApiError(code, TSD_MSG[code]), { errors });
const STATUS = {
  'ERR-VAL-01': 404, 'ERR-VAL-04': 409, 'ERR-VAL-09': 409,
  'ERR-AUTH-01': 401, 'ERR-AUTH-02': 401, 'ERR-AUTH-03': 403, 'ERR-AUTH-04': 403,
  'ERR-BIZ-01': 404, 'ERR-BIZ-02': 409, 'ERR-BIZ-03': 409, 'ERR-SYS-05': 409,
  'ERR-REQ-01': 422, 'ERR-REQ-02': 404, 'ERR-RATE-01': 429,
};
const httpStatus = c => STATUS[c] ?? (c.startsWith('ERR-VAL') ? 422 : 503);
const FIELD_MSG = {
  'ERR-VAL-08': { name: 'Nama menu minimal 3 karakter', price: 'Harga harus lebih dari 0', cost_price: 'HPP tidak boleh negatif', category: 'Kategori wajib diisi' },
  'ERR-VAL-10': { name: 'Nama bahan wajib diisi', unit: 'Satuan wajib diisi', stock_qty: 'Jumlah stok tidak boleh negatif', min_stock: 'Jumlah stok tidak boleh negatif' },
};
const snake = s => s.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
const errorsOf = e => e.errors ?? Object.fromEntries((e.fields || []).map(f => [snake(f), [FIELD_MSG[e.code]?.[snake(f)] ?? e.message]]));

// ---------- helpers ----------
const iso = t => (t == null ? null : new Date(t).toISOString());
const ymd = t => new Date(t).toLocaleDateString('sv-SE'); // local date, same as api.js
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const flag = (v, name) => { if (typeof v !== 'boolean') throw fail('ERR-REQ-01', { [name]: ['Harus true atau false'] }); return v; };
const str = v => (typeof v === 'string' ? v : ''); // non-strings fail the domain's validation instead of crashing
const must = (cond, code = 'ERR-REQ-01') => { if (!cond) throw fail(code); };
const R = (data, message = 'OK', code = 200, meta) => ({ code, body: { status: 'success', data, ...(meta && { meta }), message } });
function paged(rows, q, message) { // TSD 7.2: default 15, max 100
  const per = Math.min(Math.max(parseInt(q.per_page) || 15, 1), 100);
  const cur = Math.max(parseInt(q.page) || 1, 1);
  const meta = { current_page: cur, per_page: per, total: rows.length, last_page: Math.max(Math.ceil(rows.length / per), 1) };
  return R(rows.slice((cur - 1) * per, cur * per), message, 200, meta);
}

// ---------- response shapes (api.js camelCase -> TSD snake_case) ----------
const menuPublic = m => ({ menu_id: m.id, name: m.name, category: m.category, price: m.price, image_url: m.imageUrl || null, is_available: m.isAvailable }); // no cost_price (AC-10)
const menuOwner = m => ({ ...menuPublic(m), cost_price: m.costPrice, is_active: m.isActive, created_at: null }); // ponytail: the mock does not store menu created_at
const orderOut = o => ({
  order_id: o.id, order_no: +o.number.replace(/\D/g, ''), table_number: o.tableNumber, order_status: o.status,
  payment_method: o.paymentMethod, total_amount: o.total, items: o.items.map(i => ({ name: i.name, quantity: i.quantity, subtotal: i.subtotal })), created_at: iso(o.createdAt),
});
const ingOut = i => ({ ingredient_id: i.id, name: i.name, unit: i.unit, stock_qty: i.stockQty, min_stock: i.minStock, low_stock: i.lowStock, is_active: i.isActive, updated_at: iso(i.updatedAt) });
const historyOut = h => ({ history_id: h.id, change_type: h.changeType, quantity: h.quantity, created_at: iso(h.createdAt) });

const menusAll = () => api.getMenus({ all: true });
const findMenu = async id => (await menusAll()).find(m => m.id === id) ?? Promise.reject(fail('ERR-REQ-02'));
const findIngredient = async id => (await api.getStock()).ingredients.find(i => i.id === id) ?? Promise.reject(fail('ERR-REQ-02'));

// ---------- handlers ----------
function validateOrder(b) { // TSD 3.3b: errors holds every failed field, error_code is the first rule that failed (03, 05, 06, 02)
  const errors = {}; let code;
  const bad = (c, field) => { code ||= c; (errors[field] ||= []).push(api.MSG[c]); };
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) bad('ERR-VAL-03', 'items');
  if (!(Number.isInteger(b.table_number) && b.table_number >= 1 && b.table_number <= 10)) bad('ERR-VAL-05', 'table_number');
  if (!['QRIS', 'TUNAI'].includes(b.payment_method)) bad('ERR-VAL-06', 'payment_method');
  items.forEach((it, i) => { if (!(Number.isInteger(it?.quantity) && it.quantity >= 1 && it.quantity <= 20)) bad('ERR-VAL-02', `items.${i}.quantity`); });
  if (code) throw fail(code, errors);
  items.forEach(it => must(typeof it.menu_id === 'string'));
}

const routes = [
  // [method, path, who, limited?, handler]   who: null = public, 'ANY' = any internal role, else one role (AC-04)
  // ---- public (pembeli) ----
  ['GET', '/menus', null, false, async ({ q }) => {
    const s = (q.search || '').toLowerCase();
    const rows = (await api.getMenus()).filter(m => (!q.category || m.category === q.category) && m.name.toLowerCase().includes(s));
    return paged(rows.map(menuPublic), q);
  }],
  ['POST', '/orders', null, true, async ({ body: b }) => {
    validateOrder(b);
    const known = new Set((await menusAll()).map(m => m.id));
    if (b.items.some(it => !known.has(it.menu_id))) throw fail('ERR-REQ-02');
    // prices come from the server's menu, never from the client (AC-06)
    const o = await api.createOrder({ tableNumber: b.table_number, paymentMethod: b.payment_method, items: b.items.map(i => ({ menuId: i.menu_id, quantity: i.quantity })) });
    const { created_at, ...out } = orderOut(o);
    return R(out, 'Pesanan berhasil dikirim', 201);
  }],
  ['GET', '/orders/:id', null, false, async ({ p }) => R(orderOut(await api.getOrder(p.id)))],
  ['POST', '/auth/login', null, true, async ({ body: b }) => {
    if (typeof b.username !== 'string' || typeof b.password !== 'string') throw fail('ERR-VAL-07');
    const s = await api.login(b.username.slice(0, 50), b.password); // lockout after 3 failures is inside api.js (BR-18)
    const token = sign({ user_id: s.userId, username: s.username, role: s.role, exp: Math.floor(Date.now() / 1000) + TTL });
    return R({ token, token_type: 'Bearer', expires_in: TTL, user: { user_id: s.userId, username: s.username, role: s.role }, redirect_to: HOME[s.role] }, 'Login berhasil');
  }],
  ['POST', '/auth/logout', 'ANY', false, async () => R(null, 'Logout berhasil')], // JWT is stateless: the client drops the token

  // ---- /kasir (KASIR only) ----
  ['GET', '/kasir/orders', 'KASIR', false, async ({ q }) => {
    if (q.status) must(['MENUNGGU', 'DIBAYAR', 'DIPROSES', 'SELESAI'].includes(q.status));
    const rows = (await api.listOrders()).filter(o => !q.status || o.status === q.status).sort((a, b) => b.createdAt - a.createdAt);
    return paged(rows.map(o => ({
      order_id: o.id, order_no: +o.number.replace(/\D/g, ''), table_number: o.tableNumber, items: o.items.map(i => ({ name: i.name, quantity: i.quantity })),
      total_amount: o.total, payment_method: o.paymentMethod, order_status: o.status, notification_sent: o.notificationSent,
      print_status: o.tx?.printStatus ?? null, created_at: iso(o.createdAt),
    })), q);
  }],
  ['PATCH', '/kasir/orders/:id/payment', 'KASIR', false, async ({ p }) => {
    await api.confirmPayment(p.id); // ERR-BIZ-01 / ERR-BIZ-02 come from the domain (BR-23)
    await api.setPrintStatus(p.id, 'BELUM'); // the browser prints and reports back via /print-status (TSD AC-08)
    const o = (await api.listOrders()).find(x => x.id === p.id);
    return R({ order_id: o.id, order_status: o.status, transaction_id: o.tx.id, confirmed_at: iso(o.tx.confirmedAt), print_status: o.tx.printStatus }, 'Pembayaran dikonfirmasi');
  }],
  ['GET', '/kasir/orders/:id/nota', 'KASIR', false, async ({ p }) => {
    const o = (await api.listOrders()).find(x => x.id === p.id);
    if (!o?.tx) throw fail('ERR-BIZ-01'); // missing, or not paid yet
    return { code: 200, html: notaHtml(o) };
  }],
  ['PATCH', '/kasir/orders/:id/print-status', 'KASIR', false, async ({ p, body: b }) => {
    must(['BERHASIL', 'GAGAL'].includes(b.print_status));
    await api.setPrintStatus(p.id, b.print_status);
    return R({ order_id: p.id, print_status: b.print_status }, 'Status cetak dicatat');
  }],

  // ---- /barista (BARISTA only) ----
  ['GET', '/barista/queue', 'BARISTA', false, async ({ q }) => {
    const rows = (await api.listOrders()).filter(o => ['DIBAYAR', 'DIPROSES'].includes(o.status)).sort((a, b) => a.tx.confirmedAt - b.tx.confirmedAt); // FIFO
    return paged(rows.map(o => ({
      order_id: o.id, order_no: +o.number.replace(/\D/g, ''), table_number: o.tableNumber, order_status: o.status,
      confirmed_at: iso(o.tx.confirmedAt), items: o.items.map(i => ({ name: i.name, quantity: i.quantity })),
    })), q);
  }],
  ['PATCH', '/barista/orders/:id/status', 'BARISTA', false, async ({ p, body: b }) => {
    must(['DIPROSES', 'SELESAI'].includes(b.order_status));
    await api.setStatus(p.id, b.order_status); // ERR-BIZ-01 / ERR-BIZ-03 / ERR-SYS-05 come from the domain (BR-30)
    return R({ order_id: p.id, order_status: b.order_status }, 'Status pesanan diperbarui');
  }],

  // ---- /pemilik (PEMILIK only) ----
  ['GET', '/pemilik/menus', 'PEMILIK', false, async ({ q }) => {
    const rows = (await menusAll()).filter(m => (q.include_inactive === 'true' || m.isActive) && (!q.category || m.category === q.category));
    return paged(rows.map(menuOwner), q);
  }],
  ['POST', '/pemilik/menus', 'PEMILIK', false, async ({ body: b }) => {
    if (b.is_available !== undefined) flag(b.is_available, 'is_available');
    await api.saveMenu({ name: b.name, category: b.category, price: b.price, costPrice: b.cost_price, imageUrl: String(b.image_url ?? '') }); // ERR-VAL-08
    const m = (await menusAll()).filter(x => x.name === b.name.trim()).at(-1);
    if (b.is_available === false) await api.setAvailable(m.id, false);
    const { menu_id, name, category, price, cost_price, is_active } = menuOwner(m);
    return R({ menu_id, name, category, price, cost_price, is_available: b.is_available !== false, is_active }, 'Menu berhasil disimpan', 201);
  }],
  ['PATCH', '/pemilik/menus/:id', 'PEMILIK', false, async ({ p, body: b }) => {
    const m = await findMenu(p.id);
    if (b.is_available !== undefined) flag(b.is_available, 'is_available');
    if (b.is_active !== undefined) flag(b.is_active, 'is_active');
    await api.saveMenu({
      id: p.id, name: b.name ?? m.name, category: b.category ?? m.category, price: b.price ?? m.price,
      costPrice: b.cost_price ?? m.costPrice, imageUrl: String(b.image_url ?? m.imageUrl ?? ''), // old orders keep their own price snapshot
    });
    if (b.is_available !== undefined) await api.setAvailable(p.id, b.is_available);
    if (b.is_active !== undefined) await api.setActive(p.id, b.is_active);
    const o = menuOwner(await findMenu(p.id));
    return R({ menu_id: o.menu_id, name: o.name, price: o.price, cost_price: o.cost_price, is_available: o.is_available, is_active: o.is_active }, 'Menu berhasil diperbarui');
  }],
  ['DELETE', '/pemilik/menus/:id', 'PEMILIK', false, async ({ p }) => {
    await findMenu(p.id);
    await api.deleteMenu(p.id); // ERR-VAL-09 when the menu has history (BR-35)
    return R({ menu_id: p.id }, 'Menu dihapus');
  }],
  ['GET', '/pemilik/ingredients', 'PEMILIK', false, async ({ q }) => {
    const rows = (await api.getStock()).ingredients.filter(i => (q.include_inactive === 'true' || i.isActive) && (q.low_stock_only !== 'true' || i.lowStock));
    return paged(rows.map(ingOut), q);
  }],
  ['POST', '/pemilik/ingredients', 'PEMILIK', false, async ({ body: b }) => {
    await api.saveIngredient({ name: str(b.name), unit: str(b.unit), stockQty: b.stock_qty, minStock: b.min_stock }); // ERR-VAL-10 (incl. duplicate name)
    const i = (await api.getStock()).ingredients.find(x => x.name === b.name.trim());
    const { ingredient_id, name, unit, stock_qty, min_stock, is_active } = ingOut(i);
    return R({ ingredient_id, name, unit, stock_qty, min_stock, is_active }, 'Bahan baku berhasil disimpan', 201);
  }],
  ['PATCH', '/pemilik/ingredients/:id', 'PEMILIK', false, async ({ p, body: b }) => {
    const i = await findIngredient(p.id);
    if (b.is_active !== undefined) flag(b.is_active, 'is_active');
    // stock_qty is ignored on purpose: stock changes only through /stock so every change has a history row (BR-39)
    await api.saveIngredient({ id: p.id, name: b.name === undefined ? i.name : str(b.name), unit: b.unit === undefined ? i.unit : str(b.unit), stockQty: i.stockQty, minStock: b.min_stock ?? i.minStock });
    if (b.is_active !== undefined) await api.setIngredientActive(p.id, b.is_active);
    const o = ingOut(await findIngredient(p.id));
    return R({ ingredient_id: o.ingredient_id, name: o.name, unit: o.unit, min_stock: o.min_stock, is_active: o.is_active }, 'Bahan baku berhasil diperbarui');
  }],
  ['DELETE', '/pemilik/ingredients/:id', 'PEMILIK', false, async ({ p }) => {
    await findIngredient(p.id);
    await api.setIngredientActive(p.id, false); // soft delete, history stays (BR-37)
    return R({ ingredient_id: p.id, is_active: false }, 'Bahan baku dinonaktifkan');
  }],
  ['POST', '/pemilik/ingredients/:id/stock', 'PEMILIK', false, async ({ p, body: b }) => {
    must(['STOK_MASUK', 'PENYESUAIAN'].includes(b.change_type));
    const i = await findIngredient(p.id);
    must(i.isActive, 'ERR-REQ-02'); // sp_record_stock_change only sees active ingredients
    const r = await api.addStock({ ingredientId: p.id, changeType: b.change_type, quantity: b.quantity }); // ERR-VAL-11 (BR-40)
    return R({ ingredient_id: p.id, stock_qty: r.stockQty, low_stock: r.lowStock, history: historyOut(r.riwayat.at(-1)) }, 'Stok berhasil dicatat', 201);
  }],
  ['GET', '/pemilik/stock-histories', 'PEMILIK', false, async ({ q }) => {
    const rows = (await api.getStock()).history.filter(h =>
      (!q.ingredient_id || h.ingredientId === q.ingredient_id) && (!q.from || ymd(h.createdAt) >= q.from) && (!q.to || ymd(h.createdAt) <= q.to));
    return paged(rows.map(h => ({ ...historyOut(h), ingredient_id: h.ingredientId, ingredient_name: h.name, recorded_by: h.username })), q);
  }],
  ['GET', '/pemilik/laporan', 'PEMILIK', false, async ({ q }) => {
    const start = q.start_date || ymd(Date.now()), end = q.end_date || start;
    must(DATE.test(start) && DATE.test(end), 'ERR-VAL-12');
    const r = await api.getReport(start, end); // ERR-VAL-12 unless start <= end <= today
    return R({
      start_date: start, end_date: end, total_orders: r.totalOrders, total_revenue: r.totalRevenue, total_cost: r.totalCost, estimated_profit: r.estimatedProfit,
      per_menu: r.menus.map(m => ({ menu_id: m.menuId, menu: m.name, qty_sold: m.qtySold, revenue: m.revenue, cost: m.cost, profit: m.revenue - m.cost })),
    }, r.totalOrders ? 'OK' : 'Belum ada transaksi pada periode ini');
  }],
  ['GET', '/pemilik/laporan/riwayat', 'PEMILIK', false, async ({ q }) => {
    for (const d of [q.from, q.to]) must(!d || DATE.test(d), 'ERR-VAL-12');
    must(!(q.from && q.to && q.from > q.to), 'ERR-VAL-12');
    const today = ymd(Date.now());
    const rows = (await api.getReport(today, today)).history.filter(s => (!q.from || s.date >= q.from) && (!q.to || s.date <= q.to));
    return paged(rows.map(s => ({ summary_date: s.date, total_orders: s.totalOrders, total_revenue: s.totalRevenue, total_cost: s.totalCost, estimated_profit: s.estimatedProfit })), q);
  }],
];

// Receipt page, 80 mm wide, printed by the cashier's browser (TSD 1.1). No digital receipt exists (BR-28).
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const rp = n => 'Rp' + n.toLocaleString('id-ID');
const notaHtml = o => `<!doctype html><html><head><meta charset="utf-8"><title>Nota ${esc(o.number)}</title>
<style>@page{size:80mm auto;margin:0}body{width:72mm;margin:0;padding:4mm;font:12px monospace}.r{display:flex;justify-content:space-between}hr{border:0;border-top:1px dashed #000}</style></head>
<body onload="window.print()"><b>MUD.CO</b><br>No. Pesanan: ${esc(o.number)}<br>Meja: ${o.tableNumber}<br>${esc(new Date(o.tx.confirmedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}<hr>
${o.items.map(i => `<div>${esc(i.name)}</div><div class="r"><span>${i.quantity} x ${rp(i.price)}</span><span>${rp(i.subtotal)}</span></div>`).join('')}<hr>
<div class="r"><span>Subtotal</span><span>${rp(o.total)}</span></div><div class="r"><b>TOTAL</b><b>${rp(o.total)}</b></div>Pembayaran: ${esc(o.paymentMethod)}</body></html>`;

// ---------- server ----------
const hits = new Map(); // "ip route" -> timestamps in the last 60 s
const limited = key => {
  const now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < 60e3);
  list.push(now); hits.set(key, list);
  return list.length > RATE_MAX;
};
const match = (route, path) => {
  const a = route.split('/'), b = path.split('/');
  if (a.length !== b.length) return null;
  const p = {};
  for (let i = 0; i < a.length; i++) { if (a[i].startsWith(':')) p[a[i].slice(1)] = decodeURIComponent(b[i]); else if (a[i] !== b[i]) return null; }
  return p;
};

http.createServer(async (req, res) => {
  const send = (code, body, type = 'application/json') => {
    res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };
  const sendError = e => {
    const code = e.code?.startsWith?.('ERR-') ? e.code : 'ERR-SYS-01';
    if (code === 'ERR-SYS-01') console.error('[ERR-SYS-01]', e); // server log only, never sent to the client
    if (['ERR-AUTH-02', 'ERR-AUTH-03', 'ERR-AUTH-04'].includes(code)) console.warn(`[${code}] ${req.method} ${req.url}`); // never log passwords or tokens
    send(httpStatus(code), { status: 'error', error_code: code, message: (code === e.code && e.message) || TSD_MSG[code] || api.MSG[code], errors: code === e.code ? errorsOf(e) : {} });
  };
  if (req.method === 'OPTIONS') return send(204, {});
  try {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/v1/')) throw fail('ERR-REQ-02');
    const path = url.pathname.slice('/api/v1'.length);
    let route, p;
    for (const r of routes) if (r[0] === req.method && (p = match(r[1], path))) { route = r; break; }
    if (!route) throw fail('ERR-REQ-02');
    const [, , who, throttle, handler] = route;
    if (throttle && limited(`${req.socket.remoteAddress} ${route[1]}`)) throw fail('ERR-RATE-01');

    let raw = ''; for await (const c of req) raw += c;
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { throw fail('ERR-REQ-01'); }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw fail('ERR-REQ-01');

    let session = null;
    if (who) { // authMiddleware + roleMiddleware (TSD 6.2): ONE role per group, Pemilik is not allowed on /kasir or /barista
      const t = verify((req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!t) throw fail('ERR-AUTH-01');
      if (who !== 'ANY' && t.role !== who) throw fail('ERR-AUTH-04');
      session = JSON.stringify({ userId: t.user_id, username: t.username, role: t.role });
    }
    const out = await als.run(session, () => handler({ body, p, q: Object.fromEntries(url.searchParams) }));
    if (out.html) send(out.code, out.html, 'text/html'); else send(out.code, out.body);
  } catch (e) { sendError(e); }
}).listen(PORT, () => console.log(`MUD.CO API (mock, TSD v1.2) on http://localhost:${PORT}/api/v1`));
