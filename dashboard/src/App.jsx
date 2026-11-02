import { useCallback, useEffect } from 'react';
import Nav from './components/Nav.jsx';
import MarketPanel from './panels/MarketPanel.jsx';
import DetailPanel from './panels/DetailPanel.jsx';
import ComparePanel from './panels/ComparePanel.jsx';
import ForecastPanel from './panels/ForecastPanel.jsx';
import TimelinePanel from './panels/TimelinePanel.jsx';
import NewsPanel from './panels/NewsPanel.jsx';
import { SentimentProvider } from './hooks/SentimentContext.jsx';
import useLiveMarket from './hooks/useLiveMarket.js';
import { useLiveHistory, useLiveNews } from './hooks/useLiveData.js';
import LiveBanner from './components/LiveBanner.jsx';
import usePersisted from './hooks/usePersisted.js';
import { peers } from './data.js';
import './App.css';

const TABS = [
  ['market', 'Market'],
  ['detail', 'Company'],
  ['compare', 'Compare'],
  ['forecast', 'Forecast'],
  ['timeline', 'History'],
  ['news', 'News and sentiment'],
];
const DEFAULT_SYMBOL = 'BNBL';

export default function App() {
  const [active, setActive] = usePersisted('rsebl.tab', 'market', (v) => TABS.some(([k]) => k === v));
  const [symbol, setSymbol] = usePersisted('rsebl.symbol', DEFAULT_SYMBOL, (v) => peers.some((p) => p.symbol === v));
  const [theme, setTheme] = usePersisted('rsebl.theme', 'dark', (v) => v === 'dark' || v === 'light');
  const [favorites, setFavorites] = usePersisted('rsebl.favorites', [], (v) => Array.isArray(v));
  // Live prices from RSEB, refreshed each minute. Updates the peer records in place, and re-renders when they change.
  const live = useLiveMarket();
  const liveNews = useLiveNews();
  // Stored price history for the selected company. Refreshes the charts when it changes.
  useLiveHistory(symbol);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // "/" moves focus to the company search from anywhere on the page.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || /input|textarea|select/i.test(e.target.tagName)) return;
      e.preventDefault();
      document.getElementById('company-search')?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openCompany = useCallback(
    (sym) => {
      setSymbol(sym);
      setActive('detail');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setSymbol, setActive],
  );

  const toggleFavorite = useCallback(
    (sym) => setFavorites((f) => (f.includes(sym) ? f.filter((x) => x !== sym) : [...f, sym])),
    [setFavorites],
  );

  return (
    <SentimentProvider liveNews={liveNews}>
      <div className="scene" aria-hidden="true"><span /><span /><span /></div>
      <div className="app-shell">
        <Nav
          tabs={TABS}
          active={active}
          onTab={setActive}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          symbol={symbol}
          onSelect={openCompany}
        />
        <LiveBanner live={live} />
        <main className="app-main" id="main" key={active}>
          {active === 'market' && <MarketPanel onOpen={openCompany} favorites={favorites} onToggleFav={toggleFavorite} />}
          {active === 'detail' && (
            <DetailPanel symbol={symbol} onSelectSymbol={setSymbol} favorites={favorites} onToggleFav={toggleFavorite} />
          )}
          {active === 'compare' && <ComparePanel symbol={symbol} onSelectSymbol={openCompany} />}
          {active === 'forecast' && <ForecastPanel symbol={symbol} />}
          {active === 'timeline' && <TimelinePanel symbol={symbol} />}
          {active === 'news' && <NewsPanel symbol={symbol} />}

          <footer className="app-footer">
            Prices are taken from RSEBL. This site is not affiliated with RSEBL. Forecasts and sentiment are model estimates, provided for information only and not as investment advice.
          </footer>
        </main>
      </div>
    </SentimentProvider>
  );
}
