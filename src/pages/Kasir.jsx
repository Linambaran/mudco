// SCR-04 Dashboard Pesanan Kasir — /kasir/pesanan
import { useEffect, useRef, useState } from 'react';
import { MSG, confirmPayment, getPrinter, listOrders, reprint, setPrinter } from '../api.js';
import { Badge, Icon, Modal, STATUS_LABEL, Staff, State, act, beep, dt, hhmm, rp, toast, useLive } from '../ui.jsx';

const FILTERS = ['SEMUA', 'MENUNGGU', 'DIBAYAR', 'DIPROSES', 'SELESAI'];
const SHORT = { SEMUA: 'Semua', MENUNGGU: 'Menunggu', DIBAYAR: 'Dibayar', DIPROSES: 'Diproses', SELESAI: 'Selesai' };

// BR-25: store name, order no, table, date/time, items, subtotal, total, payment method
function Receipt({ o, className = '' }) {
  return (
    <div className={'receipt ' + className}>
      <div className="center"><b>MUD.CO</b><br />Coffee &amp; Eatery</div><hr />
      <div>No. {o.number}</div><div>Meja {o.tableNumber}</div><div>{dt(o.paidAt || o.createdAt)}</div><hr />
      {o.items.map(i => <div key={i.menuId} className="l"><span>{i.quantity} x {i.name}</span><span>{rp(i.subtotal)}</span></div>)}<hr />
      <div className="l"><span>Subtotal</span><span>{rp(o.total)}</span></div>
      <div className="l"><b>Total</b><b>{rp(o.total)}</b></div>
      <div>Bayar: {o.paymentMethod === 'QRIS' ? 'QRIS' : 'Tunai'}</div><hr />
      <div className="center">Terima kasih</div>
    </div>
  );
}

export default function Kasir() {
  const q = useLive(listOrders);
  const [f, setF] = useState('SEMUA');
  const [selId, setSel] = useState(null);
  const [printer, setP] = useState(getPrinter());
  const seen = useRef(null);

  // FSD-2.8 step 1: notify on new orders (sound + toast). Orders stay in the list even if the toast is missed (AF-3).
  useEffect(() => {
    if (!q.data) return;
    if (seen.current) q.data.filter(o => !seen.current.has(o.id) && o.status === 'MENUNGGU').forEach(o => { toast(`Pesanan baru ${o.number} · Meja ${o.tableNumber}`, 'ok'); beep(); });
    seen.current = new Set(q.data.map(o => o.id));
  }, [q.data]);

  const printNow = () => printer === 'browser' && setTimeout(() => window.print(), 300);
  const confirm = async o => {
    const r = await act(() => confirmPayment(o.id));
    if (!r) return;
    if (r.printStatus === 'GAGAL') return toast(MSG['ERR-SYS-04'], 'warn'); // payment stays valid (BR-27)
    toast('Pembayaran dikonfirmasi, nota dicetak', 'ok');
    printNow();
  };
  const again = async o => {
    const s = await act(() => reprint(o.id));
    if (s === 'GAGAL') toast(MSG['ERR-SYS-04'], 'warn');
    else if (s) { toast('Nota dicetak', 'ok'); printNow(); }
  };
  const sel = q.data?.find(o => o.id === selId);

  return <>
    <div className="noprint">
      <Staff title="Pesanan Masuk" sub="Kelola pesanan pelanggan secara real-time"
        right={<label className="field printer"><span>Printer</span>
          <select value={printer} onChange={e => { setPrinter(e.target.value); setP(e.target.value); }}>
            <option value="sim">Simulasi (berhasil)</option>
            <option value="browser">Cetak via browser</option>
            <option value="offline">Simulasi offline</option>
          </select></label>}>
        <State q={q}>{orders => {
          const shown = orders.filter(o => f === 'SEMUA' || o.status === f).sort((a, b) => b.createdAt - a.createdAt);
          return <>
            <div className="chips">{FILTERS.map(k => (
              <button key={k} className={'chip' + (k === f ? ' on' : '')} onClick={() => setF(k)}>
                {SHORT[k]} {orders.filter(o => k === 'SEMUA' || o.status === k).length}
              </button>))}</div>
            {!shown.length && <p className="muted center">Belum ada pesanan.</p>}
            <div className="list">{shown.map(o => (
              <div key={o.id} className={'ocard list ' + o.status}>
                <div className="row between"><b>{o.number}</b><Badge s={o.status} /></div>
                <div className="muted">Meja {o.tableNumber} · {hhmm(o.createdAt)} · {o.paymentMethod === 'QRIS' ? 'QRIS' : 'Tunai'}</div>
                <div>{o.items.map(i => `${i.quantity} × ${i.name}`).join(', ')}</div>
                <div className="row between"><b>{rp(o.total)}</b><button className="btn sm green" onClick={() => setSel(o.id)}>Detail</button></div>
              </div>))}</div>
          </>;
        }}</State>
        {sel && (
          <Modal title={`${sel.number} · Meja ${sel.tableNumber}`} onClose={() => setSel(null)}>
            <div className="list">
              <div className="row between"><Badge s={sel.status} /><span className="muted">{dt(sel.createdAt)}</span></div>
              <table className="tbl"><tbody>
                {sel.items.map(i => <tr key={i.menuId}><td>{i.quantity} × {i.name}</td><td className="num">{rp(i.subtotal)}</td></tr>)}
                <tr><th>Total</th><th className="num">{rp(sel.total)}</th></tr>
              </tbody></table>
              <div>Metode: <b>{sel.paymentMethod === 'QRIS' ? 'QRIS statis (verifikasi manual di mutasi/notifikasi bank)' : 'Tunai (terima langsung)'}</b></div>
              {sel.status === 'MENUNGGU' && <button className="btn green" onClick={() => confirm(sel)}>Konfirmasi Pembayaran</button>}
              {sel.tx && <div className="row between">
                <span>Status cetak: <Badge s={sel.tx.printStatus === 'BERHASIL' ? 'SELESAI' : 'GAGAL'}>{sel.tx.printStatus}</Badge></span>
                {sel.tx.printStatus === 'GAGAL' && <button className="btn sm" onClick={() => again(sel)}><Icon n="printer" size={14} /> Cetak Ulang</button>}
              </div>}
              {sel.tx && <Receipt o={sel} />}
            </div>
          </Modal>
        )}
      </Staff>
    </div>
    {sel?.tx && <Receipt o={sel} className="print-only" />}
  </>;
}
