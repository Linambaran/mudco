// Not in the FSD: demo entry point. In production the QR codes point straight to /order/:tableId.
import { Link } from '../router.jsx';
import { Logo } from '../ui.jsx';

export default function Home() {
  return (
    <div className="app">
      <header className="top"><Logo /></header>
      <h1>MUD.CO Self Order</h1>
      <p className="muted">Pembeli memindai QR code di meja. Untuk demo, pilih meja:</p>
      <div className="grid tables">{Array.from({ length: 10 }, (_, i) => <Link key={i} to={`/order/${i + 1}`} className="btn ghost">Meja {i + 1}</Link>)}</div>
      <p><Link to="/login" className="btn">Login Staf</Link></p>
    </div>
  );
}
