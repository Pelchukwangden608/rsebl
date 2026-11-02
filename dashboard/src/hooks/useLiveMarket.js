import { useEffect, useState } from 'react';
import { applyLiveToPeers, fetchLiveMarket } from '../lib/live.js';

/*
 * Loads live prices when the dashboard opens, then refreshes every minute while it stays open.
 * status: 'loading' | 'live' | 'partial' | 'stale' | 'offline'
 *   live     all RSEB sources answered
 *   partial  some sources answered, others failed
 *   stale    RSEB could not be reached now, showing the last live result
 *   offline  the backend is unreachable and no live result has been loaded yet
 */
export default function useLiveMarket(intervalMs = 60_000) {
  const [state, setState] = useState({ status: 'loading', fetchedAt: null, errors: {}, updated: 0 });

  useEffect(() => {
    let cancelled = false;
    let timer;
    const controller = new AbortController();

    const load = async () => {
      try {
        const live = await fetchLiveMarket(controller.signal);
        if (cancelled) return;
        const updated = applyLiveToPeers(live);
        const status = live.stale ? 'stale' : live.ok ? 'live' : updated ? 'partial' : 'offline';
        setState({ status, fetchedAt: live.fetchedAt, errors: live.errors || {}, updated });
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return;
        setState((s) => ({ ...s, status: s.fetchedAt ? 'stale' : 'offline', errors: { service: err.message } }));
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

  return state;
}
