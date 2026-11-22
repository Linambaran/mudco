// SCR-06 Dashboard & Manajemen Menu Pemilik — /pemilik/dashboard (?tab=menu)
import { useState } from 'react';
import { deleteMenu, getMenus, getReport, saveMenu, setActive, setAvailable } from '../api.js';
import { useLocation } from '../router.jsx';
import { Badge, Field, Icon, Modal, OWNER_NAV, Staff, State, act, rp, toast, useLive } from '../ui.jsx';

export default function Owner() {
  const menu = new URLSearchParams(useLocation().split('?')[1]).get('tab') === 'menu';
  return (
    <Staff nav={OWNER_NAV} title={menu ? 'Manajemen Menu' : 'Laporan Keuangan'} sub={menu ? 'Kelola daftar menu, harga, dan ketersediaan' : 'Rekap penjualan dan estimasi laba'}>
      {menu ? <MenuTab /> : <Report />}
    </Staff>
  );
}

const Tbl = ({ head, children }) => (
  <div className="scroll"><table className="tbl"><thead><tr>{head.map((h, i) => <th key={h} className={i ? 'num' : ''}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
);

function Report() {
  const today = new Date().toLocaleDateString('sv-SE');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const q = useLive(() => getReport(from, to), [from, to]);
  return <>
    <div className="row">
      <Field label="Dari"><input type="date" max={today} value={from} onChange={e => setFrom(e.target.value)} /></Field>
      <Field label="Sampai"><input type="date" max={today} value={to} onChange={e => setTo(e.target.value)} /></Field>
    </div>
    <State q={q}>{r => <>
      <div className="stats">
        <div className="stat"><small>Total Pesanan</small><b>{r.totalOrders}</b></div>
        <div className="stat"><small>Omzet</small><b>{rp(r.totalRevenue)}</b></div>
        <div className="stat"><small>Total HPP</small><b>{rp(r.totalCost)}</b></div>
        <div className="stat"><small>Estimasi Laba</small><b>{rp(r.estimatedProfit)}</b></div>
      </div>
      <h3>Penjualan per Menu</h3>
      {r.menus.length
        ? <Tbl head={['Menu', 'Terjual', 'Omzet', 'HPP', 'Laba']}>{r.menus.map(m => (
          <tr key={m.menuId}><td>{m.name}</td><td className="num">{m.qtySold}</td><td className="num">{rp(m.revenue)}</td><td className="num">{rp(m.cost)}</td><td className="num">{rp(m.revenue - m.cost)}</td></tr>))}</Tbl>
        : <p className="muted center">Belum ada transaksi pada periode ini.</p>}
      <h3>Riwayat Rekap Harian</h3>
      <Tbl head={['Tanggal', 'Pesanan', 'Omzet', 'HPP', 'Laba']}>{r.history.map(h => (
        <tr key={h.date} className="click" onClick={() => { setFrom(h.date); setTo(h.date); }}>
          <td>{h.date}</td><td className="num">{h.totalOrders}</td><td className="num">{rp(h.totalRevenue)}</td><td className="num">{rp(h.totalCost)}</td><td className="num">{rp(h.estimatedProfit)}</td></tr>))}</Tbl>
    </>}</State>
  </>;
}

function MenuTab() {
  const q = useLive(() => getMenus({ all: true }));
  const [edit, setEdit] = useState(null);
  return <>
    <button className="btn green" onClick={() => setEdit({ name: '', category: '', price: '', costPrice: '', imageUrl: '' })}><Icon n="plus" size={16} /> Tambah Menu</button>
    <State q={q}>{menus => <div className="list" style={{ marginTop: 12 }}>{menus.map(m => (
      <div key={m.id} className={'card row between' + (m.isActive ? '' : ' off')}>
        <div><b>{m.name}</b> {!m.isActive && <Badge s="GAGAL">Nonaktif</Badge>}
          <div className="muted">{m.category} · {rp(m.price)} · HPP {rp(m.costPrice)}</div></div>
        <div className="row">
          <label className="row" title="Tersedia / Habis">
            <span className={'switch'}><input type="checkbox" checked={m.isAvailable} onChange={e => act(() => setAvailable(m.id, e.target.checked))} aria-label={'Tersedia ' + m.name} /><span /></span>
            <small className={m.isAvailable ? 't-ok' : 't-no'}>{m.isAvailable ? 'Tersedia' : 'Habis'}</small>
          </label>
          <button className="btn sm ghost" onClick={() => setEdit(m)}>Ubah</button>
        </div>
      </div>))}</div>}</State>
    {edit && <MenuForm init={edit} onClose={() => setEdit(null)} />}
  </>;
}

function MenuForm({ init, onClose }) {
  const [f, setF] = useState(init);
  const [bad, setBad] = useState([]);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const run = async fn => { try { await fn(); onClose(); } catch (e) { setBad(e.fields || []); toast(e.message); } };
  return (
    <Modal title={f.id ? 'Ubah Menu' : 'Tambah Menu'} onClose={onClose}>
      <form className="list" onSubmit={e => { e.preventDefault(); run(() => saveMenu(f)); }}>
        <Field label="Nama Menu (3–100 karakter)" bad={bad.includes('name')}><input value={f.name} onChange={set('name')} /></Field>
        <Field label="Kategori" bad={bad.includes('category')}><input value={f.category} onChange={set('category')} /></Field>
        <Field label="Harga Jual (> 0)" bad={bad.includes('price')}><input type="number" min="0" value={f.price} onChange={set('price')} /></Field>
        <Field label="HPP / Harga Pokok (≥ 0)" bad={bad.includes('costPrice')}><input type="number" min="0" value={f.costPrice} onChange={set('costPrice')} /></Field>
        <Field label="URL Gambar (opsional)"><input value={f.imageUrl} onChange={set('imageUrl')} /></Field>
        <button className="btn green">Simpan Perubahan</button>
        {f.id && <>
          <button type="button" className="btn ghost" onClick={() => run(() => setActive(f.id, !f.isActive))}>{f.isActive ? 'Nonaktifkan Menu' : 'Aktifkan Menu'}</button>
          <button type="button" className="btn danger" onClick={() => run(() => deleteMenu(f.id))}>Hapus Permanen</button>
        </>}
      </form>
    </Modal>
  );
}
