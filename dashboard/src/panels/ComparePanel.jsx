import { useMemo, useState } from 'react';
import { peers, priceHistory } from '../data.js';
import { Tilt } from '../components/Tilt.jsx';
import { fmt, clsOf, signed, pctChange } from '../lib/format.js';
import { averageScore } from '../lib/sentiment.js';
import { sentimentCounts } from '../lib/news.js';
import { useSentimentData } from '../hooks/SentimentContext.jsx';
import { ChartTooltip, AXIS_TICK, GRID_STROKE } from './chartTheme.jsx';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#6366f1', '#22d3ee', '#fbbf24', '#f472b6'];
const MAX_SELECTED = 4;
const RANGES = [
  ['6M', 6],
  ['1Y', 12],
  ['2Y', 24],
  ['All', null],
];

export default function ComparePanel({ symbol, onSelectSymbol }) {
  const { items } = useSentimentData();
  const [selected, setSelected] = useState(() => [symbol]);
  const [range, setRange] = useState('1Y');
  const [normalised, setNormalised] = useState(true);

  const toggle = (sym) =>
    setSelected((s) => {
      if (s.includes(sym)) return s.length > 1 ? s.filter((x) => x !== sym) : s;
      if (s.length >= MAX_SELECTED) return s;
      return [...s, sym];
    });

  const months = RANGES.find(([k]) => k === range)?.[1];

  // Build one row per date with a column per selected company.
  const chartData = useMemo(() => {
    const series = selected.map((sym) => {
      const hist = priceHistory[sym] || [];
      if (!months || hist.length === 0) return hist;
      const end = new Date(hist[hist.length - 1].date);
      const start = new Date(end);
      start.setMonth(start.getMonth() - months);
      return hist.filter((p) => new Date(p.date) >= start);
    });
    const map = new Map();
    series.forEach((hist, idx) => {
      if (hist.length === 0) return;
      const base = hist[0].price;
      hist.forEach((p) => {
        const row = map.get(p.date) || { date: p.date };
        row[selected[idx]] = normalised ? Math.round((p.price / base) * 1000) / 10 : p.price;
        map.set(p.date, row);
      });
    });
    return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [selected, months, normalised]);

  const stats = selected.map((sym, i) => {
    const peer = peers.find((p) => p.symbol === sym);
    const hist = priceHistory[sym] || [];
    const scored = items.filter((n) => n.symbol === sym);
    const counts = sentimentCounts(scored);
    const avg = averageScore(scored.map((n) => n.sentiment.score));
    const ranged = months && hist.length
      ? hist.filter((p) => {
          const end = new Date(hist[hist.length - 1].date);
          const start = new Date(end);
          start.setMonth(start.getMonth() - months);
          return new Date(p.date) >= start;
        })
      : hist;
    return {
      sym,
      name: peer?.name ?? sym,
      color: COLORS[i % COLORS.length],
      price: peer?.price,
      change: peer?.pct_change,
      pe: peer?.pe,
      rangeChange: ranged.length > 1 ? pctChange(ranged[0].price, ranged[ranged.length - 1].price) : null,
      tone: avg,
      headlines: scored.length,
      positive: counts.positive,
      negative: counts.negative,
    };
  });

  return (
    <div className="panel">
      <header className="page-head">
        <p className="eyebrow">Compare</p>
        <h2>Compare companies</h2>
        <p className="lede">Choose up to {MAX_SELECTED} companies. Prices are shown from a common starting point of 100, so you can compare how each one moved.</p>
      </header>

      <Tilt className="card">
        <div className="card-head wrap">
          <div>
            <h3>Choose companies</h3>
            <p className="muted small">{selected.length} of {MAX_SELECTED} selected</p>
          </div>
          <div className="toolbar">
            <div className="segmented" role="group" aria-label="Time range">
              {RANGES.map(([r]) => (
                <button key={r} aria-pressed={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={normalised} onChange={(e) => setNormalised(e.target.checked)} />
              Start from 100
            </label>
          </div>
        </div>
        <div className="chips" role="group" aria-label="Companies to compare">
          {peers.map((p) => {
            const on = selected.includes(p.symbol);
            const disabled = !on && selected.length >= MAX_SELECTED;
            return (
              <button
                key={p.symbol}
                className={'chip' + (on ? ' on' : '')}
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggle(p.symbol)}
                onDoubleClick={() => onSelectSymbol(p.symbol)}
                title={disabled ? 'Remove a company first' : 'Double-click to open this company'}
              >
                {p.symbol}
              </button>
            );
          })}
        </div>
      </Tilt>

      <Tilt className="card chart-card">
        <div className="card-head">
          <div>
            <h3>{normalised ? 'Price movement, starting from 100' : 'Closing prices (Nu.)'}</h3>
            <p className="muted small">Daily closing prices over the selected period</p>
          </div>
        </div>
        <div className="chart-box">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 6, right: 12, left: -6, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={AXIS_TICK} minTickGap={40} />
              <YAxis tick={AXIS_TICK} width={48} domain={['auto', 'auto']} />
              <Tooltip cursor={{ stroke: 'rgba(120,120,140,0.5)', strokeDasharray: '4 4' }} content={<ChartTooltip formatValue={(v) => (normalised ? fmt(v, 1) : 'Nu. ' + fmt(v))} />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {stats.map((s) => (
                <Line key={s.sym} type="linear" dataKey={s.sym} name={s.sym} stroke={s.color} strokeWidth={2} dot={false} connectNulls isAnimationActive animationDuration={600} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Tilt>

      <Tilt className="card">
        <div className="card-head"><div><h3>Side by side</h3></div></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Measure</th>
                {stats.map((s) => <th scope="col" key={s.sym}><span className="swatch" style={{ background: s.color }} />{s.sym}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row">Company</th>{stats.map((s) => <td key={s.sym}>{s.name}</td>)}</tr>
              <tr><th scope="row">Latest price (Nu.)</th>{stats.map((s) => <td key={s.sym} className="mono">{fmt(s.price)}</td>)}</tr>
              <tr><th scope="row">Change today</th>{stats.map((s) => <td key={s.sym} className={'mono ' + clsOf(s.change)}>{signed(s.change)}%</td>)}</tr>
              <tr>
                <th scope="row">Change over {range === 'All' ? 'all data' : range}</th>
                {stats.map((s) => <td key={s.sym} className={'mono ' + clsOf(s.rangeChange)}>{s.rangeChange === null ? 'Not available' : signed(s.rangeChange, 1) + '%'}</td>)}
              </tr>
              <tr><th scope="row">P/E ratio</th>{stats.map((s) => <td key={s.sym} className="mono">{s.pe ? fmt(s.pe) : 'Not available'}</td>)}</tr>
              <tr><th scope="row">News tone (average)</th>{stats.map((s) => <td key={s.sym} className="mono">{s.tone === null ? 'No headlines' : (s.tone > 0 ? '+' : '') + s.tone.toFixed(2)}</td>)}</tr>
              <tr><th scope="row">Headlines</th>{stats.map((s) => <td key={s.sym} className="mono">{s.headlines} ({s.positive} positive, {s.negative} negative)</td>)}</tr>
            </tbody>
          </table>
        </div>
      </Tilt>
    </div>
  );
}
