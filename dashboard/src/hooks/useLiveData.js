import { useEffect, useState } from 'react';
import { fetchHistory, fetchNews, mergeHistory } from '../lib/live.js';

/* Loads stored price history for a company, and merges it into the charts. Returns a counter so panels re-render. */
export function useLiveHistory(symbol, intervalMs = 5 * 60_000) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let timer;
    const controller = new AbortController();
    const load = async () => {
      try {
        const data = await fetchHistory(symbol, controller.signal);
        if (!cancelled && data.points.length) {
          mergeHistory(symbol, data.points);
          setVersion((v) => v + 1);
        }
      } catch {
        /* keep the bundled snapshot if the service is unavailable */
      }
      if (!cancelled) timer = setTimeout(load, intervalMs);
    };
    load();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [symbol, intervalMs]);
  return version;
}

/* Loads the latest headlines from the collector. Returns an array (empty until loaded or if unavailable). */
export function useLiveNews(intervalMs = 10 * 60_000) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let cancelled = false;
    let timer;
    const controller = new AbortController();
    const load = async () => {
      try {
        const next = await fetchNews(controller.signal);
        if (!cancelled) setItems(next);
      } catch {
        /* keep the last list */
      }
      if (!cancelled) timer = setTimeout(load, intervalMs);
    };
    load();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [intervalMs]);
  return items;
}
