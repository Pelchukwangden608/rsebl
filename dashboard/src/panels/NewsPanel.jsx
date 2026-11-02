import { useMemo, useState } from 'react';
import { peers } from '../data.js';
import { Tilt } from '../components/Tilt.jsx';
import { SentimentBadge, SentimentBar, ToneMeter, Highlighted } from '../components/ui.jsx';
import { sentimentCounts } from '../lib/news.js';
import { averageScore } from '../lib/sentiment.js';
import { MODEL_ID } from '../lib/neural.js';
import { useSentimentData } from '../hooks/SentimentContext.jsx';
import { AXIS_TICK, GRID_STROKE, UP, DOWN } from './chartTheme.jsx';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const LABEL_COLOR = { positive: UP, neutral: '#94a3b8', negative: DOWN };
const TONE_FILTERS = [
  ['all', 'All'],
  ['positive', 'Positive'],
  ['neutral', 'Neutral'],
  ['negative', 'Negative'],
];

function DotTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip wide">
      <div className="chart-tip-date">{p.date}</div>
      <div className="chart-tip-head">{p.headline}</div>
      <div className="muted small">Score {p.y > 0 ? '+' : ''}{p.y.toFixed(2)} ({p.label})</div>
    </div>
  );
}

export default function NewsPanel({ symbol }) {
  const { items, engine, setEngine, engineInUse, loader, retry, agreement } = useSentimentData();
  const peer = peers.find((p) => p.symbol === symbol);
  const [query, setQuery] = useState('');
  const [tone, setTone] = useState('all');
  const [newest, setNewest] = useState(true);

  const companyNews = useMemo(() => items.filter((n) => n.symbol === symbol), [items, symbol]);

  const summary = useMemo(() => {
    const counts = sentimentCounts(companyNews);
    const avg = averageScore(companyNews.map((n) => n.sentiment.score));
    const dominant = companyNews.length === 0 ? null : Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return { counts, avg, dominant };
  }, [companyNews]);

  const points = useMemo(
    () =>
      companyNews.map((n) => ({
        t: new Date(n.date).getTime(),
        date: n.date,
        y: n.sentiment.score,
        label: n.sentiment.label,
        headline: n.headline,
      })),
    [companyNews],
  );

  const listed = useMemo(() => {
    const ql = query.trim().toLowerCase();
    return companyNews
      .filter((n) => (tone === 'all' || n.sentiment.label === tone) && (!ql || n.headline.toLowerCase().includes(ql)))
      .sort((a, b) => (newest ? new Date(b.date) - new Date(a.date) : new Date(a.date) - new Date(b.date)));
  }, [companyNews, query, tone, newest]);

  const engineNote = (() => {
    if (engine === 'lexicon') return 'The word list runs instantly in the browser and needs no setup. It shows the words behind each label.';
    switch (loader.status) {
      case 'checking': return 'Connecting to the FinBERT service.';
      case 'loading': return 'The FinBERT service is loading the model. The first start can take a few minutes.';
      case 'scoring': return `FinBERT is scoring headlines: ${loader.progress}% done.`;
      case 'ready': return 'FinBERT is scoring these headlines.';
      case 'unavailable': return `The service is running, but FinBERT could not load: ${loader.error}. The word list is shown instead.`;
      case 'offline': return `${loader.error} The word list is shown instead.`;
      default: return 'FinBERT scores come from the local service. The word list is shown until they arrive.';
    }
  })();

  return (
    <div className="panel">
      <header className="page-head">
        <p className="eyebrow">News and sentiment</p>
        <h2>{peer?.name}</h2>
        <p className="lede">
          Each headline is read and labelled as positive, neutral or negative. Choose the reading engine below.
        </p>
      </header>

      <div className="split">
        <Tilt className="card">
          <div className="card-head">
            <div>
              <h3>Overall tone</h3>
              <p className="muted small">{companyNews.length} headlines for this company</p>
            </div>
            {summary.dominant && <SentimentBadge label={summary.dominant} />}
          </div>
          <SentimentBar counts={summary.counts} />
          <div className="legend">
            <span><i className="dot positive" /> {summary.counts.positive} positive</span>
            <span><i className="dot neutral" /> {summary.counts.neutral} neutral</span>
            <span><i className="dot negative" /> {summary.counts.negative} negative</span>
          </div>
          <div className="block">
            <ToneMeter score={summary.avg} />
          </div>
          {points.length > 0 && (
            <div className="scatter-box">
              <p className="muted small">Each dot is one headline, placed by date and score. Hover a dot to read it.</p>
              <ResponsiveContainer width="100%" height={210}>
                <ScatterChart margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={['auto', 'auto']}
                    tick={AXIS_TICK}
                    tickFormatter={(v) => new Date(v).getFullYear()}
                    name="Date"
                  />
                  <YAxis dataKey="y" domain={[-1, 1]} tick={AXIS_TICK} width={40} ticks={[-1, 0, 1]} />
                  <ReferenceLine y={0} stroke="rgba(120,120,140,0.5)" />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<DotTooltip />} />
                  {['positive', 'neutral', 'negative'].map((label) => (
                    <Scatter key={label} name={label} data={points.filter((p) => p.label === label)} fill={LABEL_COLOR[label]} fillOpacity={0.85} />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </Tilt>

        <Tilt className="card">
          <div className="card-head"><div><h3>Reading engine</h3><p className="muted small">How headlines are labelled</p></div></div>
          <div className="radio-group" role="radiogroup" aria-label="Reading engine">
            <label className={'radio' + (engine === 'lexicon' ? ' on' : '')}>
              <input type="radio" name="engine" value="lexicon" checked={engine === 'lexicon'} onChange={() => setEngine('lexicon')} />
              <span>
                <strong>Word list</strong>
                <span className="muted small">Finance-tuned word list with rules for negation and emphasis. Shows the words behind each label.</span>
              </span>
            </label>
            <label className={'radio' + (engine === 'finbert' ? ' on' : '')}>
              <input type="radio" name="engine" value="finbert" checked={engine === 'finbert'} onChange={() => setEngine('finbert')} />
              <span>
                <strong>FinBERT</strong>
                <span className="muted small">A neural network pretrained on financial text ({MODEL_ID}). Runs on the local Python service.</span>
              </span>
            </label>
          </div>
          <p className="note">{engineNote}</p>
          {loader.status === 'scoring' && (
            <div className="progress" role="progressbar" aria-valuenow={loader.progress} aria-valuemin="0" aria-valuemax="100">
              <span style={{ width: `${loader.progress}%` }} />
            </div>
          )}
          {(loader.status === 'offline' || loader.status === 'unavailable') && (
            <button className="btn" onClick={retry} style={{ marginTop: 12 }}>Retry</button>
          )}
          <dl className="metrics compact">
            <div>
              <dt>Engine in use</dt>
              <dd>{engineInUse === 'finbert' ? 'FinBERT' : 'Word list'}</dd>
            </div>
            <div>
              <dt>Agreement with dataset tags</dt>
              <dd>{agreement.pct}% ({agreement.agree} of {agreement.total})</dd>
            </div>
          </dl>
          <p className="note">
            Agreement is measured against the tags in the dataset. Most tags are neutral, and some price-report headlines carry little sentiment, so treat this figure as a rough guide.
          </p>
        </Tilt>
      </div>

      <Tilt className="card">
        <div className="card-head wrap">
          <div>
            <h3>Headlines</h3>
            <p className="muted small">{listed.length} shown</p>
          </div>
          <div className="toolbar">
            <input className="field" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search headlines" aria-label="Search headlines" />
            <button className="btn" onClick={() => setNewest((n) => !n)}>{newest ? 'Newest first' : 'Oldest first'}</button>
          </div>
        </div>

        <div className="chips" role="group" aria-label="Filter by tone">
          {TONE_FILTERS.map(([k, label]) => (
            <button key={k} className={'chip' + (tone === k ? ' on' : '')} aria-pressed={tone === k} onClick={() => setTone(k)}>
              {label}
            </button>
          ))}
        </div>

        {listed.length === 0 && (
          <p className="empty">{companyNews.length === 0 ? 'No news has been recorded for this company.' : 'No headlines match these filters.'}</p>
        )}

        <div className="news-grid">
          {listed.map((n, i) => (
            <a className="news-card" href={n.url} target="_blank" rel="noopener noreferrer" key={`${n.date}-${i}`}>
              <span className="news-meta">
                <span className="outlet">{n.outlet}</span>
                <SentimentBadge label={n.sentiment.label} confidence={n.sentiment.confidence} />
              </span>
              <span className="news-date">{n.date}</span>
              <span className="news-title">
                <Highlighted text={n.headline} tokens={n.sentiment.tokens} />
              </span>
              <span className="news-cta">Read the source</span>
            </a>
          ))}
        </div>
      </Tilt>
    </div>
  );
}
