# RSEBL Market Watch

A dashboard for RSEBL-listed companies: market overview, company detail, comparison, forecasts, price history, and news sentiment. News headlines can be scored with the word list (in the browser) or with FinBERT (ProsusAI/finbert, run locally by a small Python service).

The project has two parts:

- `dashboard/` the React + Vite front end
- `backend/` the FinBERT sentiment service (Python, FastAPI)

The dashboard works without the backend. Only the FinBERT option needs it.

## Requirements

- Node.js 18 or newer
- Python 3.10 or newer
- About 1 GB of free disk space for PyTorch and the FinBERT model (the model file is about 438 MB and downloads on first use)

## 1. Start the FinBERT service (optional, needed for FinBERT)

Open a terminal in the `backend` folder.

Windows (PowerShell):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --port 8000
```

macOS / Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --port 8000
```

Leave this terminal running. The first start downloads the model, which can take a few minutes. The service reports its state at http://localhost:8000/health. Once `"status"` is `"ready"`, FinBERT is available in the dashboard.

## 2. Start the dashboard

Open a second terminal in the `dashboard` folder.

```bash
cd dashboard
npm install
npm run dev
```

Then open **http://localhost:5173** in your browser.

If the FinBERT service runs on a different address, set it before starting the dashboard:

```bash
VITE_SENTIMENT_URL=http://localhost:8000 npm run dev
```

Windows (PowerShell): `$env:VITE_SENTIMENT_URL="http://localhost:8000"; npm run dev`

If you serve the dashboard from another address, add that address to `ALLOWED_ORIGINS` in `backend/app.py`, because the service only accepts requests from listed origins.

## 3. Using the dashboard

- **Market**: summary cards, top gainers, losers and most traded companies, and the full table. Use the search box, sector chips and "Save" buttons to filter. Download CSV exports the current table.
- **Company**: pick a company (the search box at the top, or press `/`). Shows price history, key figures and news for that company.
- **Compare**: put several companies side by side.
- **Forecast**: model estimates for the selected company. These are estimates, not advice.
- **History**: the price timeline for the selected company.
- **News and sentiment**: choose a reading engine.
  - *Word list* works immediately and shows the words behind each label.
  - *FinBERT* uses the local service. If it is not running, the page explains this and shows the word list instead. Start the service, then select **Retry**.
- The theme button switches between dark and light mode. Your choices are remembered in the browser.

## Live market data

The backend reads current prices, market movers, market stats and the BSI index from RSEB's public website (`https://rsebl.org.bt/api/v2/...`) and serves them at `GET /api/live/market`. The dashboard loads this when it opens and refreshes every minute. A banner at the top shows whether the prices are live, stale, or the saved snapshot.

- The backend must be able to reach `rsebl.org.bt`. Test it with `curl http://localhost:8000/api/live/market`. The response has `ok`, `fetchedAt` and per-source `errors`.
- Results are cached for 60 seconds (`LIVE_CACHE_SECONDS`). If RSEB is unreachable, the last good result is returned with `"stale": true`.
- Set `VITE_API_URL` in `dashboard/.env` if the backend runs somewhere other than `http://localhost:8000` (see `.env.example`).
- Run the tests with `cd backend && pytest tests/`. They use saved copies of RSEB's responses, so they don't need internet access.

Not yet live: price history beyond the saved snapshot, and news. RSEB's news page does not return a data feed.

## Notes on sentiment

- The word list reads each headline with a finance-tuned list of positive and negative words, with rules for negation ("not", "no") and emphasis ("sharply", "record").
- FinBERT is a neural network pretrained on financial text. It usually handles phrasing the word list misses, but it still labels some headlines differently from a human.
- Agreement figures are measured against the tags in the dataset. Most tags are neutral, so treat the agreement figure as a rough guide.

## Troubleshooting

- **"The FinBERT service is not reachable"**: the backend is not running, or it is on a different port. Check that `uvicorn` is running and that http://localhost:8000/health opens.
- **Status stays "loading"** for a long time: the first model download is still in progress. Check the backend terminal.
- **Port already in use**: pick another port, for example `uvicorn app:app --port 8001`, and set `VITE_SENTIMENT_URL` to match.
- **Browser console shows a blocked request**: this is expected when the service is not running.

## Disclaimer

This site is not affiliated with RSEBL. Prices come from RSEBL. Forecasts and sentiment are model estimates for information only, not investment advice.
