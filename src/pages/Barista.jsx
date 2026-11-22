// SCR-05 Kitchen Display Barista — /barista/antrian
import { useState } from 'react';
import { listOrders, setStatus } from '../api.js';
import { Badge, Staff, State, act, hhmm, useLive } from '../ui.jsx';

const TABS = [['ANTREAN', 'Antrean'], ['DIBAYAR', 'Dibayar'], ['DIPROSES', 'Diproses'], ['SELESAI', 'Selesai']];

export default function Barista() {
  const q = useLive(listOrders);
  const [f, setF] = useState('ANTREAN');
  const inTab = (o, k) => (k === 'ANTREAN' ? ['DIBAYAR', 'DIPROSES'].includes(o.status) : o.status === k);

  return (
    <Staff title="Kitchen Display" sub="Pesanan yang sudah dibayar, urut yang pertama dibayar">
      <State q={q}>{orders => {
        const shown = orders.filter(o => inTab(o, f)).sort((a, b) => (f === 'SELESAI' ? b.updatedAt - a.updatedAt : a.paidAt - b.paidAt)); // BR-29: FIFO by payment time
        return <>
          <div className="chips">{TABS.map(([k, l]) => (
            <button key={k} className={'chip' + (k === f ? ' on' : '')} onClick={() => setF(k)}>{l} {orders.filter(o => inTab(o, k)).length}</button>))}</div>
          {!shown.length && <p className="muted center">Tidak ada pesanan.</p>}
          <div className="list">{shown.map(o => (
            <div key={o.id} className={'ocard list ' + o.status}>
              <div className="row between"><b>{o.number} · Meja {o.tableNumber}</b><Badge s={o.status} /></div>
              <div className="muted">Dibayar {hhmm(o.paidAt)}</div>
              <ul className="items">{o.items.map(i => <li key={i.menuId}><b>{i.quantity} ×</b> {i.name}</li>)}</ul>
              {o.status === 'DIBAYAR' && <button className="btn green" onClick={() => act(() => setStatus(o.id, 'DIPROSES'))}>Mulai Memproses</button>}
              {o.status === 'DIPROSES' && <button className="btn amber" onClick={() => act(() => setStatus(o.id, 'SELESAI'))}>Pesanan Selesai</button>}
            </div>))}</div>
        </>;
      }}</State>
    </Staff>
  );
}
