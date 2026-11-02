/*
 * Client for the FinBERT sentiment service (backend/app.py).
 *
 * The dashboard never loads the model itself. It sends headlines to the local
 * Python service, which runs ProsusAI/finbert. Set VITE_SENTIMENT_URL in a .env
 * file to point somewhere else.
 */
export const MODEL_ID = 'ProsusAI/finbert';
export const SERVICE_URL = (import.meta.env.VITE_SENTIMENT_URL || 'http://localhost:8000').replace(/\/$/, '');
const BATCH_SIZE = 32;

/** Asks the service whether FinBERT is ready. Throws if the service cannot be reached. */
export async function fetchHealth() {
  const res = await fetch(`${SERVICE_URL}/health`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`The sentiment service answered with status ${res.status}.`);
  return res.json();
}

/** Scores headlines in batches. Calls onProgress with a value from 0 to 1. */
export async function scoreWithFinbert(texts, onProgress) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${SERVICE_URL}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: chunk }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `The sentiment service answered with status ${res.status}.`);
    }
    const data = await res.json();
    out.push(...data.results);
    onProgress?.(out.length / texts.length);
  }
  return out;
}
