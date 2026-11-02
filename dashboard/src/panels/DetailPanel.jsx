import { useMemo, useState } from 'react';
import { peers, priceHistory } from '../data.js';
import { Tilt, FlipCard } from '../components/Tilt.jsx';
import { CountUp } from '../components/ui.jsx';
import { fmt, clsOf, signed, pctChange } from '../lib/format.js';
import { ChartTooltip, AXIS_TICK, GRID_STROKE, toneColor } from './chartTheme.jsx';
import { ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const RANGES = [
  ['1M', 1],
  ['3M', 3],
  ['6M', 6],
  ['1Y', 12],
  ['2Y', 24],
  ['All', null],
];

export default function DetailPanel({ symbol, onSelectSymbol, favorites, onToggleFav }) {
  const peer = peers.find((p) => p.symbol === symbol);
  const [range, setRange] = useState('All');
  const all = priceHistory[symbol] || [];

  const pts = useMemo(() => {
    const months = RANGES.find(([k]) => k === range)?.[1];
    if (!months || all.length === 0) return all;
    const end = new Date(all[all.length - 1].date);
    const start = new Date(end);
    start.setMonth(start.getMonth() - months);
    return all.filter((p) => new Date(p.date) >= start);
  }, [all, range]);

  const rangeChange = pts.length > 1 ? pctChange(pts[0].price, pts[pts.length - 1].price) : null;
  const vHigh = all.length ? Math.max(...all.map((p) => p.price)) : null;
  const vLow = all.length ? Math.min(...all.map((p) => p.price)) : null;
  const saved = favorites.includes(symbol);

  const watchlist = useMemo(
    () => [...peers].sort((a, b) => (a.symbol === symbol ? -1 : b.symbol === symbol ? 1 : b.price - a.price)),
    [symbol],
  );

  const kpis = [
    { label: 'Price', value: peer?.price, prefix: 'Nu. ', note: 'Latest closing price', help: 'The most recent closing price on RSEBL, in Ngultrum.' },
    { label: 'Change', value: peer?.change, prefix: peer?.change > 0 ? '+' : '', note: 'Since the previous day', tone: clsOf(peer?.change), help: 'How many Ngultrum the price moved since the previous trading day.' },
    { label: 'Percentage change', value: peer?.pct_change, prefix: peer?.pct_change > 0 ? '+' : '', suffix: '%', note: 'Since the previous day', tone: clsOf(peer?.pct_change), help: 'The same move, expressed as a share of the previous price.' },
    { label: 'P/E ratio', value: peer?.pe, note: 'Price against yearly earnings', help: 'Share price divided by earnings per share over a year. "Not available" means earnings are missing or negative.' },
    { label: 'Highest price', value: vHigh, prefix: 'Nu. ', note: 'Since April 2020', help: 'The highest closing price in the price history we hold.' },
    { label: 'Lowest price', value: vLow, prefix: 'Nu. ', note: 'Since April 2020', help: 'The lowest closing price in the price history we hold.' },
  ];

  return (
    <div className="panel">
      <header className="page-head row">
        <div>
          <p className="eyebrow">{peer?.sector}</p>
          <h2>{peer?.name}</h2>
          <p className="muted">
            Symbol {symbol}
            {peer?.listed ? `, listed on RSEBL in ${peer.listed}` : ''}
          </p>
        </div>
        <button className={'btn' + (saved ? ' on' : '')} aria-pressed={saved} onClick={() => onToggleFav(symbol)}>
          {saved ? 'Saved' : 'Save company'}
        </button>
      </header>

      <div className="kpi-grid">
        {kpis.map((k) => (
          <FlipCard
            key={k.label}
            label={k.label}
            className="kpi-cell"
            front={
              <div className="kpi">
                <span className="stat-label">{k.label}</span>
                <span className={'stat-value ' + (k.tone || '')}>
                  {k.value === null || k.value === undefined ? 'Not available' : <CountUp value={k.value} prefix={k.prefix} suffix={k.suffix} />}
                </span>
                <span className="stat-note">{k.note}</span>
                <span className="flip-hint">Select for a definition</span>
              </div>
            }
            back={
              <div className="kpi">
                <span className="stat-label">{k.label}</span>
                <p>{k.help}</p>
              </div>
            }
          />
        ))}
      </div>

      <div className="split narrow-left">
        <div className="watchlist" role="list" aria-label="Companies">
          {watchlist.map((p) => (
            <button
              key={p.symbol}
              role="listitem"
              className={'watch-row' + (p.symbol === symbol ? ' on' : '')}
              onClick={() => onSelectSymbol(p.symbol)}
            >
              <span className="watch-name">
                {p.name}
                {favorites.includes(p.symbol) && <span className="saved-tag">Saved</span>}
              </span>
              <span className="watch-price mono">
                {fmt(p.price)}
                <span className={'change ' + clsOf(p.pct_change)}>{signed(p.pct_change)}%</span>
              </span>
            </button>
          ))}
        </div>

        <div className="stack">
          <div className="toolbar between">
            <div className="segmented" role="group" aria-label="Time range">
              {RANGES.map(([r]) => (
                <button key={r} aria-pressed={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
                  {r}
                </button>
              ))}
            </div>
            {rangeChange !== null && (
              <p className={'range-result ' + clsOf(rangeChange)}>
                {rangeChange >= 0 ? 'Up' : 'Down'} {fmt(Math.abs(rangeChange), 1)}% over {range === 'All' ? 'the full period' : range}
              </p>
            )}
          </div>

          <Tilt className="card chart-card">
            <div className="card-head">
              <div>
                <h3>Closing price</h3>
                <p className="muted small">Daily closes, {all.length} trading days since {all[0]?.date}</p>
              </div>
            </div>
            <div className="chart-box" key={symbol + range}>
              <ResponsiveContainer>
                <ComposedChart data={pts} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={toneColor(rangeChange)} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={toneColor(rangeChange)} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={AXIS_TICK} minTickGap={40} />
                  <YAxis tick={AXIS_TICK} width={48} domain={['auto', 'auto']} />
                  <Tooltip cursor={{ stroke: 'rgba(120,120,140,0.5)', strokeDasharray: '4 4' }} content={<ChartTooltip formatValue={(v) => 'Nu. ' + fmt(v)} />} />
                  <Area type="linear" dataKey="price" name="Closing price" stroke={toneColor(rangeChange)} strokeWidth={2} fill="url(#priceFill)" dot={false} isAnimationActive animationDuration={650} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Tilt>
        </div>
      </div>

      <Tilt className="card">
        <div className="card-head"><div><h3>About the company</h3></div></div>
        {peer?.about && <p className="prose">{peer.about}</p>}
        <dl className="facts">
          <div><dt>Sector</dt><dd>{peer?.sector}</dd></div>
          <div><dt>Founded</dt><dd>{peer?.founded ?? 'Not available'}</dd></div>
          <div><dt>Listed on RSEBL</dt><dd>{peer?.listed ?? 'Not available'}</dd></div>
          {peer?.paid_up_shares && <div><dt>Shares paid up</dt><dd>{peer.paid_up_shares.toLocaleString()}</dd></div>}
          {peer?.address && <div><dt>Address</dt><dd>{peer.address}</dd></div>}
          {peer?.website && (
            <div>
              <dt>Website</dt>
              <dd><a href={peer.website} target="_blank" rel="noopener noreferrer">{peer.website.replace(/^https?:\/\//, '')}</a></dd>
            </div>
          )}
        </dl>
      </Tilt>
    </div>
  );
}
