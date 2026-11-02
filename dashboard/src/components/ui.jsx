import { useEffect, useState } from 'react';
import { fmt } from '../lib/format.js';

export const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Number that counts up to its value when it first appears or changes. */
export function CountUp({ value, decimals = 2, prefix = '', suffix = '' }) {
  const valid = value !== null && value !== undefined && !Number.isNaN(Number(value));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!valid) return undefined;
    if (reducedMotion()) {
      setDisplay(Number(value));
      return undefined;
    }
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / 800);
      setDisplay(Number(value) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, valid]);

  if (!valid) return <>Not available</>;
  return <>{prefix}{fmt(display, decimals)}{suffix}</>;
}

/* Small trend line of the last 120 trading days. */
export function Sparkline({ points = [], id }) {
  const pts = points.slice(-120);
  if (pts.length < 2) return <span className="muted">No history</span>;
  const w = 88;
  const h = 26;
  const pad = 3;
  const prices = pts.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const step = (w - pad * 2) / (prices.length - 1);
  const coords = prices.map((p, i) => [pad + i * step, h - pad - ((p - min) / range) * (h - pad * 2)]);
  const line = coords.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ');
  const last = coords[coords.length - 1];
  const area = `${line} L${last[0].toFixed(1)},${h} L${coords[0][0].toFixed(1)},${h} Z`;
  const color = prices[prices.length - 1] >= prices[0] ? '#10b981' : '#f43f5e';
  const gid = `spark-${id}`;
  return (
    <svg width={w} height={h} aria-hidden="true" className="spark">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={color} />
    </svg>
  );
}

/* A term with a dotted underline. Hovering or focusing it shows a plain-language explanation. */
export function Term({ tip, children }) {
  return (
    <span className="term" tabIndex={0} data-tip={tip}>
      {children}
    </span>
  );
}

const SENTIMENT_TEXT = { positive: 'Positive', negative: 'Negative', neutral: 'Neutral' };

export function SentimentBadge({ label, confidence }) {
  const text = SENTIMENT_TEXT[label] || 'Neutral';
  const title = confidence !== undefined ? `Model confidence: ${Math.round(confidence * 100)}%` : undefined;
  return <span className={`badge sent ${label || 'neutral'}`} title={title}>{text}</span>;
}

/* Share of positive, neutral and negative headlines as one bar. */
export function SentimentBar({ counts }) {
  const total = counts.positive + counts.neutral + counts.negative || 1;
  const pct = (n) => `${(n / total) * 100}%`;
  return (
    <div
      className="sent-bar"
      role="img"
      aria-label={`${counts.positive} positive, ${counts.neutral} neutral, ${counts.negative} negative headlines`}
    >
      <span className="seg positive" style={{ width: pct(counts.positive) }} />
      <span className="seg neutral" style={{ width: pct(counts.neutral) }} />
      <span className="seg negative" style={{ width: pct(counts.negative) }} />
    </div>
  );
}

/* Average tone from -1 (negative) to +1 (positive). */
export function ToneMeter({ score }) {
  if (score === null || score === undefined) return <span className="muted">No headlines yet</span>;
  const left = ((score + 1) / 2) * 100;
  return (
    <div className="tone-meter" role="img" aria-label={`Average tone ${score.toFixed(2)}, from -1 negative to +1 positive`}>
      <div className="tone-track">
        <span className="tone-marker" style={{ left: `${left}%` }} />
      </div>
      <div className="tone-scale">
        <span>Negative</span>
        <span className="tone-val">{score > 0 ? '+' : ''}{score.toFixed(2)}</span>
        <span>Positive</span>
      </div>
    </div>
  );
}

/* A headline with the words that drove the lexicon score underlined. Transformer scores have no word-level highlights. */
export function Highlighted({ text, tokens }) {
  if (!tokens || tokens.length === 0) return <>{text}</>;
  const parts = [];
  let last = 0;
  tokens.forEach((t, i) => {
    if (t.start > last) parts.push(<span key={`g${i}`}>{text.slice(last, t.start)}</span>);
    const word = text.slice(t.start, t.end);
    if (t.polarity > 0) parts.push(<mark key={`t${i}`} className="hl-positive">{word}</mark>);
    else if (t.polarity < 0) parts.push(<mark key={`t${i}`} className="hl-negative">{word}</mark>);
    else parts.push(<span key={`t${i}`}>{word}</span>);
    last = t.end;
  });
  if (last < text.length) parts.push(<span key="tail">{text.slice(last)}</span>);
  return <>{parts}</>;
}
