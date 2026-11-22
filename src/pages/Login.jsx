// SCR-03 Login Internal — /login. The role tabs only change the theme; the role comes from the account (D4).
import { useState } from 'react';
import { HOME, navigate } from '../router.jsx';
import { MOCK, login } from '../api.js';
import { Icon, Logo, act } from '../ui.jsx';

const TABS = {
  staf: ['Staf', 'user', 'kasir', 'Login Staf', 'Masuk untuk mengakses sistem MUD.CO.'],
  kasir: ['Kasir', 'printer', 'kasir', 'Login Kasir', 'Masuk untuk mengelola transaksi dan pencetakan nota.'],
  barista: ['Barista', 'coffee', 'barista', 'Login Barista', 'Masuk untuk mengelola pesanan dan status penyajian.'],
  pemilik: ['Pemilik', 'chart', 'pemilik', 'Login Pemilik', 'Masuk untuk melihat laporan, rekap keuntungan, menu, dan stok.'],
};

export default function Login() {
  const [tab, setTab] = useState('kasir');
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, , theme, title, desc] = TABS[tab];

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    const s = await act(() => login(u, p));
    setBusy(false);
    if (s) navigate(HOME[s.role]);
  };

  return (
    <div className={'login ' + theme}>
      <form className="panel list" onSubmit={submit}>
        <Logo />
        <h1>{title}</h1>
        <p className="sub">{desc}</p>
        <label className="field"><span>Username</span><input value={u} onChange={e => setU(e.target.value)} placeholder="Masukkan username" autoComplete="username" /></label>
        <label className="field"><span>Password</span>
          <span className="pw">
            <input type={show ? 'text' : 'password'} value={p} onChange={e => setP(e.target.value)} placeholder="Masukkan password" autoComplete="current-password" />
            <button type="button" className="eye" onClick={() => setShow(!show)} aria-label="Tampilkan password"><Icon n="eye" size={18} /></button>
          </span>
        </label>
        <button className="btn" disabled={busy}>Login</button>
        <div className="roles">{Object.entries(TABS).map(([k, [label, icon]]) => (
          <button type="button" key={k} className={k === tab ? 'on' : ''} onClick={() => setTab(k)}><Icon n={icon} size={18} />{label}</button>
        ))}</div>
        {MOCK && <p className="sub">Demo: kasir / kasir1234 · barista / barista1234 · pemilik / pemilik1234</p>}
      </form>
    </div>
  );
}
