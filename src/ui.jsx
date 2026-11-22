import { useEffect, useState } from 'react';
import { Link, navigate, useLocation } from './router.jsx';
import { MSG, getSession, logout, subscribe } from './api.js';

export const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
export const hhmm = t => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
export const dt = t => new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
export const STATUS_LABEL = { MENUNGGU: 'MENUNGGU PEMBAYARAN', DIBAYAR: 'DIBAYAR', DIPROSES: 'DIPROSES', SELESAI: 'SELESAI' };
export const OWNER_NAV = [
  { to: '/pemilik/dashboard', icon: 'chart', label: 'Laporan' },
  { to: '/pemilik/dashboard?tab=menu', icon: 'grid', label: 'Menu' },
  { to: '/pemilik/stok', icon: 'box', label: 'Stok' },
];

// ---------- icons ----------
const P = {
  back: 'M15 18l-6-6 6-6', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', x: 'M6 6l12 12M18 6L6 18', check: 'M5 12l5 5 9-10',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.3-4.3',
  cart: 'M6 6h15l-1.5 9h-12zM6 6L5 3H2M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  logout: 'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',
  printer: 'M7 9V3h10v6M7 17H4v-6h16v6h-3M7 14h10v7H7z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  coffee: 'M4 9h13v5a5 5 0 01-5 5H9a5 5 0 01-5-5zM17 10h2a2 2 0 010 4h-2M8 2v3M12 2v3',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
};
export const Icon = ({ n, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n]} /></svg>
);
export const Logo = () => (
  <div className="logo"><span className="logo-i"><Icon n="coffee" /></span><div><b>MUD.CO</b><small>Coffee &amp; Eatery</small></div></div>
);

// ---------- toast ----------
const bus = new EventTarget();
export const toast = (msg, kind = 'err') => msg && bus.dispatchEvent(new CustomEvent('t', { detail: { msg, kind, id: Math.random() } }));
export function ToastHost() {
  const [list, set] = useState([]);
  useEffect(() => {
    const f = e => { const t = e.detail; set(l => [...l, t]); setTimeout(() => set(l => l.filter(x => x !== t)), 4000); };
    bus.addEventListener('t', f);
    return () => bus.removeEventListener('t', f);
  }, []);
  return <div className="toasts noprint" role="status">{list.map(t => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}</div>;
}
export const act = async fn => { try { return await fn(); } catch (e) { toast(e.message); } };
export const beep = () => {
  try { const c = new AudioContext(), o = c.createOscillator(); o.connect(c.destination); o.frequency.value = 880; o.start(); o.stop(c.currentTime + 0.15); } catch { /* autoplay blocked */ }
};

// ---------- data hooks ----------
export function useLive(fn, deps = []) {
  const [st, set] = useState({});
  useEffect(() => {
    let on = true;
    const run = () => fn().then(data => on && set({ data }), error => on && set({ error }));
    run();
    const off = subscribe(run); // re-run on every change (other tab / this tab)
    return () => { on = false; off(); };
  }, deps);
  return st;
}
export const ErrorBox = ({ e }) => <div className="errbox"><b>{e.message}</b>{e.code && <small>{e.code}</small>}</div>;
export const State = ({ q, children }) => q.error ? <ErrorBox e={q.error} /> : q.data === undefined ? <p className="muted center">Memuat…</p> : children(q.data);

// Cart lives in localStorage per table (BR-07)
export function useCart(table) {
  const k = 'mudco-cart-' + table;
  const [cart, set] = useState(() => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } });
  const put = c => { set(c); localStorage.setItem(k, JSON.stringify(c)); };
  return {
    cart,
    setQty(id, n) { if (n < 1 || n > 20) toast(MSG['ERR-VAL-02']); put({ ...cart, [id]: Math.min(20, Math.max(1, n)) }); }, // BR-05
    remove(id) { const { [id]: _, ...rest } = cart; put(rest); },
    clear() { put({}); },
  };
}

// ---------- layout bits ----------
export const Field = ({ label, bad, children }) => <label className={'field' + (bad ? ' bad' : '')}><span>{label}</span>{children}</label>;
export const Badge = ({ s, children }) => <span className={'badge ' + s}>{children ?? STATUS_LABEL[s]}</span>;
export const Modal = ({ title, onClose, children }) => (
  <div className="overlay noprint" onClick={onClose}>
    <div className="sheet" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
      <div className="sheet-h"><h2>{title}</h2><button className="icon" onClick={onClose} aria-label="Tutup"><Icon n="x" /></button></div>
      {children}
    </div>
  </div>
);
export function Staff({ nav, title, sub, right, children }) {
  const loc = useLocation();
  const s = getSession();
  return (
    <div className="app wide">
      <header className="top">
        <Logo /><div className="grow" />
        <span className="pill"><Icon n="user" size={14} /> {s?.username} · {s?.role}</span>
        <button className="icon" aria-label="Logout" onClick={() => { logout(); navigate('/login'); }}><Icon n="logout" /></button>
      </header>
      <div className="head"><div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>{right}</div>
      {children}
      {nav && <nav className="bottom noprint">{nav.map(n => <Link key={n.to} to={n.to} className={loc === n.to ? 'on' : ''}><Icon n={n.icon} /><span>{n.label}</span></Link>)}</nav>}
    </div>
  );
}
