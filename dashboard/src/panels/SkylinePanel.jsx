import { lazy, Suspense, useMemo, useState } from 'react';
import { peers } from '../data.js';
import { Tilt } from '../components/Tilt.jsx';
import { useSentimentData } from '../hooks/SentimentContext.jsx';
import { parseCap, formatBigNu } from '../lib/format.js';

const Market3D = lazy(() => import('../components/Market3D.jsx'));

const METRICS = [
  ['pct', "Today's move"],
  ['cap', 'Market cap'],
  ['sent', 'News sentiment'],
];

/* 3D skyline of every listed company. The tower height and colour show the chosen measure. */
export default function SkylinePanel({ onOpen, selected }) {
  const { items } = useSentimentData();
  const [metric, setMetric] = useState('pct');

  const sentimentBySymbol = useMemo(() => {
    const totals = {};
    items.forEach((n) => {
      if (!n.symbol) return;
      const t = (totals[n.symbol] ||= { sum: 0, n: 0 });
      t.sum += n.sentiment.score;
      t.n += 1;
    });
    return Object.fromEntries(Object.entries(totals).map(([s, t]) => [s, { net: t.sum / t.n, n: t.n }]));
  }, [items]);

  const towers = useMemo(
    () =>
      [...peers]
        .sort((a, b) => a.sector.localeCompare(b.sector) || a.symbol.localeCompare(b.symbol))
        .map((p) => {
          const cap = parseCap(p.cap);
          const sent = sentimentBySymbol[p.symbol];
          if (metric === 'cap') return { symbol: p.symbol, name: p.name, sector: p.sector, value: cap ? Math.sqrt(cap) : 0, display: `Market cap ${formatBigNu(cap)}` };
          if (metric === 'sent')
            return { symbol: p.symbol, name: p.name, sector: p.sector, value: sent ? sent.net : 0, display: sent ? `News sentiment ${sent.net >= 0 ? '+' : ''}${sent.net.toFixed(2)} from ${sent.n} headlines` : 'No headlines yet' };
          return { symbol: p.symbol, name: p.name, sector: p.sector, value: p.pct_change, display: `Today ${p.pct_change >= 0 ? '+' : ''}${p.pct_change.toFixed(2)}% · Nu. ${p.price.toFixed(2)}` };
        }),
    [metric, sentimentBySymbol],
  );

  return (
    <Tilt className="card sky-card" max={1.5}>
      <div className="card-head">
        <div>
          <h3>3D market skyline</h3>
          <p className="muted small">One tower per company, grouped by sector. Drag to turn it, scroll to zoom, click a tower to open the company.</p>
        </div>
        <div className="segmented" role="tablist" aria-label="Skyline measure">
          {METRICS.map(([k, label]) => (
            <button key={k} className={metric === k ? 'on' : ''} onClick={() => setMetric(k)} role="tab" aria-selected={metric === k}>{label}</button>
          ))}
        </div>
      </div>
      <Suspense fallback={<div className="sky-wrap skeleton" />}>
        <Market3D items={towers} metric={metric} onOpen={onOpen} selected={selected} />
      </Suspense>
    </Tilt>
  );
}
