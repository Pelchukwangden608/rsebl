"""
Local database for live data: price snapshots, one closing price per day, and news items.

The database is a single SQLite file. Its location comes from RSEBL_DB (default data/rsebl.db).
Every function opens the shared connection lazily, so tests can point RSEBL_DB at a temporary file.
"""
import json
import os
import sqlite3
import threading
from pathlib import Path

DEFAULT_PATH = Path(__file__).resolve().parent / "data" / "rsebl.db"
SEED_DIR = Path(__file__).resolve().parent / "seed"

SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots (
    symbol TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    price REAL,
    change REAL,
    pct_change REAL,
    PRIMARY KEY (symbol, fetched_at)
);
CREATE TABLE IF NOT EXISTS daily_prices (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    close REAL NOT NULL,
    source TEXT NOT NULL,
    PRIMARY KEY (symbol, date)
);
CREATE TABLE IF NOT EXISTS news (
    url TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    published TEXT,
    fetched_at TEXT NOT NULL,
    symbols TEXT NOT NULL DEFAULT '[]'
);
"""

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None
_conn_path: str | None = None


def connect() -> sqlite3.Connection:
    """Returns the shared connection, creating the database and tables on first use."""
    global _conn, _conn_path
    path = os.environ.get("RSEBL_DB") or str(DEFAULT_PATH)
    with _lock:
        if _conn is None or _conn_path != path:
            if _conn is not None:
                _conn.close()
            if path != ":memory:":
                Path(path).parent.mkdir(parents=True, exist_ok=True)
            _conn = sqlite3.connect(path, check_same_thread=False)
            _conn.row_factory = sqlite3.Row
            _conn.executescript(SCHEMA)
            _conn_path = path
            _seed_history(_conn)
        return _conn


def _seed_history(conn: sqlite3.Connection) -> None:
    """Loads the bundled daily price histories (seed/*.json) the first time they are needed."""
    for seed_file in sorted(SEED_DIR.glob("*.json")):
        if seed_file.name == "companies.json":
            continue
        data = json.loads(seed_file.read_text())
        symbol = data["symbol"]
        conn.executemany(
            "INSERT OR IGNORE INTO daily_prices (symbol, date, close, source) VALUES (?, ?, ?, ?)",
            [(symbol, p["date"], float(p["price"]), data.get("source", "seed")) for p in data["points"]],
        )
    conn.commit()


def record_snapshot(symbol: str, fetched_at: str, price, change, pct_change, date: str) -> None:
    """Stores one live price. The day's closing price becomes the most recent live price for that day."""
    if price is None:
        return
    with _lock:
        conn = connect()
        conn.execute(
            "INSERT OR REPLACE INTO snapshots (symbol, fetched_at, price, change, pct_change) VALUES (?, ?, ?, ?, ?)",
            (symbol, fetched_at, price, change, pct_change),
        )
        conn.execute(
            "INSERT INTO daily_prices (symbol, date, close, source) VALUES (?, ?, ?, 'live') "
            "ON CONFLICT(symbol, date) DO UPDATE SET close = excluded.close, source = 'live' WHERE daily_prices.source = 'live'",
            (symbol, date, price),
        )
        conn.commit()


def history(symbol: str) -> list[dict]:
    with _lock:
        rows = connect().execute(
            "SELECT date, close, source FROM daily_prices WHERE symbol = ? ORDER BY date", (symbol,)
        ).fetchall()
    return [{"date": r["date"], "price": r["close"], "source": r["source"]} for r in rows]


def save_news(items: list[dict], fetched_at: str) -> int:
    """Stores news items. Returns how many were new (by URL)."""
    new = 0
    with _lock:
        conn = connect()
        for it in items:
            cur = conn.execute(
                "INSERT OR IGNORE INTO news (url, title, source, published, fetched_at, symbols) VALUES (?, ?, ?, ?, ?, ?)",
                (it["url"], it["title"], it["source"], it.get("published"), fetched_at, json.dumps(it.get("symbols", []))),
            )
            new += cur.rowcount
        conn.commit()
    return new


def news(symbol: str | None = None, limit: int = 100) -> list[dict]:
    with _lock:
        rows = connect().execute(
            "SELECT url, title, source, published, symbols FROM news ORDER BY COALESCE(published, fetched_at) DESC LIMIT ?",
            (max(1, min(limit, 500)) * (5 if symbol else 1),),
        ).fetchall()
    out = []
    for r in rows:
        symbols = json.loads(r["symbols"])
        if symbol and symbol not in symbols:
            continue
        out.append({"url": r["url"], "title": r["title"], "source": r["source"], "published": r["published"], "symbols": symbols})
        if len(out) >= limit:
            break
    return out
