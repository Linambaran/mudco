// ~20 lines instead of react-router: History API + ':param' matching is all the FSD routes need.
import { useEffect, useState } from 'react';

export const HOME = { KASIR: '/kasir/pesanan', BARISTA: '/barista/antrian', PEMILIK: '/pemilik/dashboard' };

export const navigate = (to, replace) => {
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  dispatchEvent(new Event('popstate'));
};

export function useLocation() {
  const get = () => location.pathname + location.search;
  const [loc, set] = useState(get);
  useEffect(() => {
    const f = () => set(get());
    addEventListener('popstate', f);
    f(); // a child effect (e.g. <Redirect>) may have navigated before this listener existed
    return () => removeEventListener('popstate', f);
  }, []);
  return loc;
}

export function match(pattern, path) {
  const p = pattern.split('/'), a = path.split('/');
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i][0] === ':') params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export const Link = ({ to, children, ...rest }) => (
  <a href={to} onClick={e => { e.preventDefault(); navigate(to); }} {...rest}>{children}</a>
);
