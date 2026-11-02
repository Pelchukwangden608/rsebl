import { news } from '../data.js';
import { scoreHeadline } from './sentiment.js';

/* Every headline scored once with the lexicon engine. The FinBERT engine is applied on top of this in the sentiment context. */
export const lexiconNews = news.map((n) => ({ ...n, sentiment: { ...scoreHeadline(n.headline), engine: 'lexicon' } }));

/** Counts labels for a list of items that carry a sentiment object. */
export function sentimentCounts(items) {
  const counts = { positive: 0, neutral: 0, negative: 0 };
  items.forEach((i) => { counts[i.sentiment.label] += 1; });
  return counts;
}

/** How often the engine's label matches the tag stored in the dataset. */
export function agreementOf(items) {
  // Only headlines that carry an original tone tag can be compared. Live headlines have none.
  const tagged = items.filter((n) => n.tone);
  const agree = tagged.filter((n) => n.sentiment.label === n.tone).length;
  return { agree, total: tagged.length, pct: tagged.length ? Math.round((agree / tagged.length) * 100) : 0 };
}
