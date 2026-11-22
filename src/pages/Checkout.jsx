// SCR-02 Keranjang & Checkout — /order/:tableId/checkout  (two steps like the mockup: cart -> payment)
import { useState } from 'react';
import { Link, navigate } from '../router.jsx';
import { MSG, createOrder, getMenus, soldOutMsg } from '../api.js';
import { Field, Icon, State, act, rp, toast, useCart, useLive } from '../ui.jsx';

export default function Checkout({ tableId }) {
  const { cart, setQty, remove, clear } = useCart(tableId);
  const q = useLive(getMenus);
  const [step, setStep] = useState('cart');
  const [table, setTable] = useState(tableId);
  const [pay, setPay] = useState('');
  const [bad, setBad] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="app">
      <header className="top">
        {step === 'cart'
          ? <Link to={`/order/${tableId}`} className="icon" aria-label="Kembali"><Icon n="back" /></Link>
          : <button className="icon" onClick={() => setStep('cart')} aria-label="Kembali"><Icon n="back" /></button>}
        <h2 className="grow center">{step === 'cart' ? 'Keranjang Pesanan' : 'Pembayaran'}</h2>
        <span style={{ width: 36 }} />
      </header>
      <State q={q}>{menus => {
        const rows = Object.entries(cart).map(([id, qty]) => ({ id, qty, m: menus.find(x => x.id === id) }));
        const soldOut = rows.filter(r => !r.m?.isAvailable);
        const total = rows.reduce((a, r) => a + (r.m?.isAvailable ? r.m.price * r.qty : 0), 0);

        const next = () => {
          if (!rows.length) return toast(MSG['ERR-VAL-03']);
          if (soldOut.length) return toast(soldOutMsg(soldOut[0].m?.name ?? 'ini')); // EF-1: block until removed
          const t = +table;
          if (!(Number.isInteger(t) && t >= 1 && t <= 10)) { setBad('table'); return toast(MSG['ERR-VAL-05']); }
          setBad('');
          setStep('pay');
        };
        const submit = async () => {
          if (!pay) { setBad('pay'); return toast(MSG['ERR-VAL-06']); }
          setBusy(true);
          const o = await act(() => createOrder({ tableNumber: +table, paymentMethod: pay, items: rows.map(r => ({ menuId: r.id, quantity: r.qty })) }));
          setBusy(false);
          if (o) { clear(); navigate(`/order/${o.tableNumber}/status/${o.id}`); }
        };

        if (step === 'cart') return <>
          <div className="list">
            {!rows.length && <p className="muted center">Keranjang kosong. <Link to={`/order/${tableId}`}><u>Pilih menu</u></Link></p>}
            {rows.map(r => (
              <div key={r.id} className="card row between">
                <div>
                  <b>{r.m?.name ?? 'Menu tidak tersedia'}</b>
                  {r.m && <div className="muted">{rp(r.m.price)}</div>}
                  {!r.m?.isAvailable && <div className="t-no">{soldOutMsg(r.m?.name ?? 'ini')}</div>}
                </div>
                <div className="row">
                  <span className="step">
                    <button aria-label="Kurangi" onClick={() => setQty(r.id, r.qty - 1)}><Icon n="minus" size={14} /></button>
                    <b>{r.qty}</b>
                    <button aria-label="Tambah" onClick={() => setQty(r.id, r.qty + 1)}><Icon n="plus" size={14} /></button>
                  </span>
                  <button className="icon" aria-label={'Hapus ' + (r.m?.name ?? 'item')} onClick={() => remove(r.id)}><Icon n="trash" size={16} /></button>
                </div>
              </div>
            ))}
          </div>
          <Field label="Nomor Meja" bad={bad === 'table'}>
            <input inputMode="numeric" value={table} onChange={e => setTable(e.target.value)} />
          </Field>
          <div className="footer">
            <div className="row between"><span>Total Tagihan</span><b>{rp(total)}</b></div>
            <button className="btn" disabled={!rows.length} onClick={next}>Lanjut ke Pembayaran →</button>
          </div>
        </>;

        return <>
          <p className="muted">METODE PEMBAYARAN</p>
          <div className={'list' + (bad === 'pay' ? ' bad' : '')}>
            <label className={'opt' + (pay === 'QRIS' ? ' on' : '')}>
              <input type="radio" name="pay" checked={pay === 'QRIS'} onChange={() => { setPay('QRIS'); setBad(''); }} />
              <div><b>QRIS <span className="tag">STATIS</span></b><div className="muted">Scan QRIS toko setelah pesanan dikirim. Pembayaran diverifikasi manual oleh kasir.</div></div>
            </label>
            <label className={'opt' + (pay === 'TUNAI' ? ' on' : '')}>
              <input type="radio" name="pay" checked={pay === 'TUNAI'} onChange={() => { setPay('TUNAI'); setBad(''); }} />
              <div><b>Tunai</b><div className="muted">Bayar langsung ke kasir setelah pesanan dikirim.</div></div>
            </label>
          </div>
          <div className="card list" style={{ marginTop: 14 }}>
            <b>RINCIAN MEJA &amp; PESANAN</b>
            <div className="row between"><span className="muted">Nomor Meja</span><b>{table}</b></div>
            <div className="row between"><span className="muted">Total Pesanan ({rows.length} Menu)</span><b>{rp(total)}</b></div>
          </div>
          <div className="info"><Icon n="printer" size={18} /><span>Nota fisik otomatis tercetak di printer kasir setelah pembayaran dikonfirmasi.</span></div>
          <div className="footer">
            <div className="row between"><span>Total Pembayaran</span><b>{rp(total)}</b></div>
            <button className="btn" disabled={busy} onClick={submit}>Pesan Sekarang →</button>
          </div>
        </>;
      }}</State>
    </div>
  );
}
