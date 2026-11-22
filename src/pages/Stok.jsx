// SCR-08 Manajemen Stok Bahan Baku — /pemilik/stok
import { useState } from 'react';
import { addStock, getStock, saveIngredient, setIngredientActive } from '../api.js';
import { Badge, Field, Icon, Modal, OWNER_NAV, Staff, State, act, dt, toast, useLive } from '../ui.jsx';

const dayOf = t => new Date(t).toLocaleDateString('sv-SE');

export default function Stok() {
  const q = useLive(getStock);
  const [ing, setIng] = useState(null);   // ingredient form
  const [stk, setStk] = useState(null);   // stock in / adjustment form
  const [hf, setHf] = useState('');
  const [hd, setHd] = useState('');
  return (
    <Staff nav={OWNER_NAV} title="Stok Bahan Baku" sub="Catat stok masuk dan pantau stok menipis"
      right={<button className="btn sm green" onClick={() => setIng({ name: '', unit: '', stockQty: '', minStock: '' })}><Icon n="plus" size={14} /> Bahan</button>}>
      <State q={q}>{({ ingredients, history }) => {
        const low = ingredients.filter(i => i.lowStock);
        const hist = history.filter(h => (!hf || h.ingredientId === hf) && (!hd || dayOf(h.createdAt) === hd));
        return <>
          {low.length > 0 && <div className="info warn"><Icon n="alert" size={18} /><span>Stok menipis: <b>{low.map(i => i.name).join(', ')}</b></span></div>}
          <div className="scroll"><table className="tbl"><thead><tr><th>Bahan</th><th className="num">Stok</th><th className="num">Min.</th><th>Status</th><th /></tr></thead><tbody>
            {ingredients.map(i => (
              <tr key={i.id} className={i.isActive ? '' : 'off'}>
                <td>{i.name}<div className="muted">{i.unit}</div></td>
                <td className="num">{i.stockQty}</td><td className="num">{i.minStock}</td>
                <td>{!i.isActive ? <Badge s="GAGAL">Nonaktif</Badge> : i.lowStock ? <Badge s="MENUNGGU">Menipis</Badge> : <Badge s="SELESAI">Aman</Badge>}</td>
                <td className="num">
                  <button className="btn sm green" disabled={!i.isActive} onClick={() => setStk({ ingredientId: i.id, changeType: 'STOK_MASUK', quantity: '' })}>Stok</button>{' '}
                  <button className="btn sm ghost" onClick={() => setIng(i)}>Ubah</button>
                </td>
              </tr>))}
          </tbody></table></div>

          <h3>Riwayat Perubahan Stok</h3>
          <div className="row">
            <Field label="Bahan"><select value={hf} onChange={e => setHf(e.target.value)}><option value="">Semua</option>{ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
            <Field label="Tanggal"><input type="date" value={hd} onChange={e => setHd(e.target.value)} /></Field>
          </div>
          {hist.length
            ? <div className="scroll"><table className="tbl"><thead><tr><th>Waktu</th><th>Bahan</th><th>Jenis</th><th className="num">Jumlah</th><th>Oleh</th></tr></thead><tbody>
              {hist.map(h => <tr key={h.id}><td>{dt(h.createdAt)}</td><td>{h.name}</td><td>{h.changeType === 'STOK_MASUK' ? 'Stok Masuk' : 'Penyesuaian'}</td><td className="num">{h.quantity > 0 ? '+' : ''}{h.quantity}</td><td>{h.username}</td></tr>)}
            </tbody></table></div>
            : <p className="muted center">Belum ada riwayat perubahan stok.</p>}

          {ing && <IngredientForm init={ing} onClose={() => setIng(null)} />}
          {stk && <StockForm init={stk} ingredients={ingredients.filter(i => i.isActive)} onClose={() => setStk(null)} />}
        </>;
      }}</State>
    </Staff>
  );
}

function IngredientForm({ init, onClose }) {
  const [f, setF] = useState(init);
  const [bad, setBad] = useState([]);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const run = async fn => { try { await fn(); onClose(); } catch (e) { setBad(e.fields || []); toast(e.message); } };
  return (
    <Modal title={f.id ? 'Ubah Bahan Baku' : 'Tambah Bahan Baku'} onClose={onClose}>
      <form className="list" onSubmit={e => { e.preventDefault(); run(() => saveIngredient(f)); }}>
        <Field label="Nama Bahan" bad={bad.includes('name')}><input value={f.name} onChange={set('name')} /></Field>
        <Field label="Satuan (gram, ml, pcs…)" bad={bad.includes('unit')}><input value={f.unit} onChange={set('unit')} /></Field>
        {f.id
          ? <p className="muted">Stok saat ini: <b>{f.stockQty} {f.unit}</b>. Ubah stok lewat tombol “Stok” agar tercatat di riwayat.</p>
          : <Field label="Stok Awal (≥ 0)" bad={bad.includes('stockQty')}><input type="number" min="0" value={f.stockQty} onChange={set('stockQty')} /></Field>}
        <Field label="Batas Stok Minimum (≥ 0)" bad={bad.includes('minStock')}><input type="number" min="0" value={f.minStock} onChange={set('minStock')} /></Field>
        <button className="btn green">Simpan</button>
        {f.id && <button type="button" className="btn ghost" onClick={() => run(() => setIngredientActive(f.id, !f.isActive))}>{f.isActive ? 'Nonaktifkan Bahan' : 'Aktifkan Bahan'}</button>}
      </form>
    </Modal>
  );
}

function StockForm({ init, ingredients, onClose }) {
  const [f, setF] = useState(init);
  const [bad, setBad] = useState(false);
  const adj = f.changeType === 'PENYESUAIAN';
  const submit = async e => {
    e.preventDefault();
    try {
      const r = await addStock(f);
      toast(`Stok ${r.name} diperbarui: ${r.stockQty} ${r.unit}`, 'ok');
      if (r.lowStock) toast(`Peringatan: stok ${r.name} menipis`, 'warn'); // BR-41
      onClose();
    } catch (e) { setBad(true); toast(e.message); }
  };
  return (
    <Modal title="Stok Masuk / Penyesuaian" onClose={onClose}>
      <form className="list" onSubmit={submit}>
        <Field label="Bahan"><select value={f.ingredientId} onChange={e => setF({ ...f, ingredientId: e.target.value })}>{ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.stockQty} {i.unit})</option>)}</select></Field>
        <div className="row">
          {[['STOK_MASUK', 'Stok Masuk'], ['PENYESUAIAN', 'Penyesuaian']].map(([k, l]) => (
            <label key={k} className={'opt' + (f.changeType === k ? ' on' : '')} style={{ flex: 1 }}>
              <input type="radio" name="ct" checked={f.changeType === k} onChange={() => setF({ ...f, changeType: k })} />{l}
            </label>))}
        </div>
        <Field label={adj ? 'Sisa stok sebenarnya (≥ 0)' : 'Jumlah stok masuk (> 0)'} bad={bad}>
          <input type="number" min="0" step="any" value={f.quantity} onChange={e => setF({ ...f, quantity: e.target.value })} />
        </Field>
        <button className="btn green">Simpan</button>
      </form>
    </Modal>
  );
}
