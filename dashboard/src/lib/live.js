/*
 * Live market data. The dashboard asks the backend (backend/live.py) for current
 * prices, which the backend reads from RSEB. Set VITE_API_URL in .env if the backend
 * runs somewhere other than http://localhost:8000.
 */
import { peers, priceHistory } from '../data.js';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

export async function fetchLiveMarket(signal) {
  const res = await fetch(`${API_URL}/api/live/market`, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`The live data service answered with status ${res.status}.`);
  return res.json();
}

/**
 * Copies live prices into the peer records the panels already read, so every
 * panel updates without changes. Returns how many companies were updated.
 */
export function applyLiveToPeers(live) {
  if (!live?.stocks) return 0;
  const bySymbol = new Map(live.stocks.map((s) => [s.symbol, s]));
  let updated = 0;
  peers.forEach((p) => {
    const s = bySymbol.get(p.symbol);
    if (!s) return;
    p.price = s.price;
    p.change = s.change;
    p.pct_change = s.pctChange;
    updated += 1;
  });
  return updated;
}

/* ---------- price history and news ---------- */

export async function fetchHistory(symbol, signal) {
  const res = await fetch(`${API_URL}/api/history/${encodeURIComponent(symbol)}`, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`History for ${symbol} is not available (status ${res.status}).`);
  return res.json();
}

export async function fetchNews(signal) {
  const res = await fetch(`${API_URL}/api/news?limit=200`, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`News is not available (status ${res.status}).`);
  return (await res.json()).items;
}

/**
 * Merges stored prices into the chart data. Stored prices replace older values for the same day.
 * The bundled snapshot keeps the years before the collector started.
 */
export function mergeHistory(symbol, points) {
  const byDate = new Map((priceHistory[symbol] || []).map((p) => [p.date, p.price]));
  points.forEach((p) => byDate.set(p.date, p.price));
  priceHistory[symbol] = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, price]) => ({ date, price }));
  return priceHistory[symbol].length;
}
