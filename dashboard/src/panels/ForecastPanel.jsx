import { useMemo, useState } from 'react';
import { peers, modelMeta, timelines, annualReports } from '../data.js';
import { Tilt } from '../components/Tilt.jsx';
import { Term } from '../components/ui.jsx';
import { fmt } from '../lib/format.js';
import { ChartTooltip, AXIS_TICK, GRID_STROKE } from './chartTheme.jsx';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const SERIES = [
  { key: 'actual', name: 'Actual price', help: 'Real closing prices from RSEBL.' },
  { key: 'backtest', name: 'Model on past days', help: 'What the model would have predicted for past days. This lets you check its accuracy.' },
  { key: 'future', name: 'Forecast', help: 'The model estimate for the next 30 trading days. It cannot be checked yet.' },
];

export default function ForecastPanel({ symbol }) {
  const peer = peers.find((p) => p.symbol === symbol);
  const meta = modelMeta[symbol];
  const [shown, setShown] = useState({ actual: true, backtest: true, future: true });

  const combined = useMemo(() => {
    if (!meta) return [];
    const rows = meta.backtest.map((r) => ({
      date: r.date,
      actual: r.target_next_close,
      backtest: r.predicted_next_close,
      future: null,
    }));
    if (rows.length) rows[rows.length - 1].future = rows[rows.length - 1].backtest;
    meta.forecast_30d.forEach((r) => rows.push({ date: r.date, actual: null, backtest: null, future: r.predicted_close }));
    return rows;
  }, [meta]);

  const features = useMemo(() => {
    if (!meta) return [];
    return Object.entries(meta.feature_importances).sort((a, b) => b[1] - a[1]);
  }, [meta]);

  if (!meta) {
    return (
      <div className="panel">
        <header className="page-head">
          <h2>{peer?.name ?? symbol}</h2>
          <p className="lede">No forecast is available for this company yet.</p>
        </header>
      </div>
    );
  }

  const m = meta.metrics;
  const maxImportance = Math.max(...features.map((f) => f[1]), 0.0001);
  const noSentiment = meta.news_feature_share === 0;
  const toggle = (k) => setShown((s) => ({ ...s, [k]: !s[k] }));
  const meetings = (timelines[symbol] || [])
    .filter((t) => /Annual General Meeting|Extraordinary General Meeting/i.test(t.title))
    .slice()
    .reverse();

  return (
    <div className="panel">
      <header className="page-head">
        <p className="eyebrow">Forecast</p>
        <h2>{peer?.name}</h2>
        <p className="lede">
          A forecast model trained on past prices, updated with the latest data. It is an estimate, not investment advice.
        </p>
      </header>

      <Tilt className="card chart-card">
        <div className="card-head wrap">
          <div>
            <h3>Price and forecast</h3>
            <p className="muted small">Tick a line to show or hide it. The model looks {m.horizon_days} trading days ahead.</p>
          </div>
          <div className="checks" role="group" aria-label="Lines to show">
            {SERIES.map((s) => (
              <label key={s.key} className="check" title={s.help}>
                <input type="checkbox" checked={shown[s.key]} onChange={() => toggle(s.key)} />
                {s.name}
              </label>
            ))}
          </div>
        </div>

        <div className="chart-box">
          <ResponsiveContainer>
            <ComposedChart data={combined} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={AXIS_TICK} minTickGap={40} />
              <YAxis tick={AXIS_TICK} width={48} domain={['auto', 'auto']} />
              <Tooltip cursor={{ stroke: 'rgba(120,120,140,0.5)', strokeDasharray: '4 4' }} content={<ChartTooltip formatValue={(v) => 'Nu. ' + fmt(v)} />} />
              <Area type="linear" dataKey="actual" name="Actual price" stroke="#38bdf8" strokeWidth={2.2} fill="url(#actualFill)" dot={false} connectNulls={false} hide={!shown.actual} isAnimationActive animationDuration={700} />
              <Line type="linear" dataKey="backtest" name="Model on past days" stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls={false} hide={!shown.backtest} isAnimationActive animationDuration={700} />
              <Line type="linear" dataKey="future" name="Forecast" stroke="#f472b6" strokeWidth={2} strokeDasharray="2 3" dot={false} connectNulls hide={!shown.future} isAnimationActive animationDuration={700} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Tilt>

      <div className="grid-3">
        <Tilt className="card">
          <div className="card-head"><div><h3>How accurate is it?</h3><p className="muted small">Tested on {m.n_test} days the model did not see during training.</p></div></div>
          <dl className="metrics">
            <div>
              <dt><Term tip="How much of the day-to-day price movement the model explains. 1 is perfect. 0 is no better than guessing the average. Below 0 is worse than guessing.">Accuracy score</Term></dt>
              <dd className={m.r2_return < 0 ? 'negative' : 'positive'}>{fmt(m.r2_return, 3)}</dd>
            </div>
            <div>
              <dt><Term tip="The average size of a prediction miss, in Ngultrum.">Typical miss</Term></dt>
              <dd>Nu. {fmt(m.mae_price)}</dd>
            </div>
            <div>
              <dt><Term tip="Like the typical miss, but large misses count for more. It shows how bad the worst predictions can be.">Largest typical miss</Term></dt>
              <dd>Nu. {fmt(m.rmse_price)}</dd>
            </div>
            <div>
              <dt><Term tip="How much the model relies on news headlines.">Weight given to news</Term></dt>
              <dd>{fmt(meta.news_feature_share * 100, 1)}%</dd>
            </div>
          </dl>
          {m.r2_return < 0 && (
            <p className="note">
              The accuracy score is below zero. This forecast currently does worse than a simple average-return guess. {symbol} trades thinly on RSEBL, and low volume makes short-term moves hard to predict. This is common for small, lightly traded shares.
            </p>
          )}
        </Tilt>

        <Tilt className="card">
          <div className="card-head"><div><h3>What the model looks at</h3><p className="muted small">Each input's share of the model's decisions.</p></div></div>
          <div className="bars">
            {features.map(([k, v]) => (
              <div className="bar-row" key={k}>
                <span className="bar-name mono">{k}</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: `${(v / maxImportance) * 100}%` }} /></span>
                <span className="bar-val mono">{fmt(v * 100, 1)}%</span>
              </div>
            ))}
          </div>
          {noSentiment && (
            <p className="note">The news inputs currently carry 0% weight, so headlines do not change this forecast.</p>
          )}
        </Tilt>

        <Tilt className="card">
          <div className="card-head"><div><h3>Order book</h3><p className="muted small">Live bids and offers come from RSEBL's trading feed, which is not connected here.</p></div></div>
          <p className="empty">No live order book data is available.</p>
          <h4 className="sub-head">Shareholder meetings</h4>
          {meetings.length === 0 && <p className="empty">No annual or extraordinary meetings on record.</p>}
          <ul className="meetings">
            {meetings.map((t, i) => (
              <li key={i}>
                <p className="meeting-title">{t.title}</p>
                <p className="muted small">{t.date}. {t.desc}</p>
              </li>
            ))}
          </ul>
        </Tilt>
      </div>

      <Tilt className="card">
        <div className="card-head">
          <div>
            <h3>Annual reports</h3>
            <p className="muted small">
              {annualReports[symbol]?.length
                ? "Taken from the company's own website."
                : "Not published here yet. The links below lead to the company's website and RSEBL's downloads page."}
            </p>
          </div>
        </div>
        <div className="links">
          {annualReports[symbol]?.length ? (
            annualReports[symbol].map((r) => (
              <a key={r.year} className="text-link" href={r.url} target="_blank" rel="noopener noreferrer">{r.year} annual report</a>
            ))
          ) : (
            <>
              {peer?.website && <a className="text-link" href={peer.website} target="_blank" rel="noopener noreferrer">{peer.name} website</a>}
              <a className="text-link" href="https://rsebl.org.bt/resources/downloads" target="_blank" rel="noopener noreferrer">RSEBL downloads page</a>
            </>
          )}
        </div>
      </Tilt>
    </div>
  );
}
