import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { lexiconNews, agreementOf } from '../lib/news.js';
import { scoreHeadline } from '../lib/sentiment.js';
import { fetchHealth, scoreWithFinbert } from '../lib/neural.js';
import usePersisted from './usePersisted.js';

const SentimentContext = createContext(null);

/**
 * Chooses the sentiment engine ("lexicon" or "finbert") and provides scored headlines to every panel.
 * FinBERT scores come from the local Python service. If it is not running, the word list is used.
 */
export function SentimentProvider({ children, liveNews = [] }) {
  const [engine, setEngine] = usePersisted('rsebl.engine', 'lexicon', (v) => v === 'lexicon' || v === 'finbert');
  const [loader, setLoader] = useState({ status: 'idle', error: null, progress: 0 });
  const [byHeadline, setByHeadline] = useState(null);
  const [attempt, setAttempt] = useState(0);

  // Bundled news plus headlines collected live from the outlets. A live headline is listed once per company it mentions.
  const allNews = useMemo(() => {
    const live = liveNews.flatMap((i) =>
      (i.symbols.length ? i.symbols : [null]).map((symbol) => ({
        symbol,
        headline: i.title,
        date: i.published || '',
        outlet: i.source,
        url: i.url,
        live: true,
        sentiment: { ...scoreHeadline(i.title), engine: 'lexicon' },
      })),
    );
    return [...lexiconNews, ...live];
  }, [liveNews]);

  useEffect(() => {
    if (engine !== 'finbert' || byHeadline) return undefined;
    let cancelled = false;
    const unique = [...new Set(allNews.map((n) => n.headline))];

    (async () => {
      setLoader({ status: 'checking', error: null, progress: 0 });
      try {
        const health = await fetchHealth();
        if (cancelled) return;
        if (health.status === 'loading') {
          setLoader({ status: 'loading', error: null, progress: 0 });
          return;
        }
        if (health.status !== 'ready') {
          setLoader({ status: 'unavailable', error: health.error || 'The model could not be loaded.', progress: 0 });
          return;
        }
        setLoader({ status: 'scoring', error: null, progress: 0 });
        const results = await scoreWithFinbert(unique, (p) => !cancelled && setLoader((l) => ({ ...l, progress: Math.round(p * 100) })));
        if (!cancelled) {
          setByHeadline(new Map(unique.map((h, i) => [h, results[i]])));
          setLoader({ status: 'ready', error: null, progress: 100 });
        }
      } catch (err) {
        if (!cancelled) {
          // A network failure is a TypeError; anything else is a reason the service gave us.
          const fromServer = err && !(err instanceof TypeError) && err.message;
          setLoader(
            fromServer
              ? { status: 'unavailable', error: err.message, progress: 0 }
              : { status: 'offline', error: 'The FinBERT service is not reachable. Check that it is running, then select Retry.', progress: 0 },
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [engine, byHeadline, attempt, allNews]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const usingFinbert = engine === 'finbert' && byHeadline !== null;

  const items = useMemo(
    () =>
      allNews.map((n) => {
        if (!usingFinbert) return n;
        const s = byHeadline.get(n.headline);
        return s ? { ...n, sentiment: { ...s, tokens: [], engine: 'finbert' } } : n;
      }),
    [usingFinbert, byHeadline, allNews],
  );

  const value = {
    engine,
    setEngine,
    engineInUse: usingFinbert ? 'finbert' : 'lexicon',
    loader,
    retry,
    items,
    agreement: agreementOf(items),
  };

  return <SentimentContext.Provider value={value}>{children}</SentimentContext.Provider>;
}

export function useSentimentData() {
  const ctx = useContext(SentimentContext);
  if (!ctx) throw new Error('useSentimentData must be used inside SentimentProvider');
  return ctx;
}
