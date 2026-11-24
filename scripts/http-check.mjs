// Contract check of scripts/http-server.mjs against TSD v1.2 (Bagian 3, 6, 7):  npm run check:api
// Starts the server on its own port, calls it over HTTP, asserts envelope, status codes, RBAC and the main flow.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 3999, BASE = `http://localhost:${PORT}/api/v1`;
const srv = spawn('node', ['scripts/http-server.mjs'], { env: { ...process.env, PORT, RATE_LIMIT_MAX: 10 }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.on('data', d => String(d).includes('on http') && r()));

const call = async (method, path, { token, body, raw } = {}) => {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: raw ?? (body && JSON.stringify(body)) });
  const text = await res.text();
  const type = res.headers.get('content-type');
  return { s: res.status, type, text, j: type.includes('json') ? JSON.parse(text) : null };
};
const err = (r, status, code) => { assert.equal(r.s, status, `${code}: got ${r.s} ${r.text}`); assert.equal(r.j.status, 'error'); assert.equal(r.j.error_code, code); assert.ok(r.j.errors && typeof r.j.message === 'string'); };
const login = async u => (await call('POST', '/auth/login', { body: { username: u, password: u + '1234' } })).j.data.token;

try {
  // envelope + login (3.3d)
  let r = await call('POST', '/auth/login', { body: { username: 'kasir', password: 'kasir1234' } });
  assert.equal(r.s, 200);
  assert.deepEqual([r.j.status, r.j.message, r.j.data.token_type, r.j.data.expires_in, r.j.data.redirect_to], ['success', 'Login berhasil', 'Bearer', 43200, '/kasir/pesanan']);
  const kasir = r.j.data.token, barista = await login('barista'), pemilik = await login('pemilik');
  err(await call('POST', '/auth/login', { body: { username: 'kasir', password: 'abc' } }), 422, 'ERR-VAL-07');
  err(await call('POST', '/auth/login', { body: { username: 'pemilik', password: 'salahsalah' } }), 401, 'ERR-AUTH-02');
  err(await call('POST', '/auth/login', { raw: '{bukan json' }), 422, 'ERR-REQ-01');
  err(await call('GET', '/nope'), 404, 'ERR-REQ-02');

  // RBAC: one role per group, Pemilik is rejected on /kasir and /barista (AC-04)
  err(await call('GET', '/kasir/orders'), 401, 'ERR-AUTH-01');
  err(await call('GET', '/kasir/orders', { token: 'a.b.c' }), 401, 'ERR-AUTH-01');
  err(await call('GET', '/kasir/orders', { token: pemilik }), 403, 'ERR-AUTH-04');
  err(await call('GET', '/barista/queue', { token: pemilik }), 403, 'ERR-AUTH-04');
  err(await call('GET', '/pemilik/menus', { token: kasir }), 403, 'ERR-AUTH-04');
  assert.equal((await call('POST', '/auth/logout', { token: kasir })).j.message, 'Logout berhasil');
  err(await call('POST', '/auth/logout'), 401, 'ERR-AUTH-01');

  // public menu: pagination meta, no HPP (AC-10)
  r = await call('GET', '/menus?per_page=5');
  assert.deepEqual(r.j.meta, { current_page: 1, per_page: 5, total: 12, last_page: 3 });
  assert.equal(r.j.data.length, 5);
  assert.ok(!('cost_price' in r.j.data[0]) && 'menu_id' in r.j.data[0]);
  r = await call('GET', '/menus?per_page=500&search=latte');
  assert.equal(r.j.meta.per_page, 100);
  const all = (await call('GET', '/menus?per_page=100')).j.data;
  const americano = all.find(m => m.name === 'Americano'), cheesecake = all.find(m => m.name === 'Cheesecake');
  assert.equal(cheesecake.is_available, false);

  // POST /orders validation (3.3b): first failing rule is the code, errors lists every bad field
  const o0 = { table_number: 3, payment_method: 'TUNAI', items: [{ menu_id: americano.menu_id, quantity: 2 }] };
  err(await call('POST', '/orders', { body: { ...o0, items: [] } }), 422, 'ERR-VAL-03');
  err(await call('POST', '/orders', { body: { ...o0, table_number: 11 } }), 422, 'ERR-VAL-05');
  r = await call('POST', '/orders', { body: { ...o0, payment_method: 'X', items: [{ menu_id: americano.menu_id, quantity: 21 }] } });
  err(r, 422, 'ERR-VAL-06');
  assert.deepEqual(Object.keys(r.j.errors).sort(), ['items.0.quantity', 'payment_method']);
  err(await call('POST', '/orders', { body: { ...o0, items: [{ menu_id: cheesecake.menu_id, quantity: 1 }] } }), 409, 'ERR-VAL-04');
  err(await call('POST', '/orders', { body: { ...o0, items: [{ menu_id: '00000000-0000-0000-0000-000000000000', quantity: 1 }] } }), 404, 'ERR-REQ-02');
  r = await call('POST', '/orders', { body: { ...o0, items: [{ menu_id: americano.menu_id, quantity: 2, price: 1 }] } }); // client price ignored (AC-06)
  assert.equal(r.s, 201);
  assert.equal(r.j.data.total_amount, 30000);
  assert.equal(r.j.data.order_status, 'MENUNGGU');
  const id = r.j.data.order_id;
  r = await call('GET', `/orders/${id}`);
  assert.deepEqual([r.s, r.j.data.items, 'created_at' in r.j.data], [200, [{ name: 'Americano', quantity: 2, subtotal: 30000 }], true]);
  err(await call('GET', '/orders/tidak-ada'), 404, 'ERR-BIZ-01');

  // kasir: list, confirm (409 on repeat), nota 80 mm, print result never cancels payment (BR-27)
  r = await call('GET', '/kasir/orders?status=MENUNGGU', { token: kasir });
  assert.equal(r.j.data[0].order_id, id);
  assert.equal(r.j.data[0].print_status, null);
  err(await call('GET', '/kasir/orders?status=ABC', { token: kasir }), 422, 'ERR-REQ-01');
  err(await call('GET', `/kasir/orders/${id}/nota`, { token: kasir }), 404, 'ERR-BIZ-01'); // not paid yet
  err(await call('PATCH', `/kasir/orders/${id}/payment`, { token: barista }), 403, 'ERR-AUTH-04');
  r = await call('PATCH', `/kasir/orders/${id}/payment`, { token: kasir });
  assert.deepEqual([r.s, r.j.data.order_status, r.j.data.print_status, !!r.j.data.transaction_id], [200, 'DIBAYAR', 'BELUM', true]);
  err(await call('PATCH', `/kasir/orders/${id}/payment`, { token: kasir }), 409, 'ERR-BIZ-02');
  r = await call('GET', `/kasir/orders/${id}/nota`, { token: kasir });
  assert.ok(r.type.includes('text/html') && r.text.includes('80mm') && r.text.includes('Rp30.000'));
  err(await call('PATCH', `/kasir/orders/${id}/print-status`, { token: kasir, body: { print_status: 'X' } }), 422, 'ERR-REQ-01');
  assert.equal((await call('PATCH', `/kasir/orders/${id}/print-status`, { token: kasir, body: { print_status: 'GAGAL' } })).j.data.print_status, 'GAGAL');
  assert.equal((await call('GET', '/kasir/orders?status=DIBAYAR', { token: kasir })).j.data[0].order_status, 'DIBAYAR');

  // barista: FIFO queue, no skipping (BR-30), no double change (ERR-SYS-05)
  assert.equal((await call('GET', '/barista/queue', { token: barista })).j.data[0].order_id, id);
  err(await call('PATCH', `/barista/orders/${id}/status`, { token: barista, body: { order_status: 'SELESAI' } }), 409, 'ERR-BIZ-03');
  err(await call('PATCH', `/barista/orders/${id}/status`, { token: barista, body: { order_status: 'BATAL' } }), 422, 'ERR-REQ-01');
  assert.equal((await call('PATCH', `/barista/orders/${id}/status`, { token: barista, body: { order_status: 'DIPROSES' } })).j.data.order_status, 'DIPROSES');
  err(await call('PATCH', `/barista/orders/${id}/status`, { token: barista, body: { order_status: 'DIPROSES' } }), 409, 'ERR-SYS-05');
  assert.equal((await call('PATCH', `/barista/orders/${id}/status`, { token: barista, body: { order_status: 'SELESAI' } })).j.data.order_status, 'SELESAI');
  assert.equal((await call('GET', '/barista/queue', { token: barista })).j.meta.total, 0);

  // pemilik: menus (HPP visible only here), soft delete, partial PATCH
  r = await call('GET', '/pemilik/menus?per_page=100', { token: pemilik });
  assert.ok('cost_price' in r.j.data[0] && 'is_active' in r.j.data[0]);
  err(await call('POST', '/pemilik/menus', { token: pemilik, body: { name: 'ab', price: 0, cost_price: -1, category: 'x' } }), 422, 'ERR-VAL-08');
  r = await call('POST', '/pemilik/menus', { token: pemilik, body: { name: 'Kopi Susu', price: 20000, cost_price: 8000, category: 'Latte Series', is_available: false } });
  assert.deepEqual([r.s, r.j.data.is_available, r.j.data.is_active], [201, false, true]);
  const menuId = r.j.data.menu_id;
  r = await call('PATCH', `/pemilik/menus/${menuId}`, { token: pemilik, body: { price: 22000, is_available: true } });
  assert.deepEqual([r.j.data.price, r.j.data.cost_price, r.j.data.is_available], [22000, 8000, true]);
  err(await call('PATCH', `/pemilik/menus/${menuId}`, { token: pemilik, body: { cost_price: -5 } }), 422, 'ERR-VAL-08');
  err(await call('PATCH', '/pemilik/menus/tidak-ada', { token: pemilik, body: { price: 1 } }), 404, 'ERR-REQ-02');
  err(await call('DELETE', `/pemilik/menus/${americano.menu_id}`, { token: pemilik }), 409, 'ERR-VAL-09');
  assert.equal((await call('DELETE', `/pemilik/menus/${menuId}`, { token: pemilik })).j.message, 'Menu dihapus');
  await call('PATCH', `/pemilik/menus/${cheesecake.menu_id}`, { token: pemilik, body: { is_active: false } });
  assert.equal((await call('GET', '/menus?per_page=100')).j.meta.total, 11); // 12 minus the deactivated one
  assert.equal((await call('GET', '/pemilik/menus?include_inactive=true&per_page=100', { token: pemilik })).j.meta.total, 12);

  // pemilik: ingredients + stock (BR-37, 39, 40, 41)
  r = await call('GET', '/pemilik/ingredients', { token: pemilik });
  const susu = r.j.data.find(i => i.name === 'Susu');
  assert.equal(susu.low_stock, true);
  assert.equal((await call('GET', '/pemilik/ingredients?low_stock_only=true', { token: pemilik })).j.data.every(i => i.low_stock), true);
  err(await call('POST', '/pemilik/ingredients', { token: pemilik, body: { name: 'Susu', unit: 'ml', stock_qty: 1, min_stock: 1 } }), 422, 'ERR-VAL-10'); // duplicate name
  r = await call('POST', '/pemilik/ingredients', { token: pemilik, body: { name: 'Coklat', unit: 'gram', stock_qty: 500, min_stock: 100 } });
  assert.equal(r.s, 201);
  const cokId = r.j.data.ingredient_id;
  r = await call('PATCH', `/pemilik/ingredients/${cokId}`, { token: pemilik, body: { min_stock: 50, stock_qty: 99999 } }); // stock_qty ignored (BR-39)
  assert.deepEqual([r.j.data.min_stock, (await call('GET', '/pemilik/ingredients', { token: pemilik })).j.data.find(i => i.name === 'Coklat').stock_qty], [50, 500]);
  err(await call('POST', `/pemilik/ingredients/${susu.ingredient_id}/stock`, { token: pemilik, body: { change_type: 'STOK_MASUK', quantity: 0 } }), 422, 'ERR-VAL-11');
  err(await call('POST', `/pemilik/ingredients/${susu.ingredient_id}/stock`, { token: pemilik, body: { change_type: 'PENYESUAIAN', quantity: -1 } }), 422, 'ERR-VAL-11');
  err(await call('POST', `/pemilik/ingredients/${susu.ingredient_id}/stock`, { token: pemilik, body: { change_type: 'LAIN', quantity: 1 } }), 422, 'ERR-REQ-01');
  err(await call('POST', '/pemilik/ingredients/tidak-ada/stock', { token: pemilik, body: { change_type: 'STOK_MASUK', quantity: 1 } }), 404, 'ERR-REQ-02');
  r = await call('POST', `/pemilik/ingredients/${susu.ingredient_id}/stock`, { token: pemilik, body: { change_type: 'PENYESUAIAN', quantity: 4000 } });
  assert.deepEqual([r.s, r.j.data.stock_qty, r.j.data.low_stock, r.j.data.history.change_type, r.j.data.history.quantity], [201, 4000, false, 'PENYESUAIAN', 1500]);
  r = await call('GET', `/pemilik/stock-histories?ingredient_id=${susu.ingredient_id}`, { token: pemilik });
  assert.deepEqual([r.j.meta.total, r.j.data[0].recorded_by, r.j.data[0].ingredient_name], [1, 'pemilik', 'Susu']);
  assert.equal((await call('DELETE', `/pemilik/ingredients/${cokId}`, { token: pemilik })).j.data.is_active, false);
  err(await call('POST', `/pemilik/ingredients/${cokId}/stock`, { token: pemilik, body: { change_type: 'STOK_MASUK', quantity: 1 } }), 404, 'ERR-REQ-02'); // inactive
  assert.ok(!(await call('GET', '/pemilik/ingredients', { token: pemilik })).j.data.some(i => i.name === 'Coklat'));

  // pemilik: report (BR-43) and daily history (AC-14)
  const today = new Date().toLocaleDateString('sv-SE');
  r = await call('GET', '/pemilik/laporan', { token: pemilik });
  assert.deepEqual([r.j.data.start_date, r.j.data.total_orders, r.j.data.total_revenue, r.j.data.total_cost, r.j.data.estimated_profit], [today, 1, 30000, 12000, 18000]);
  assert.deepEqual(r.j.data.per_menu[0], { menu_id: americano.menu_id, menu: 'Americano', qty_sold: 2, revenue: 30000, cost: 12000, profit: 18000 });
  err(await call('GET', `/pemilik/laporan?start_date=${today}&end_date=2000-01-01`, { token: pemilik }), 422, 'ERR-VAL-12');
  err(await call('GET', '/pemilik/laporan?start_date=besok', { token: pemilik }), 422, 'ERR-VAL-12');
  r = await call('GET', '/pemilik/laporan?start_date=2000-01-01&end_date=2000-01-02', { token: pemilik });
  assert.deepEqual([r.j.data.total_orders, r.j.message], [0, 'Belum ada transaksi pada periode ini']);
  // 6 seeded days + today, stored by the report call above
  r = await call('GET', '/pemilik/laporan/riwayat?per_page=3', { token: pemilik });
  assert.deepEqual([r.j.data.length, r.j.meta.total, Object.keys(r.j.data[0])], [3, 7, ['summary_date', 'total_orders', 'total_revenue', 'total_cost', 'estimated_profit']]);
  err(await call('GET', '/pemilik/laporan/riwayat?from=2026-02-02&to=2026-01-01', { token: pemilik }), 422, 'ERR-VAL-12');

  // lockout: 3 wrong passwords -> 403 ERR-AUTH-03 even with the right password (BR-18)
  err(await call('POST', '/auth/login', { body: { username: 'kasir', password: 'salahsalah' } }), 401, 'ERR-AUTH-02');
  err(await call('POST', '/auth/login', { body: { username: 'kasir', password: 'salahsalah' } }), 401, 'ERR-AUTH-02');
  err(await call('POST', '/auth/login', { body: { username: 'kasir', password: 'salahsalah' } }), 403, 'ERR-AUTH-03');

  // rate limit (TSD 6.2): 10 logins per minute. 9 were used above (6 + 3 lockout), the 10th passes, the 11th is refused.
  assert.equal((await call('POST', '/auth/login', { body: { username: 'barista', password: 'barista1234' } })).s, 200);
  err(await call('POST', '/auth/login', { body: { username: 'barista', password: 'barista1234' } }), 429, 'ERR-RATE-01');
  console.log('all API contract checks passed');
} finally {
  srv.kill();
}
process.exit(0);
