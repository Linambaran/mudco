import { useEffect } from 'react';
import { HOME, match, navigate, useLocation } from './router.jsx';
import { MSG, getSession, isValidTable } from './api.js';
import { ErrorBox, Logo, ToastHost, toast } from './ui.jsx';
import Home from './pages/Home.jsx';
import Menu from './pages/Menu.jsx';
import Checkout from './pages/Checkout.jsx';
import Status from './pages/Status.jsx';
import Login from './pages/Login.jsx';
import Kasir from './pages/Kasir.jsx';
import Barista from './pages/Barista.jsx';
import Owner from './pages/Owner.jsx';
import Stok from './pages/Stok.jsx';

// [path, page, required role, needs valid table]  — routes from FSD 3.1
const routes = [
  ['/', Home],
  ['/order/:tableId', Menu, null, true],
  ['/order/:tableId/checkout', Checkout, null, true],
  ['/order/:tableId/status/:orderId', Status, null, true],
  ['/login', Login],
  ['/kasir/pesanan', Kasir, 'KASIR'],
  ['/barista/antrian', Barista, 'BARISTA'],
  ['/pemilik/dashboard', Owner, 'PEMILIK'],
  ['/pemilik/stok', Stok, 'PEMILIK'],
];

function Redirect({ to, msg }) {
  useEffect(() => { toast(msg); navigate(to, true); }, []);
  return null;
}
const Fail = ({ message, code }) => <div className="app"><header className="top"><Logo /></header><ErrorBox e={{ message, code }} /></div>;

export default function App() {
  const path = useLocation().split('?')[0].replace(/(.)\/$/, '$1');
  let page = <Fail message="Halaman tidak ditemukan" />;
  for (const [p, C, role, table] of routes) {
    const params = match(p, path);
    if (!params) continue;
    const s = getSession();
    if (table && !isValidTable(params.tableId)) page = <Fail message={MSG['ERR-VAL-01']} code="ERR-VAL-01" />;
    else if (role && !s) page = <Redirect to="/login" msg={MSG['ERR-AUTH-01']} />;      // BR-16
    else if (role && s.role !== role) page = <Redirect to={HOME[s.role]} msg={MSG['ERR-AUTH-04']} />; // BR-19 RBAC
    else page = <C key={path} {...params} />;
    break;
  }
  return <>{page}<ToastHost /></>;
}
