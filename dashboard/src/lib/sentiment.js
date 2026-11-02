/*
 * Headline sentiment model: a finance-tuned lexicon scorer.
 *
 * Why this model: the dashboard runs fully in the browser with no server and no
 * model download. Transformer models such as FinBERT are stronger on long, varied
 * text, but they need a ~400 MB model file and a backend. For short market headlines
 * (usually 8–20 words), a domain-specific lexicon with negation and intensifier rules
 * is accurate, fast, and explainable: every label can point at the words that caused it.
 *
 * Word lists follow the spirit of the Loughran–McDonald financial sentiment dictionary.
 */

const POSITIVE = new Set(`
  gain gains gained gaining rise rises rising rose growth grow grows growing grew
  profit profits profitable profitability strong stronger strength strengthen
  improve improves improved improvement improving boost boosted surge surged surges
  rally rallied dividend dividends expand expansion expanded outperform outperformed
  upgrade upgraded beat beats exceed exceeded success successful successfully
  positive optimistic optimism recovery recover recovered recovering higher highest
  approve approved approval win wins won award awarded milestone milestones launch
  launched increase increased increases increasing robust healthy solid achieve
  achieved achievement achievements agreement partnership partnerships bonus benefit
  benefits benefited innovation favorable favourable upturn momentum reward rewarded
  best better leading excellent good great inaugurated commissioned opened
`.split(/\s+/).filter(Boolean));

const NEGATIVE = new Set(`
  loss losses lost losing decline declined declines declining decrease decreased
  decreases fall falls fell falling drop drops dropped dropping plunge plunged plunges
  slump slumped slide slid low lower lowest weak weaker weakness weakened risk risks
  risky concern concerns concerned debt default defaulted defaults fraud scam probe
  investigation investigated lawsuit lawsuits suit penalty penalties fine fined delay
  delayed delays delist delisted delisting suspend suspended suspension halt halted
  crisis bearish bear sell-off selloff miss missed misses deficit shortfall poor poorly
  closure shutdown layoff layoffs warning warns warned volatile volatility uncertain
  uncertainty negative pessimistic dispute disputes strike strikes damage damaged damages
  slow slowdown slowing stagnant stagnation fail fails failed failure collapse collapsed
  sluggish underperform underperformed impairment arrears unpaid cut cuts downgrade
  downgraded tumble tumbled sink sank sanctions violation violations illegal complaint
  complaints bankrupt insolvent loss-making
`.split(/\s+/).filter(Boolean));

// Words that flip the polarity of a nearby sentiment word ("not profitable").
const NEGATORS = new Set(['not', 'no', 'never', 'without', 'nor', 'cannot', 'neither', 'unable', 'hardly', "isn't", "didn't", "doesn't", "wasn't"]);

// Words that strengthen the next sentiment word ("sharply lower", "record profit").
const INTENSIFIERS = new Set(['very', 'highly', 'sharply', 'significantly', 'strongly', 'record', 'major', 'huge', 'massive', 'sharp', 'heavily', 'substantially', 'deeply']);

const TOKEN_RE = /[A-Za-z][A-Za-z'-]*/g;

/**
 * Score one headline.
 * @returns {{label: 'positive'|'neutral'|'negative', score: number, confidence: number,
 *            tokens: {text: string, start: number, end: number, polarity: number}[],
 *            pos: number, neg: number}}
 *   score is in [-1, 1]; confidence is in [0, 1] and grows with the amount of evidence.
 */
export function scoreHeadline(text = '') {
  const raw = [...String(text).matchAll(TOKEN_RE)].map((m) => ({
    text: m[0], lower: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length, polarity: 0,
  }));

  let pos = 0;
  let neg = 0;
  raw.forEach((tok, i) => {
    let polarity = POSITIVE.has(tok.lower) ? 1 : NEGATIVE.has(tok.lower) ? -1 : 0;
    if (!polarity) return;

    const preceding = raw.slice(Math.max(0, i - 3), i).map((t) => t.lower);
    if (preceding.some((w) => NEGATORS.has(w))) polarity = -polarity * 0.8;

    const boosted = i > 0 && INTENSIFIERS.has(raw[i - 1].lower);
    const weight = polarity * (boosted ? 1.5 : 1);

    tok.polarity = Math.sign(polarity);
    if (weight > 0) pos += weight; else neg += -weight;
  });

  const total = pos + neg;
  const score = total === 0 ? 0 : (pos - neg) / total;
  const label = total === 0 ? 'neutral' : score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';
  const confidence = total === 0 ? 0 : Math.min(1, total / 2) * (0.5 + 0.5 * Math.abs(score));

  return {
    label,
    score: Math.round(score * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    tokens: raw.map(({ text, start, end, polarity }) => ({ text, start, end, polarity })),
    pos,
    neg,
  };
}

/** Average score across a list of headline scores; null when the list is empty. */
export function averageScore(scores) {
  if (!scores.length) return null;
  return Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 100) / 100;
}
