// SCR-01 Halaman Menu Pembeli — /order/:tableId
import { useState } from 'react';
import { Link } from '../router.jsx';
import { getMenus } from '../api.js';
import { Icon, Logo, State, rp, useCart, useLive } from '../ui.jsx';

const initials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

export default function Menu({ tableId }) {
  const { cart, setQty, remove } = useCart(tableId);
  const q = useLive(getMenus);
  const [cat, setCat] = useState('Semua');
  const [s, setS] = useState('');
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const checkout = `/order/${tableId}/checkout`;

  return (
    <div className="app">
      <header className="top">
        <Logo /><div className="grow" />
        <span className="pill">Meja {tableId}</span>
        <Link to={checkout} className="icon" aria-label="Keranjang"><Icon n="cart" />{count > 0 && <i>{count}</i>}</Link>
      </header>
      <State q={q}>{menus => {
        const cats = ['Semua', ...new Set(menus.map(m => m.category))];
        const list = menus.filter(m => (cat === 'Semua' || m.category === cat) && m.name.toLowerCase().includes(s.toLowerCase()));
        const total = menus.reduce((a, m) => a + (m.isAvailable ? (cart[m.id] || 0) * m.price : 0), 0);
        return <>
          <label className="search"><Icon n="search" size={18} /><input value={s} onChange={e => setS(e.target.value)} placeholder="Cari menu favorit..." aria-label="Cari menu" /></label>
          <div className="chips">{cats.map(c => <button key={c} className={'chip' + (c === cat ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}</div>
          <h3>Menu</h3>
          {!list.length && <p className="muted center">Menu tidak ditemukan.</p>}
          <div className="grid">{list.map(m => {
            const n = cart[m.id] || 0;
            return (
              <div key={m.id} className={'card menu' + (m.isAvailable ? '' : ' off')}>
                <div className="thumb">
                  {m.imageUrl ? <img src={m.imageUrl} alt={m.name} /> : initials(m.name)}
                  <button className="plus" disabled={!m.isAvailable} aria-label={'Tambah ' + m.name} onClick={() => setQty(m.id, n + 1)}><Icon n="plus" size={16} /></button>
                </div>
                <b>{m.name}</b>
                <div className={m.isAvailable ? 't-ok' : 't-no'}>{m.isAvailable ? 'Tersedia' : 'Habis'}</div>
                <div className="row between">
                  <span>{rp(m.price)}</span>
                  {n > 0 && <span className="step">
                    <button aria-label={'Kurangi ' + m.name} onClick={() => n > 1 ? setQty(m.id, n - 1) : remove(m.id)}><Icon n="minus" size={14} /></button>
                    <b>{n}</b>
                    <button aria-label={'Tambah lagi ' + m.name} onClick={() => setQty(m.id, n + 1)}><Icon n="plus" size={14} /></button>
                  </span>}
                </div>
              </div>
            );
          })}</div>
          {total > 0 && <Link to={checkout} className="total-bar"><div><small>TOTAL PESANAN</small><b>{rp(total)}</b></div><span className="btn sm amber">Lihat Pesanan →</span></Link>}
        </>;
      }}</State>
    </div>
  );
}
