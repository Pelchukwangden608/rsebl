/* Number formatting and small utilities shared across panels. */

export const fmt = (n, d = 2) =>
  n === null || n === undefined || Number.isNaN(Number(n))
    ? 'N/A'
    : Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

export const signed = (n, d = 2) => (n > 0 ? '+' : '') + fmt(n, d);

export const clsOf = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : 'flat');

const MULTIPLIER = { K: 1e3, M: 1e6, B: 1e9 };

/** Parses market-cap strings such as "241.713M" or "1.440B" into a number. */
export function parseCap(s) {
  const m = /^([\d.,]+)\s*([KMB]?)/i.exec(String(s ?? '').trim());
  if (!m) return null;
  return parseFloat(m[1].replace(/,/g, '')) * (MULTIPLIER[m[2].toUpperCase()] || 1);
}

/** Compact Nu. amounts for large totals, e.g. "Nu. 1.23B". */
export function formatBigNu(v) {
  if (v === null || v === undefined) return 'N/A';
  if (v >= 1e9) return `Nu. ${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `Nu. ${(v / 1e6).toFixed(1)}M`;
  return `Nu. ${fmt(v, 0)}`;
}

/** Percentage change between the first and last value of a series. */
export function pctChange(first, last) {
  if (!first || last === null || last === undefined) return null;
  return ((last - first) / first) * 100;
}

/** Triggers a CSV download in the browser. */
export function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* localStorage wrappers. Storage can be blocked (private mode), so every access is guarded. */
export function readStored(key, fallback) {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the dashboard still works without remembering preferences */
  }
}
