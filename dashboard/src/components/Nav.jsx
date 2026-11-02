import { useLayoutEffect, useRef, useState } from 'react';
import logoSrc from '../logo.png';
import CompanySearch from './CompanySearch.jsx';

/* Top navigation with a sliding highlight under the active section. */
export default function Nav({ tabs, active, onTab, theme, onToggleTheme, symbol, onSelect }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const tabRefs = useRef({});
  const listRef = useRef(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[active];
      const list = listRef.current;
      if (!el || !list) return;
      const box = el.getBoundingClientRect();
      const base = list.getBoundingClientRect();
      setIndicator({ left: box.left - base.left, width: box.width });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active]);

  const go = (key) => {
    onTab(key);
    setMenuOpen(false);
  };

  return (
    <header className="nav">
      <div className="nav-top">
        <div className="brand">
          <img src={logoSrc} alt="" className="logo" />
          <div>
            <div className="brand-title">RSEBL Market Watch</div>
            <div className="brand-sub">Prices, forecasts and news sentiment for listed companies</div>
          </div>
        </div>
        <div className="nav-controls">
          <button className="ghost-btn" onClick={onToggleTheme}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            className="ghost-btn hamburger"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>
      <div className={'nav-bottom' + (menuOpen ? ' open' : '')}>
        <nav className="nav-tabs" aria-label="Sections" ref={listRef}>
          <span className="nav-indicator" style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }} aria-hidden="true" />
          {tabs.map(([key, label]) => (
            <button
              key={key}
              ref={(el) => (tabRefs.current[key] = el)}
              className={'nav-tab' + (active === key ? ' active' : '')}
              aria-current={active === key ? 'page' : undefined}
              onClick={() => go(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <CompanySearch selected={symbol} onSelect={(s) => { onSelect(s); setMenuOpen(false); }} />
      </div>
    </header>
  );
}
