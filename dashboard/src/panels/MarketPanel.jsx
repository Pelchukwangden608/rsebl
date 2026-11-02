import { useMemo, useState } from 'react';
import { peers, priceHistory } from '../data.js';
import { Tilt, FlipCard } from '../components/Tilt.jsx';
import { CountUp, Sparkline, SentimentBar } from '../components/ui.jsx';
import { fmt, clsOf, signed, parseCap, formatBigNu, downloadCsv } from '../lib/format.js';
import { sentimentCounts } from '../lib/news.js';
import { useSentimentData } from '../hooks/SentimentContext.jsx';
import SkylinePanel from './SkylinePanel.jsx';

const HIGHLIGHTS = [
  ['risers', 'Top gainers'],
  ['fallers', 'Top losers'],
  ['volume', 'Most traded'],
];

const COLUMNS = [
  ['symbol', 'Symbol'],
  ['name', 'Company'],
  ['trend', 'Last 120 days'],
  ['pe', 'P/E'],
  ['price', 'Price (Nu.)'],
  ['pct_change', 'Change'],
  ['cap', 'Market cap'],
];

const sortValue = (p, key) => (key === 'cap' ? parseCap(p.cap) : p[key]);

export default function MarketPanel({ onOpen, favorites, onToggleFav }) {
  const { items } = useSentimentData();
  const [sector, setSector] = useState('all');
  const [query, setQuery] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [sortKey, setSortKey] = useState('price');
  const [sortDir, setSortDir] = useState(-1);
  const [mode, setMode] = useState('risers');

  const sectors = useMemo(() => ['all', ...new Set(peers.map((p) => p.sector))], []);

  const overview = useMemo(() => {
    const advancers = peers.filter((p) => p.pct_change > 0).length;
    const decliners = peers.filter((p) => p.pct_change < 0).length;
    const totalCap = peers.reduce((s, p) => s + (parseCap(p.cap) || 0), 0);
    const pes = peers.map((p) => p.pe).filter((v) => typeof v === 'number' && v > 0);
    const avgPe = pes.length ? pes.reduce((a, b) => a + b, 0) / pes.length : null;
    return {
      advancers,
      decliners,
      unchanged: peers.length - advancers - decliners,
      totalCap,
      avgPe,
      tone: sentimentCounts(items),
    };
  }, [items]);

  const highlights = useMemo(() => {
    let r = [...peers];
    if (mode === 'risers') r = r.filter((p) => p.pct_change > 0).sort((a, b) => b.pct_change - a.pct_change);
    else if (mode === 'fallers') r = r.filter((p) => p.pct_change < 0).sort((a, b) => a.pct_change - b.pct_change);
    else r = r.filter((p) => p.vol).sort((a, b) => b.vol - a.vol);
    return r.slice(0, 5);
  }, [mode]);

  const rows = useMemo(() => {
    const ql = query.trim().toLowerCase();
    const filtered = peers.filter(
      (p) =>
        (sector === 'all' || p.sector === sector) &&
        (!savedOnly || favorites.includes(p.symbol)) &&
        (!ql || p.symbol.toLowerCase().includes(ql) || p.name.toLowerCase().includes(ql)),
    );
    return filtered.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'string') return va.localeCompare(vb) * sortDir;
      return (va - vb) * sortDir;
    });
  }, [sector, query, savedOnly, favorites, sortKey, sortDir]);

  const sortBy = (k) => {
    if (k === 'trend') return;
    setSortDir(sortKey === k ? -sortDir : -1);
    setSortKey(k);
  };

  const exportCsv = () =>
    downloadCsv(
      'rsebl-market-watch.csv',
      ['Symbol', 'Company', 'Sector', 'Price (Nu.)', 'Change (Nu.)', 'Change %', 'P/E', 'Market cap'],
      rows.map((p) => [p.symbol, p.name, p.sector, p.price, p.change, p.pct_change, p.pe ?? '', p.cap ?? '']),
    );

  const reset = () => { setQuery(''); setSector('all'); setSavedOnly(false); };

  return (
    <div className="panel">
      <header className="page-head">
        <h2>Market overview</h2>
        <p className="lede">Prices refresh from RSEB each time you open the dashboard and every minute after that. Select any company to see its history, forecast and news.</p>
      </header>

      <section className="stat-grid" aria-label="Market summary">
        <Tilt className="card stat">
          <span className="stat-label">Rising</span>
          <span className="stat-value positive"><CountUp value={overview.advancers} decimals={0} /></span>
          <span className="stat-note">companies up on the day</span>
        </Tilt>
        <Tilt className="card stat">
          <span className="stat-label">Falling</span>
          <span className="stat-value negative"><CountUp value={overview.decliners} decimals={0} /></span>
          <span className="stat-note">companies down on the day</span>
        </Tilt>
        <Tilt className="card stat">
          <span className="stat-label">Unchanged</span>
          <span className="stat-value"><CountUp value={overview.unchanged} decimals={0} /></span>
          <span className="stat-note">no price movement</span>
        </Tilt>
        <Tilt className="card stat">
          <span className="stat-label">Total market value</span>
          <span className="stat-value">{formatBigNu(overview.totalCap)}</span>
          <span className="stat-note">average P/E {overview.avgPe ? fmt(overview.avgPe, 1) : 'not available'}</span>
        </Tilt>
        <Tilt className="card stat stat-wide">
          <span className="stat-label">News tone</span>
          <SentimentBar counts={overview.tone} />
          <span className="stat-note">
            {overview.tone.positive} positive, {overview.tone.neutral} neutral, {overview.tone.negative} negative headlines
          </span>
        </Tilt>
      </section>

      <SkylinePanel onOpen={onOpen} selected={null} />

      <div className="split">
        <Tilt className="card">
          <div className="card-head">
            <div>
              <h3>Highlights</h3>
              <p className="muted small">Select a row to open the company.</p>
            </div>
          </div>
          <div className="segmented" role="tablist" aria-label="Highlight type">
            {HIGHLIGHTS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th scope="col">Symbol</th><th scope="col">Company</th><th scope="col">Price</th><th scope="col">Change</th></tr>
              </thead>
              <tbody>
                {highlights.length === 0 && (
                  <tr><td colSpan="4" className="empty">Nothing to show in this view today.</td></tr>
                )}
                {highlights.map((p) => (
                  <tr key={p.symbol} className="click-row" onClick={() => onOpen(p.symbol)}>
                    <td className="sym">{p.symbol}</td>
                    <td className="truncate">{p.name}</td>
                    <td className="mono">{fmt(p.price)}</td>
                    <td><span className={'change ' + clsOf(p.pct_change)}>{signed(p.pct_change)}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tilt>

        <FlipCard
          className="flip-fill"
          label="About these figures"
          front={
            <div className="explain">
              <h3>About these figures</h3>
              <p>Prices are the official closing prices published by RSEBL. The forecast and the news tone are estimates produced by models, not advice.</p>
              <p className="flip-hint">Select to read the definitions.</p>
            </div>
          }
          back={
            <div className="explain">
              <h3>Definitions</h3>
              <p><b>P/E:</b> the share price divided by earnings per share over a year. Higher often means investors expect growth.</p>
              <p><b>Market value:</b> the share price multiplied by the number of shares.</p>
              <p><b>News tone:</b> a score from the wording of news headlines. It is not based on trading.</p>
            </div>
          }
        />
      </div>

      <Tilt className="card">
        <div className="card-head wrap">
          <div>
            <h3>All companies</h3>
            <p className="muted small">
              Showing {rows.length} of {peers.length} companies. Select a column heading to sort.
            </p>
          </div>
          <div className="toolbar">
            <input
              className="field"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or symbol"
              aria-label="Search companies"
            />
            <label className="check">
              <input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} />
              Saved only ({favorites.length})
            </label>
            <button className="btn" onClick={exportCsv} disabled={rows.length === 0}>Download CSV</button>
          </div>
        </div>

        <div className="chips" role="group" aria-label="Sector">
          {sectors.map((s) => (
            <button key={s} className={'chip' + (sector === s ? ' on' : '')} aria-pressed={sector === s} onClick={() => setSector(s)}>
              {s === 'all' ? 'All sectors' : s}
            </button>
          ))}
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col" aria-label="Saved">Saved</th>
                {COLUMNS.map(([k, label]) => (
                  <th
                    key={k}
                    scope="col"
                    aria-sort={sortKey === k ? (sortDir === 1 ? 'ascending' : 'descending') : undefined}
                  >
                    {k === 'trend' ? (
                      label
                    ) : (
                      <button className={'th-btn' + (sortKey === k ? ' on' : '')} onClick={() => sortBy(k)}>
                        {label}
                        {sortKey === k && <span className="sr-note">{sortDir === -1 ? ', high to low' : ', low to high'}</span>}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="empty">
                    No companies match these filters. <button className="link-btn" onClick={reset}>Clear filters</button>
                  </td>
                </tr>
              )}
              {rows.map((p) => {
                const saved = favorites.includes(p.symbol);
                return (
                  <tr key={p.symbol} className="click-row" onClick={() => onOpen(p.symbol)}>
                    <td>
                      <button
                        className={'save-btn' + (saved ? ' on' : '')}
                        aria-pressed={saved}
                        aria-label={saved ? `Remove ${p.symbol} from saved companies` : `Save ${p.symbol}`}
                        onClick={(e) => { e.stopPropagation(); onToggleFav(p.symbol); }}
                      >
                        {saved ? 'Saved' : 'Save'}
                      </button>
                    </td>
                    <td className="sym">{p.symbol}</td>
                    <td className="truncate">{p.name}</td>
                    <td><Sparkline points={priceHistory[p.symbol] || []} id={p.symbol} /></td>
                    <td className="mono">{p.pe ? fmt(p.pe) : 'N/A'}</td>
                    <td className="mono">{fmt(p.price)}</td>
                    <td><span className={'change ' + clsOf(p.pct_change)}>{signed(p.pct_change)}%</span></td>
                    <td className="mono">{p.cap || 'N/A'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tilt>
    </div>
  );
}

