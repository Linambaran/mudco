// SCR-07 Konfirmasi & Status Pesanan Pembeli — /order/:tableId/status/:orderId (live)
import { Link } from '../router.jsx';
import { getOrder } from '../api.js';
import { Badge, Icon, Logo, State, rp, useLive } from '../ui.jsx';

const QRIS_SRC = '/qris.svg'; // replace public/qris.svg with the shop's static QRIS
const STEPS = [['MENUNGGU', 'Menunggu Pembayaran'], ['DIBAYAR', 'Dibayar'], ['DIPROSES', 'Diproses'], ['SELESAI', 'Selesai']];
const HINT = {
  MENUNGGU: 'Menunggu kasir mengonfirmasi pembayaran.',
  DIBAYAR: 'Pembayaran diterima, pesanan masuk antrean barista.',
  DIPROSES: 'Barista sedang membuat pesanan Anda.',
  SELESAI: 'Pesanan selesai. Selamat menikmati!',
};

export default function Status({ tableId, orderId }) {
  const q = useLive(() => getOrder(orderId), [orderId]);
  return (
    <div className="app">
      <header className="top"><Logo /></header>
      <State q={q}>{o => {
        const cur = STEPS.findIndex(([k]) => k === o.status);
        return <div className="list">
          <div className="center">
            <div className="okcircle"><Icon n="check" size={32} /></div>
            <h2>Pesanan Berhasil!</h2>
            <p className="muted">Pesanan Anda telah dikirim ke kasir dan akan segera diproses.</p>
          </div>
          <div className="card list">
            <div className="row between"><span className="muted">Nomor Pesanan</span><b>{o.number}</b></div>
            <div className="row between"><span className="muted">Nomor Meja</span><b>{o.tableNumber}</b></div>
            <div className="row between"><span className="muted">Total Pembayaran</span><b>{rp(o.total)} · {o.paymentMethod === 'QRIS' ? 'QRIS' : 'Tunai'}</b></div>
            <div className="row between"><span className="muted">Status</span><Badge s={o.status} /></div>
            <div className="track">{STEPS.map(([k, l], i) => <div key={k} className={i < cur ? 'done' : i === cur ? 'done cur' : ''}><i />{l}</div>)}</div>
            <p className="muted center" aria-live="polite">{HINT[o.status]}</p>
          </div>
          {o.status === 'MENUNGGU' && (o.paymentMethod === 'QRIS'
            ? <div className="card center"><b>Scan QRIS untuk membayar</b><img className="qris" src={QRIS_SRC} alt="QRIS statis MUD.CO" /><p className="muted">Pembayaran diverifikasi manual oleh kasir. Total: <b>{rp(o.total)}</b></p></div>
            : <div className="info"><span>Silakan bayar tunai langsung ke kasir sebesar <b>{rp(o.total)}</b>.</span></div>)}
          <div className="card list">
            <b>Rincian Pesanan</b>
            {o.items.map(i => <div key={i.menuId} className="row between"><span>{i.quantity} × {i.name}</span><span>{rp(i.subtotal)}</span></div>)}
          </div>
          <Link to={`/order/${tableId}`} className="btn">Kembali ke Menu</Link>
        </div>;
      }}</State>
    </div>
  );
}
