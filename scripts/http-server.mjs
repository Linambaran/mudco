// Thin HTTP wrapper around src/api.js so Postman can call it.  Run: npm run api  (http://localhost:3001)
// Data lives in memory (same seed as the app) and resets when you restart. Auth: Bearer token from POST /auth/login.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
globalThis.localStorage = store();
globalThis.sessionStorage = store();
const api = await import('../src/api.js');

const tokens = new Map(); // token -> session
const SES = 'mudco-session';

const routes = [
  ['POST', '/auth/login', async ({ body }) => {
    const s = await api.login(body.username, body.password);
    const token = randomUUID(); tokens.set(token, s);
    return { token, ...s };
  }],
  ['POST', '/auth/logout', async ({ token }) => (tokens.delete(token), { ok: true })],
  ['GET', '/menus', ({ query }) => api.getMenus({ all: query.all === 'true' })],
  ['POST', '/menus', async ({ body }) => (await api.saveMenu(body), { ok: true })],
  ['PUT', '/menus/:id', async ({ body, p }) => (await api.saveMenu({ ...body, id: p.id }), { ok: true })],
  ['PATCH', '/menus/:id/available', async ({ body, p }) => (await api.setAvailable(p.id, body.value), { ok: true })],
  ['PATCH', '/menus/:id/active', async ({ body, p }) => (await api.setActive(p.id, body.value), { ok: true })],
  ['DELETE', '/menus/:id', async ({ p }) => (await api.deleteMenu(p.id), { ok: true })],
  ['POST', '/orders', ({ body }) => api.createOrder(body)],
  ['GET', '/orders', () => api.listOrders()],
  ['GET', '/orders/:id', ({ p }) => api.getOrder(p.id)],
  ['POST', '/orders/:id/confirm-payment', ({ body, p }) => api.confirmPayment(p.id, body.uangDiterima)],
  ['POST', '/orders/:id/reprint', async ({ p }) => ({ printStatus: await api.reprint(p.id) })],
  ['PATCH', '/orders/:id/status', async ({ body, p }) => (await api.setStatus(p.id, body.to), { ok: true })],
  ['GET', '/stock', () => api.getStock()],
  ['POST', '/ingredients', async ({ body }) => (await api.saveIngredient(body), { ok: true })],
  ['PATCH', '/ingredients/:id/active', async ({ body, p }) => (await api.setIngredientActive(p.id, body.value), { ok: true })],
  ['POST', '/stock/add', ({ body }) => api.addStock(body)],
  ['GET', '/report', ({ query }) => api.getReport(query.from, query.to)],
  ['POST', '/dev/printer', async ({ body }) => (api.setPrinter(body.mode), { printer: api.getPrinter() })], // sim | browser | offline
];

const match = (route, path) => {
  const a = route.split('/'), b = path.split('/');
  if (a.length !== b.length) return null;
  const p = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) p[a[i].slice(1)] = decodeURIComponent(b[i]); else if (a[i] !== b[i]) return null;
  }
  return p;
};

const STATUS = c => c.startsWith('ERR-AUTH-01') ? 401 : c.startsWith('ERR-AUTH-04') ? 403 : c === 'ERR-AUTH-03' ? 423
  : c === 'ERR-AUTH-02' ? 401 : c.startsWith('ERR-VAL') ? 400 : c === 'ERR-BIZ-01' ? 404 : c.startsWith('ERR-BIZ') || c === 'ERR-SYS-05' ? 409 : 500;

http.createServer(async (req, res) => {
  const send = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }); res.end(JSON.stringify(data)); };
  if (req.method === 'OPTIONS') return send(204, {});
  const url = new URL(req.url, 'http://x');
  let raw = ''; for await (const c of req) raw += c;
  let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { return send(400, { code: 'BAD_JSON', message: 'Body bukan JSON valid' }); }
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  for (const [method, route, fn] of routes) {
    const p = method === req.method && match(route, url.pathname);
    if (!p) continue;
    // api.js reads the session from sessionStorage synchronously at call start, so set it per request
    const s = tokens.get(token);
    if (s) sessionStorage.setItem(SES, JSON.stringify(s)); else sessionStorage.removeItem(SES);
    try { return send(200, await fn({ body, p, token, query: Object.fromEntries(url.searchParams) })); }
    catch (e) { return send(e.code ? STATUS(e.code) : 500, { code: e.code || 'ERR-SYS-01', message: e.message, fields: e.fields }); }
  }
  send(404, { code: 'NOT_FOUND', message: `${req.method} ${url.pathname} tidak ada` });
}).listen(3001, () => console.log('MUD.CO API (mock) on http://localhost:3001'));
